import type {AppServicesForSvelte} from '~/app/types';
import type {ProfileSettingsUpdate, ProfileSettingsView} from '~/common/model/types/settings';
import type {ReadonlyUint8Array} from '~/common/types';

/**
 * Props accepted by the `ProfileSettings` component.
 */
export interface ProfileSettingsProps {
    readonly actions: {
        readonly updateSettings: (update: ProfileSettingsUpdate) => void;
        readonly updateProfilePicture: (profilePicture: ReadonlyUint8Array | undefined) => void;
    };
    readonly services: AppServicesForSvelte;
    readonly settings: ProfileSettingsView;
}
