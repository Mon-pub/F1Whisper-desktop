/**
 * Props accepted by the `TabBar` component.
 */
export interface TabBarProps<TId> {
    /** Specify the selected `TId` on render. Defaults to the first entry of the `tabs` array. */
    readonly initiallySelectedId?: TId;
    readonly tabs: Tab<TId>[];
}

interface Tab<TId> {
    readonly disabled?: boolean;
    readonly id: TId;
    readonly icon?: string;
    readonly onclick?: (id: TId) => void;
}
