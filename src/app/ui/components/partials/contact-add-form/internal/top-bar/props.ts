/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly onclickback?: (event: MouseEvent) => void;
    readonly onclickcancel?: (event: MouseEvent) => void;
}
