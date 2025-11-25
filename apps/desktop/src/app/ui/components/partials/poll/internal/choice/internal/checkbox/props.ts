/**
 * Props accepted by the `Checkbox` component.
 */
export interface CheckboxProps {
    readonly checked: boolean;
    readonly disabled: boolean;
    readonly id: string;
    readonly oncheck?: (checked: boolean) => void;
    readonly onclick?: (event: MouseEvent) => void;
    readonly onkeyup?: (event: KeyboardEvent) => void;
    readonly onkeydown?: (event: KeyboardEvent) => void;
    readonly text: string;
}
