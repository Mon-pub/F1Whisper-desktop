import type {f64} from '~/common/types';

export interface WaveformSliderProps {
    readonly disabled?: boolean;
    readonly max: f64;
    readonly min: f64;
    readonly onafterslidermoved?: () => void;
    readonly onbeforeslidermoves?: () => void;
    readonly oninput: (event: Event) => Promise<void>;
    readonly step: f64;
    readonly value: f64;
    /**
     * Contains a measure of strength of the audio signal to be used for rendering an approximation
     * of the audio waves.
     */
    readonly waveformData: readonly f64[];
}
