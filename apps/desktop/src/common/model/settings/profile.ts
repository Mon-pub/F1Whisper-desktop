import type {RawKey} from '@threema/crypto';
import type {WorkProperties} from '@threema/libthreema-wasm';
import type {u53} from '@threema/ts-utils/integer/u53';
import {AsyncLock} from '@threema/ts-utils/lock/async-lock';
import {ensureError} from '@threema/ts-utils/meta/ensure-error';

import type {DbPendingUserProfileSync} from '~/common/db';
import {WorkAvailabilityStatusCategory} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model';
import type {
    ProfileSettings,
    ProfileSettingsController,
    ProfileSettingsView,
} from '~/common/model/types/settings';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import {encryptAndUploadBlob} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import {
    enrollPendingUserProfilePictureDistributions,
    profilePictureGenerationsEqual,
    readProfilePictureGeneration,
} from '~/common/network/protocol/task/common/user-profile-distribution';
import {OutgoingUserProfilePictureBroadcastTask} from '~/common/network/protocol/task/csp/outgoing-user-profile-picture-broadcast';
import {schedulePendingUserProfileSync} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync-transaction';
import {ReflectWorkAvailabilityStatusSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-work-availability-status-sync-transaction';
import {WorkPropertiesUpdateTask} from '~/common/network/protocol/task/libthreema/work-properties-update';
import {ensureIdentityString, type IdentityString} from '~/common/network/types';
import type {ClientKey} from '~/common/network/types/keys';
import {assert, unreachable} from '~/common/utils/assert';
import {mapToString} from '~/common/utils/availability-status';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

/**
 * F1Whisper fork: broadcast the profile picture change to all release-policy-allowed contacts right
 * away, instead of waiting for the next outgoing message to each contact to lazily pick it up. See
 * {@link OutgoingUserProfilePictureBroadcastTask}. Best-effort: local persistence is complete and
 * D2D multi-device sync has durable retry intent before this runs, so a broadcast failure (e.g.
 * temporarily offline) is logged, not thrown. The pending table and lazy per-message distribution
 * remain recovery paths.
 */
function broadcastProfilePictureChange(services: ServicesForModel, log: Logger): void {
    const task = new OutgoingUserProfilePictureBroadcastTask(services);
    services.taskManager.schedule(task).catch((error: unknown) => {
        log.warn(
            `Broadcasting the profile picture change to contacts failed (will still be picked up lazily on the next message to each contact): ${ensureError(error).message}`,
        );
    });
}

/**
 * Sharing policy for the user's own profile picture.
 */
export type ProfilePictureShareWith =
    | {readonly group: 'nobody'}
    | {readonly group: 'everyone'}
    | {readonly group: 'allowList'; readonly allowList: readonly IdentityString[]};

export class ProfileSettingsModelController implements ProfileSettingsController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public readonly lifetimeGuard = new ModelLifetimeGuard<ProfileSettingsView>();

    /** @inheritdoc */
    public readonly update: ProfileSettingsController['update'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        fromSync: (handle, change) => {
            const previousGeneration = readProfilePictureGeneration(this._services);
            const invalidatesLocalSync =
                Object.hasOwn(change, 'profilePicture') ||
                Object.hasOwn(change, 'profilePictureShareWith');
            this.lifetimeGuard.update((view) => {
                const updated = {...view, ...change};
                return invalidatesLocalSync
                    ? this._services.db.persistAuthoritativeProfileSettings(updated)
                    : this._services.db.setSettings('profile', updated);
            });
            if (invalidatesLocalSync) {
                ++this._profilePicturePolicyRevision;
            }
            if (
                !profilePictureGenerationsEqual(
                    readProfilePictureGeneration(this._services),
                    previousGeneration,
                )
            ) {
                // Do not reflect an echo, but supersede durable CSP intent so recovery distributes
                // the authoritative picture/policy received from the other device.
                enrollPendingUserProfilePictureDistributions(this._services);
            }
        },
        direct: (change) => {
            this.lifetimeGuard.update((view) =>
                this._services.db.setSettings('profile', {
                    ...view,
                    ...change,
                }),
            );
        },
    };

    /** @inheritdoc */
    public readonly setProfilePicture: ProfileSettingsController['setProfilePicture'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        fromLocal: async (profilePicture) => {
            const version = ++this._profilePicturePolicyRevision;

            const initialPending = this._persistLocalProfileChange({
                profilePicture: {blob: profilePicture},
            });
            const uploadGeneration = readProfilePictureGeneration(this._services);
            // Persist recipient reconciliation before upload. If upload fails or the process exits,
            // startup recovery can upload the stored bytes and complete current-state distribution.
            enrollPendingUserProfilePictureDistributions(this._services);

            const blobInfo = await encryptAndUploadBlob(
                this._services,
                profilePicture,
                BLOB_FILE_NONCE,
                'public-persistent',
            );
            if (
                version !== this._profilePicturePolicyRevision ||
                !this._services.persistentProtocolState.hasPendingUserProfileSync(
                    initialPending.generation,
                ) ||
                !profilePictureGenerationsEqual(
                    readProfilePictureGeneration(this._services),
                    uploadGeneration,
                )
            ) {
                this._log.info(
                    'A newer local or reflected profile change superseded this upload, abandoning',
                );
                return;
            }

            const lastUploadedAt = new Date();
            // U-H04: persist the just-uploaded blob info BEFORE reflecting, so the CSP contact
            // distribution steps (`profilePictureDistributionSteps`) see an already-uploaded picture
            // and reuse this blob instead of uploading the same bytes to the blob server a second
            // time.
            const pending = this._persistLocalProfileChange({
                profilePicture: {
                    blob: profilePicture,
                    blobId: blobInfo.id,
                    key: blobInfo.key,
                    lastUploadedAt,
                },
            });

            // PR3-H05: uploaded metadata is now durable. Enroll every currently required recipient
            // action synchronously before waiting for D2D reflection or CSP availability.
            enrollPendingUserProfilePictureDistributions(this._services);

            this._schedulePendingProfileSync(pending);
            if (version !== this._profilePicturePolicyRevision) {
                this._log.info(
                    'A newer profile picture change superseded this one before broadcast scheduling',
                );
                return;
            }

            // F1Whisper fork: broadcast the new picture to contacts right away (see
            // `broadcastProfilePictureChange`), instead of leaving it to the next outgoing message.
            broadcastProfilePictureChange(this._services, this._log);
        },
    };

    /** @inheritdoc */
    public readonly removeProfilePicture: ProfileSettingsController['removeProfilePicture'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        // Persistent scheduling is intentionally detached so offline edits resolve immediately.
        // eslint-disable-next-line @typescript-eslint/require-await
        fromLocal: async () => {
            const version = ++this._profilePicturePolicyRevision;

            const pending = this._persistLocalProfileChange({profilePicture: undefined});

            // Persist privacy cleanup before the first D2D/network wait so restart/offline cannot
            // lose the removal.
            enrollPendingUserProfilePictureDistributions(this._services);

            this._schedulePendingProfileSync(pending);
            if (version !== this._profilePicturePolicyRevision) {
                this._log.info(
                    'A newer profile picture change superseded this removal before broadcast scheduling',
                );
                return;
            }

            // F1Whisper fork: broadcast the removal to contacts right away (see
            // `broadcastProfilePictureChange`), instead of leaving it to the next outgoing message.
            broadcastProfilePictureChange(this._services, this._log);
        },
    };

    /** @inheritdoc */
    public readonly setProfilePictureShareWith: ProfileSettingsController['setProfilePictureShareWith'] =
        {
            [TRANSFER_HANDLER]: PROXY_HANDLER,

            // Persistent scheduling is intentionally detached so offline edits resolve immediately.
            // eslint-disable-next-line @typescript-eslint/require-await
            fromLocal: async (shareWith) => {
                ++this._profilePicturePolicyRevision;
                const pending = this._persistLocalProfileChange({
                    profilePictureShareWith: shareWith,
                });

                // Persist the newly desired SET/DELETE actions before D2D reflection. This also
                // supersedes any uncertain in-flight action for the previous policy.
                enrollPendingUserProfilePictureDistributions(this._services);

                // Reflection is generation-bound and persistent. Do not await it: disconnected
                // persistent tasks remain pending until reconnect, while the DB row also survives a
                // process exit and is reconstructed by startup recovery.
                this._schedulePendingProfileSync(pending);

                // FU-H07: the sharing policy is half of the profile-picture distribution generation,
                // so a policy change must redistribute -- newly allowed contacts receive the current
                // picture, newly excluded contacts receive a delete-profile-picture. The broadcast
                // re-reads the (now-updated) policy and, via its own generation revalidation, a later
                // change safely supersedes this one. Best-effort like the avatar-set broadcast; the
                // lazy per-message distribution remains a fallback.
                broadcastProfilePictureChange(this._services, this._log);
            },
        };

    /** @inheritdoc */
    public readonly setWorkAvailabilityStatus: ProfileSettingsController['setWorkAvailabilityStatus'] =
        {
            [TRANSFER_HANDLER]: PROXY_HANDLER,

            fromLocal: async (value) => {
                assert(
                    // Only supported in Work variants for now.
                    //
                    // eslint-disable-next-line threema/compare-work-and-custom
                    import.meta.env.BUILD_VARIANT === 'work',
                    'Setting availability status is supported only in Threema Work',
                );

                await this._lock.with(async () => {
                    const workAvailabilityStatus: WorkAvailabilityStatus = {
                        category: value.category,
                        // Per protocol, "No status" must not carry a description.
                        description:
                            value.category === WorkAvailabilityStatusCategory.NONE
                                ? ''
                                : value.description.trim(),
                    };

                    const precondition = (): boolean => this.lifetimeGuard.active.get();

                    // The following steps all run inside a single transaction:
                    //
                    // 1. Reflect.
                    // 2. Push to the Work server (post-reflect hook).
                    const postReflectHook = async (): Promise<void> => {
                        // Gather prerequisite values at the start. Any prerequisites that may fail
                        // must throw here, so that nothing has been committed or persisted yet and
                        // the state is therefore still consistent.
                        const workData = this._services.device.workData?.get();
                        assert(workData !== undefined);
                        const identity = ensureIdentityString(
                            this._services.device.identity.string,
                        );
                        const workServerBaseUrl = this._services.config.WORK_SERVER_URL;
                        const workProperties: WorkProperties = {
                            availabilityStatus: {
                                category: mapToString(workAvailabilityStatus.category),
                                description:
                                    workAvailabilityStatus.category !==
                                    WorkAvailabilityStatusCategory.NONE
                                        ? workAvailabilityStatus.description
                                        : undefined,
                            },
                        };

                        // 2. Push to the Work server.
                        const createTask = (rawClientKey: RawKey<32>): WorkPropertiesUpdateTask =>
                            new WorkPropertiesUpdateTask(
                                identity,
                                rawClientKey,
                                workProperties,
                                workData,
                                this._services,
                                workServerBaseUrl,
                            );
                        const ck: ClientKey = this._services.device.csp.ck;
                        const libthreemaTask: WorkPropertiesUpdateTask = ck.runWithKey(createTask);

                        const workServerSuccess = await libthreemaTask.run();
                        if (!workServerSuccess) {
                            // Throwing here will also cause the reflection to be discarded.
                            throw new Error(
                                'Failed to push availability status to the Work server',
                            );
                        }
                    };

                    const syncTask = new ReflectWorkAvailabilityStatusSyncTransactionTask(
                        this._services,
                        precondition,
                        postReflectHook,
                        workAvailabilityStatus,
                    );
                    const result = await this._services.taskManager.schedule(syncTask);
                    switch (result) {
                        case 'success':
                            // Persist the change locally.
                            this.update.direct({workAvailabilityStatus});
                            break;
                        case 'aborted':
                            throw new Error(
                                'Failed to update availability status due to synchronization conflict',
                            );
                        default:
                            unreachable(result);
                    }
                });
            },
        };

    private readonly _log: Logger;
    private readonly _lock = new AsyncLock();

    /** Monotonic ordering for every accepted local or reflected picture/policy mutation. */
    private _profilePicturePolicyRevision: u53 = 0;

    public constructor(private readonly _services: ServicesForModel) {
        this._log = _services.logging.logger(`model.settings.profile`);
    }

    /** @inheritdoc */
    public readonly getProfilePicturePolicyRevision = (): u53 => this._profilePicturePolicyRevision;

    /** @inheritdoc */
    public readonly reserveProfilePicturePolicyRevision = (): u53 =>
        ++this._profilePicturePolicyRevision;

    /** Atomically store a complete local profile generation and its durable D2D sync intent. */
    private _persistLocalProfileChange(
        change: Partial<ProfileSettingsView>,
    ): DbPendingUserProfileSync {
        let pending: DbPendingUserProfileSync | undefined;
        this.lifetimeGuard.update((view) => {
            const persisted = this._services.db.persistLocalProfileSettings(
                {...view, ...change},
                new Date(),
            );
            pending = persisted.pending;
            return persisted.settings;
        });
        assert(pending !== undefined, 'Local profile persistence did not produce D2D sync intent');
        return pending;
    }

    /** Queue persistent reflection without making an offline connection block the local edit. */
    private _schedulePendingProfileSync(pending: DbPendingUserProfileSync): void {
        schedulePendingUserProfileSync(this._services, pending.generation, this._log);
    }
}

export class ProfileSettingsModelStore extends ModelStore<ProfileSettings> {
    public constructor(services: ServicesForModel) {
        const {logging} = services;
        const tag = 'settings.profile';
        const profileSettings = services.db.getSettings('profile') ?? {
            nickname: undefined,
            profilePicture: undefined,
            profilePictureShareWith: {group: 'everyone'},
            workAvailabilityStatus: {
                category: WorkAvailabilityStatusCategory.NONE,
                description: '',
            },
        };

        super(profileSettings, new ProfileSettingsModelController(services), undefined, undefined, {
            debug: {
                log: logging.logger(`model.${tag}`),
                tag,
            },
        });
    }
}
