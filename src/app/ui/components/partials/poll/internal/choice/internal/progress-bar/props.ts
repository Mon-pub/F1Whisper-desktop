import type {u53} from '~/common/types';

/**
 * Props accepted by the `ProgressBar` component.
 */
export interface ProgressBarProps {
    readonly disabled: boolean;
    readonly value: u53;
}
