/**
 * Props accepted by the `SearchBar` component.
 */
export interface SearchBarProps {
    readonly onclear?: () => void;
    /** Callback for the `SearchBar` to request a refresh of results. */
    readonly onrequestrefresh?: () => void;
    /** Placeholder to display when `term` is missing or empty. */
    readonly placeholder?: string;
    /** Search taerm. */
    readonly term?: string;
}
