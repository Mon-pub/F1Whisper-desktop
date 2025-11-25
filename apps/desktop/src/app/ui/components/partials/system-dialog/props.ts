import type {AppServicesForSvelte} from '~/app/types';
import type {Delayed} from '~/common/utils/delayed';

/**
 * Props accepted by the `SystemDialog` component.
 */
export interface SystemDialogProps {
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
