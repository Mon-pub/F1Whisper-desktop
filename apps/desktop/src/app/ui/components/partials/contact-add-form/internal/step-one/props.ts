/**
 * Props accepted by the `StepOne` component.
 */
export interface StepOneProps {
    readonly identity: string;
    readonly identityFieldError: string | undefined;
    readonly onclickcancel: (event: MouseEvent) => void;
    readonly onclickformcancel?: (event: MouseEvent) => void;
    readonly onformcontinue?: () => void;
}
