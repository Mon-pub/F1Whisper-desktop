import type {HTMLButtonAttributes} from 'svelte/elements';

/**
 * Props accepted by the `SettingsNavItem` component.
 */
export interface SettingsNavItemProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    readonly iconName: string;
    /**
     * Whether this item is the one that's currently active (i.e., the corresponding settings page
     * is open). Defaults to `false`.
     */
    readonly isActive?: boolean;
    readonly subtitle: string;
    readonly title: string;
}
