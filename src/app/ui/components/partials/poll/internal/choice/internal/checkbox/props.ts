/**
 * Props accepted by the `Checkbox` component.
 */
export interface CheckboxProps {
    readonly id: string;
    readonly text: string;
    readonly checked: boolean;
    readonly disabled: boolean;
    readonly oncheck: (checked: boolean) => void;
}
