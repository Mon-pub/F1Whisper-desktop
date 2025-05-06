import type {u53} from '~/common/types';

/**
 * Props accepted by the `ProgressBar` component.
 */
export interface ProgressBarProps {
    readonly value: u53;
    readonly disabled: boolean;
}
