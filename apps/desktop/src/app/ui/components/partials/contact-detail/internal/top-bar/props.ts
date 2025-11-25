/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly onclickback?: (event: MouseEvent) => void;
    readonly onclickclose?: (event: MouseEvent) => void;
}
