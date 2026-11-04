import type {AppServicesForSvelte} from '~/app/types';

/**
 * Props accepted by the `NavPanelHeader` component.
 */
export interface NavPanelHeaderProps {
    readonly services: Pick<AppServicesForSvelte, 'settings' | 'storage'>;
}
