import type {WorkProperties} from '@threema/libthreema-wasm';

import type {RawKey} from '~/common/crypto';
import {WorkAvailabilityStatusCategory} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {ServicesForModel} from '~/common/model';
import type {
    ProfileSettings,
    ProfileSettingsController,
    ProfileSettingsView,
} from '~/common/model/types/settings';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import {encryptAndUploadBlob, type BlobInfo} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import {getDeltaImageMessage} from '~/common/network/protocol/task/d2d';
import type {DeltaImage} from '~/common/network/protocol/task/d2d/group-sync-helper';
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
            await this._lock.with(async () => {
                let blobInfo: BlobInfo | undefined;
                let uploadedAt: Date | undefined;

                const precondition = (): boolean => this.lifetimeGuard.active.get();

                // The following steps all run inside a single transaction:
                //
                // 1. Upload the encrypted blob to the public blob server and build the delta image
                //    (pre-reflect hook). Uploading inside the transaction ensures two of the user's
                //    devices cannot upload a profile picture concurrently. The upload must precede
                //    reflection because the `DeltaImage` carries the resulting `blobId` and `key`.
                // 2. Reflect.
                const preReflectHook = async (): Promise<DeltaImage> => {
                    blobInfo = await encryptAndUploadBlob(
                        this._services,
                        profilePicture,
                        BLOB_FILE_NONCE,
                        'public-persistent',
                    );
                    uploadedAt = new Date();
                    const deltaImage = getDeltaImageMessage({
                        type: 'set',
                        blob: {
                            blobId: blobInfo.id,
                            key: blobInfo.key,
                            nonce: blobInfo.nonce,
                            uploadedAt,
                        },
                    });
                    if (deltaImage === undefined) {
                        throw new Error(
                            'Could not create delta image, abort setting profile picture',
                        );
                    }
                    return deltaImage;
                };

                const syncTask = new ReflectUserProfilePictureSyncTransactionTask(
                    this._services,
                    precondition,
                    preReflectHook,
                );
                const result = await this._services.taskManager.schedule(syncTask);
                switch (result) {
                    case 'success':
                        // Expected to be set at this point, because the task is done.
                        assert(blobInfo !== undefined);
                        assert(uploadedAt !== undefined);

                        // Persist the change locally.
                        this.update.direct({
                            profilePicture: {
                                blob: profilePicture,
                                blobId: blobInfo.id,
                                key: blobInfo.key,
                                lastUploadedAt: uploadedAt,
                            },
                        });
                        break;
                    case 'aborted':
                        throw new Error(
                            'Failed to set profile picture due to synchronization conflict',
                        );
                    default:
                        unreachable(result);
                }
            });
        },
    };

    /** @inheritdoc */
    public readonly removeProfilePicture: ProfileSettingsController['removeProfilePicture'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        fromLocal: async () => {
            await this._lock.with(async () => {
                const precondition = (): boolean => this.lifetimeGuard.active.get();

                // The following steps all run inside a single transaction:
                //
                // 1. Create `DeltaImage` message (pre-reflect hook).
                // 2. Reflect.
                function preReflectHook(): DeltaImage {
                    const deltaImage = getDeltaImageMessage({
                        type: 'removed',
                    });
                    if (deltaImage === undefined) {
                        throw new Error(
                            'Could not create delta image, abort removing profile picture',
                        );
                    }

                    return deltaImage;
                }

                const syncTask = new ReflectUserProfilePictureSyncTransactionTask(
                    this._services,
                    precondition,
                    preReflectHook,
                );
                const result = await this._services.taskManager.schedule(syncTask);
                switch (result) {
                    case 'success':
                        // Persist the change locally.
                        this.update.direct({profilePicture: undefined});
                        break;
                    case 'aborted':
                        throw new Error(
                            'Failed to remove profile picture due to synchronization conflict',
                        );
                    default:
                        unreachable(result);
                }
            });
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

    private readonly _lock = new AsyncLock();

    public constructor(private readonly _services: ServicesForModel) {}
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
