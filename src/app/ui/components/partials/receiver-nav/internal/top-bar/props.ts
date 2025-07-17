/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly onclickaddcontact: () => void;
    readonly onclickaddgroup: () => void;
    readonly onclickback?: (event: MouseEvent) => void;
    readonly onclicksettings?: () => void;
}
