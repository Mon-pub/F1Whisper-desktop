import type {AppServicesForSvelte} from '~/app/types';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';
import type {ProfileSettingsUpdate, ProfileSettingsView} from '~/common/model/types/settings';
import type {ReadonlyUint8Array} from '~/common/types';

/**
 * Props accepted by the `ProfileSettings` component.
 */
export interface ProfileSettingsProps {
    readonly actions: {
        readonly updateSettings: (update: ProfileSettingsUpdate) => void;
        readonly updateProfilePicture: (profilePicture: ReadonlyUint8Array | undefined) => void;
        readonly updateNickname: (nickname: string) => void;
        /**
         * Update the profile-picture sharing policy (F1Whisper fork, FU-H07). Standalone
         * identities can edit this directly; it is no longer mobile-only.
         */
        readonly updateProfilePictureShareWith: (shareWith: ProfilePictureShareWith) => void;
    };
    readonly services: AppServicesForSvelte;
    readonly settings: ProfileSettingsView;
}
