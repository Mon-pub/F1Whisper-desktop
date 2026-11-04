import {ensureError} from '@threema/ts-utils/meta/ensure-error';
import {u64ToHexLe} from '@threema/ts-utils/number/u64-to-hex-le';

import {ensureNonce} from '~/common/crypto';
import {extractErrorMessage} from '~/common/error';
import type {Logger} from '~/common/logging';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';
import type {ProfileSettingsView} from '~/common/model/types/settings';
import * as protobuf from '~/common/network/protobuf';
import {downloadAndDecryptBlob} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import {
    PASSIVE_TASK,
    type PassiveTask,
    type PassiveTaskCodecHandle,
    type PassiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task/';
import {
    profilePictureGenerationsEqual,
    readProfilePictureGeneration,
} from '~/common/network/protocol/task/common/user-profile-distribution';
import type {D2mDeviceId} from '~/common/network/types';
import type {Mutable} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import {VALITA_EMPTY_STRING, VALITA_NULL, VALITA_UNDEFINED} from '~/common/utils/valita-helpers';

/**
 * Process reflected UserProfileSync messages with an updated user profile.
 */
export class ReflectedUserProfileSyncTask implements PassiveTask<void> {
    public readonly type: PassiveTaskSymbol = PASSIVE_TASK;
    public readonly persist = false;
    private readonly _log: Logger;
    private readonly _senderDeviceIdString: string;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _unvalidatedMessage: protobuf.d2d.UserProfileSync,
        senderDeviceId: D2mDeviceId,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.reflected-user-profile-sync-task`,
        );
        this._senderDeviceIdString = u64ToHexLe(senderDeviceId);
    }

    public async run(handle: PassiveTaskCodecHandle): Promise<void> {
        const {model} = this._services;

        this._log.info(
            `Received reflected UserProfileSync message from ${this._senderDeviceIdString}`,
        );

        // Validate the Protobuf message
        let validatedMessage;
        try {
            validatedMessage = protobuf.validate.d2d.UserProfileSync.SCHEMA.parse(
                this._unvalidatedMessage,
            );
        } catch (error) {
            this._log.error(
                `Discarding reflected UserProfileSync message due to validation error: ${error}`,
            );
            return;
        }

        const profileController = model.user.profileSettings.get().controller;
        const hasPicturePolicyUpdate =
            validatedMessage.update.userProfile.profilePicture !== undefined ||
            validatedMessage.update.userProfile.profilePictureShareWith !== undefined;
        const profileRevision = hasPicturePolicyUpdate
            ? profileController.reserveProfilePicturePolicyRevision()
            : profileController.getProfilePicturePolicyRevision();
        const profileGeneration = readProfilePictureGeneration(this._services);
        const pendingGeneration =
            this._services.persistentProtocolState.getPendingUserProfileSync()?.generation;
        const nicknameUpdate: Mutable<Partial<ProfileSettingsView>> = {};
        this._processUpdateForNickname(validatedMessage, nicknameUpdate);
        if (Object.hasOwn(nicknameUpdate, 'nickname')) {
            // Nickname is independent of picture blob preparation. Apply it in arrival order instead
            // of allowing an older delayed picture to overwrite a newer nickname later.
            profileController.update.fromSync(handle, nicknameUpdate);
        }

        const profileUpdate: Mutable<Partial<ProfileSettingsView>> = {};
        this._processUpdateForProfilePictureShareWith(validatedMessage, profileUpdate);
        const pictureResult = await this._processUpdateForProfilePicture(
            validatedMessage,
            profileUpdate,
        );
        if (pictureResult === 'failed') {
            // Never expand access to the old local picture when its replacement could not be
            // prepared. Restrictive/equal policy still applies so privacy cleanup is not delayed.
            const incomingPolicy = profileUpdate.profilePictureShareWith;
            const currentPolicy = model.user.profileSettings.get().view.profilePictureShareWith;
            if (
                incomingPolicy !== undefined &&
                !isPolicyNoBroaderThan(incomingPolicy, currentPolicy)
            ) {
                delete profileUpdate.profilePictureShareWith;
            }
        }
        // Work availability status is independent of the picture/policy generation checks below, so
        // it is applied even if a superseded picture update is discarded.
        this._processUpdateForWorkAvailabilityStatus(validatedMessage, profileUpdate);

        if (
            (Object.hasOwn(profileUpdate, 'profilePicture') ||
                Object.hasOwn(profileUpdate, 'profilePictureShareWith')) &&
            (!profilePictureGenerationsEqual(
                readProfilePictureGeneration(this._services),
                profileGeneration,
            ) ||
                profileController.getProfilePicturePolicyRevision() !== profileRevision ||
                this._services.persistentProtocolState.getPendingUserProfileSync()?.generation !==
                    pendingGeneration)
        ) {
            this._log.info(
                'Discarding reflected profile picture/policy superseded while preparing its blob; retaining independent fields',
            );
            delete profileUpdate.profilePicture;
            delete profileUpdate.profilePictureShareWith;
        }

        profileController.update.fromSync(handle, profileUpdate);
    }

    private _processUpdateForNickname(
        validatedMessage: protobuf.validate.d2d.UserProfileSync.Type,
        profileUpdate: Mutable<Partial<ProfileSettingsView>>,
    ): void {
        switch (validatedMessage.update.userProfile.nickname) {
            case VALITA_NULL:
            case VALITA_UNDEFINED:
                // Do not update the nickname
                break;
            case VALITA_EMPTY_STRING:
                // Delete the nickname by setting it to undefined
                profileUpdate.nickname = undefined;
                break;

            default:
                profileUpdate.nickname = validatedMessage.update.userProfile.nickname;
                break;
        }
    }

    private _processUpdateForProfilePictureShareWith(
        validatedMessage: protobuf.validate.d2d.UserProfileSync.Type,
        profileUpdate: Mutable<Partial<ProfileSettingsView>>,
    ): void {
        if (validatedMessage.update.userProfile.profilePictureShareWith === undefined) {
            return;
        }
        const {policy, allowList} = validatedMessage.update.userProfile.profilePictureShareWith;
        switch (policy) {
            case 'nobody':
            case 'everyone':
                profileUpdate.profilePictureShareWith = {group: policy};
                break;

            case 'allowList':
                profileUpdate.profilePictureShareWith = {
                    group: policy,
                    allowList: allowList.identities,
                };
                break;

            default:
                unreachable(policy);
        }
    }

    private async _processUpdateForProfilePicture(
        validatedMessage: protobuf.validate.d2d.UserProfileSync.Type,
        profileUpdate: Mutable<Partial<ProfileSettingsView>>,
    ): Promise<'absent' | 'applied' | 'failed'> {
        if (validatedMessage.update.userProfile.profilePicture === undefined) {
            return 'absent';
        }
        switch (validatedMessage.update.userProfile.profilePicture.image) {
            case 'removed':
                profileUpdate.profilePicture = undefined;
                return 'applied';
            case 'updated': {
                const {blob} = validatedMessage.update.userProfile.profilePicture.updated;
                // Download and decrypt public blob
                try {
                    profileUpdate.profilePicture = {
                        blob: await downloadAndDecryptBlob(
                            this._services,
                            this._log,
                            blob.id,
                            blob.key,
                            // TODO(SE-286): Should we use blob.nonce or not?
                            ensureNonce(blob.nonce ?? BLOB_FILE_NONCE),
                            'local',
                            'local',
                        ),
                        blobId: blob.id,
                        lastUploadedAt:
                            validatedMessage.update.userProfile.profilePicture.updated.blob
                                .uploadedAt,
                        key: blob.key,
                    };
                    return 'applied';
                } catch (error) {
                    this._log.warn(
                        `Could not download and decrypt user profile picture: ${extractErrorMessage(
                            ensureError(error),
                            'short',
                        )}`,
                    );
                    return 'failed';
                }
            }

            default:
                return unreachable(validatedMessage.update.userProfile.profilePicture);
        }
    }

    private _processUpdateForWorkAvailabilityStatus(
        validatedMessage: protobuf.validate.d2d.UserProfileSync.Type,
        profileUpdate: Mutable<Partial<ProfileSettingsView>>,
    ): void {
        if (validatedMessage.update.userProfile.workAvailabilityStatus === undefined) {
            return;
        }
        profileUpdate.workAvailabilityStatus =
            validatedMessage.update.userProfile.workAvailabilityStatus;
    }
}

function isPolicyNoBroaderThan(
    candidate: ProfilePictureShareWith,
    current: ProfilePictureShareWith,
): boolean {
    if (candidate.group === 'nobody') {
        return true;
    }
    if (current.group === 'everyone') {
        return true;
    }
    if (candidate.group === 'everyone') {
        return false;
    }
    if (current.group === 'nobody') {
        return candidate.allowList.length === 0;
    }
    return candidate.allowList.every((identity) => current.allowList.includes(identity));
}
