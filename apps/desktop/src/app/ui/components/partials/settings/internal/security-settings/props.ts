import type {AppServicesForSvelte} from '~/app/types';
import type {PrivacySettingsUpdate} from '~/common/model/types/settings';

/**
 * Props accepted by the `SecuritySettings` component.
 */
export interface SecuritySettingsProps {
    readonly services: AppServicesForSvelte;
    readonly actions: {
        readonly updateSettings: (update: PrivacySettingsUpdate) => void;
    };
}
