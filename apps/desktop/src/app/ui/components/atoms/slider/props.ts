import type {f64} from '~/common/types';

/**
 * Props accepted by the `Slider` component.
 */
export interface SliderProps {
    readonly iconLeft?: string;
    readonly iconRight?: string;
    readonly max: f64;
    readonly min: f64;
    readonly onclickleft?: () => void;
    readonly onclickright?: () => void;
    readonly oninput: (event: Event) => Promise<void>;
    readonly step: f64;
    readonly value: f64;
}
