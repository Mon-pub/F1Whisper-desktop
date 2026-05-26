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

                const workAvailabilityStatus: WorkAvailabilityStatus = {
                    category: value.category,
                    // Per protocol, "No status" must not carry a description.
                    description:
                        value.category === WorkAvailabilityStatusCategory.NONE
                            ? ''
                            : value.description.trim(),
                };

                // 1. Push to the Work server.
                const category = mapToString(workAvailabilityStatus.category);
                const description =
                    workAvailabilityStatus.category !== WorkAvailabilityStatusCategory.NONE
                        ? workAvailabilityStatus.description
                        : undefined;

                const workProperties: WorkProperties = {
                    availabilityStatus: {
                        category,
                        description,
                    },
                };

                const identity = ensureIdentityString(this._services.device.identity.string);
                const workServerBaseUrl = this._services.config.WORK_SERVER_URL;

                const workData = this._services.device.workData?.get();
                assert(workData !== undefined);

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
                    throw new Error('Failed to push availability status to the Work server');
                }

                // 2. Reflect to the user's other devices.
                //
                // No need for a precondition to archive or pin.
                const precondition = (): boolean => this.lifetimeGuard.active.get();
                const task = new ReflectWorkAvailabilityStatusSyncTransactionTask(
                    this._services,
                    precondition,
                    workAvailabilityStatus,
                );
                const result = await this._services.taskManager.schedule(task);
                switch (result) {
                    case 'success':
                        break;
                    case 'aborted':
                        throw new Error(
                            'Failed to update availability status due to synchronization conflict',
                        );
                    default:
                        unreachable(result);
                }

                // 3. Persist locally only after the Work-server push and the reflection have both
                //    succeeded.
                this.lifetimeGuard.update((view) =>
                    this._services.db.setSettings('profile', {
                        ...view,
                        workAvailabilityStatus,
                    }),
                );
            },
        };

    private readonly _log: Logger;

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
