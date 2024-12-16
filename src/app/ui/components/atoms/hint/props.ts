/**
 * Props accepted by the `Hint` component.
 */
export interface HintProps {
    /**
     * Id of this element. Note: This must be unique across the entire DOM.
     */
    readonly id: string;
    readonly icon: string;
    readonly text: string;
}
