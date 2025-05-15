import type {AppServicesForSvelte} from '~/app/types';
import type {MediaSettingsUpdate, MediaSettingsView} from '~/common/model/types/settings';

/**
 * Props accepted by the `MediaSettings` component.
 */
export interface MediaSettingsProps {
    readonly actions: {
        readonly updateSettings: (update: MediaSettingsUpdate) => void;
    };
    readonly services: Pick<AppServicesForSvelte, 'blobCache'>;
    readonly settings: MediaSettingsView;
}
