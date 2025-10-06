import type {f64} from '~/common/types';

/**
 * Props accepted by the `Slider` component.
 */
export interface SliderProps {
    min: f64;
    max: f64;
    step: f64;
    value: f64;
    iconLeft?: string;
    iconRight?: string;
    oninput: (event: Event) => Promise<void>;
    onclickleft?: () => void;
    onclickright?: () => void;
}
