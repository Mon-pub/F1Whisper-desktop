import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {AppServicesForSvelte} from '~/app/types';
/**
 * Props accepted by the `SystemDialog` component.
 */
export interface SystemDialogProps {
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
