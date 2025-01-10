/**
 * Props accepted by the `StepOne` component.
 */
export interface StepOneProps {
    readonly identityFieldError: string | undefined;
    readonly identity: string;
    readonly handleNextClicked: () => Promise<void>;
}
