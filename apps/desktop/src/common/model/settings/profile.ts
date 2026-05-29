import type {WorkProperties} from '@threema/libthreema-wasm';

import type {RawKey} from '~/common/crypto';
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
import {getDeltaImageMessage} from '~/common/network/protocol/task/d2d';
import {ReflectUserProfilePictureSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync-transaction';
import {ReflectWorkAvailabilityStatusSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-work-availability-status-sync-transaction';
import {WorkPropertiesUpdateTask} from '~/common/network/protocol/task/libthreema/work-properties-update';
import {ensureIdentityString, type IdentityString} from '~/common/network/types';
import type {ClientKey} from '~/common/network/types/keys';
import {assert, unreachable} from '~/common/utils/assert';
import {mapToString} from '~/common/utils/availability-status';
import {PROXY_HANDLER} from '~/common/utils/endpoint';
import {AsyncLock} from '~/common/utils/lock';

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
            this.update.direct(change);
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
            this.lifetimeGuard.update((view) =>
                this._services.db.setSettings('profile', {
                    ...view,
                    profilePicture: {blob: profilePicture},
                }),
            );

            const blobInfo = await encryptAndUploadBlob(
                this._services,
                profilePicture,
                BLOB_FILE_NONCE,
                'public-persistent',
            );

            const deltaImage = getDeltaImageMessage({
                type: 'set',
                blob: {
                    blobId: blobInfo.id,
                    key: blobInfo.key,
                    nonce: blobInfo.nonce,
                    uploadedAt: new Date(),
                },
            });

            if (deltaImage === undefined) {
                this._log.error('Could not create deltaImage, abort setting profile picture.');
                return;
            }

            // No need for a precondition to archive or pin
            const precondition = (): boolean => this.lifetimeGuard.active.get();
            const task = new ReflectUserProfilePictureSyncTransactionTask(
                this._services,
                precondition,
                deltaImage,
            );
            await this._services.taskManager.schedule(task);
        },
    };

    /** @inheritdoc */
    public readonly removeProfilePicture: ProfileSettingsController['removeProfilePicture'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        fromLocal: async () => {
            this.lifetimeGuard.update((view) =>
                this._services.db.setSettings('profile', {
                    ...view,
                    profilePicture: undefined,
                }),
            );

            const deltaImage = getDeltaImageMessage({
                type: 'removed',
            });

            if (deltaImage === undefined) {
                this._log.error('Could not create deltaImage, abort removing profile picture.');
                return;
            }

            // No need for a precondition to archive or pin
            const precondition = (): boolean => this.lifetimeGuard.active.get();
            const task = new ReflectUserProfilePictureSyncTransactionTask(
                this._services,
                precondition,
                deltaImage,
            );
            await this._services.taskManager.schedule(task);
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

                // Lock concurrent local updates so each user-initiated change is applied in the
                // order it was requested.
                await this._setWorkAvailabilityStatusLock.with(async () => {
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
    private readonly _setWorkAvailabilityStatusLock = new AsyncLock();

    public constructor(private readonly _services: ServicesForModel) {
        this._log = _services.logging.logger(`model.settings.profile`);
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
