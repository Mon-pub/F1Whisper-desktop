import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * Props accepted by the `ProgressBar` component.
 */
export interface ProgressBarProps {
    readonly disabled: boolean;
    readonly value: u53;
}
