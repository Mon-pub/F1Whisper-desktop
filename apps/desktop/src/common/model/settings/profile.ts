import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model';
import type {
    ProfileSettings,
    ProfileSettingsController,
    ProfileSettingsView,
} from '~/common/model/types/settings';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import {encryptAndUploadBlob} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import {getDeltaImageMessage} from '~/common/network/protocol/task/d2d';
import {ReflectUserProfilePictureSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync-transaction';
import type {IdentityString} from '~/common/network/types';
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
        };

        super(profileSettings, new ProfileSettingsModelController(services), undefined, undefined, {
            debug: {
                log: logging.logger(`model.${tag}`),
                tag,
            },
        });
    }
}
