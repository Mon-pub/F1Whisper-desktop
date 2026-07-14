import type {u53} from '~/common/types';

/**
 * Props accepted by the `ChecklistItemsEditor` component.
 *
 * Renders an editable, reorderable list of poll/checklist items (text input + move-up/move-down +
 * delete per row, plus an add button). The `items` array order IS the display order, so reordering
 * is a positional swap. Shared by the create-poll form and the edit-checklist modal.
 */
export interface ChecklistItemsEditorProps {
    /**
     * The editable items. Each item has a stable, unique `id` (used for keying and to preserve votes
     * across an edit) and a `description`. Bindable.
     */
    readonly items: {
        description: string;
        readonly id: u53;
    }[];
    /**
     * Minimum number of items below which deletion is disabled (2 for a regular poll, 1 for a
     * checklist). Defaults to `2`.
     */
    readonly minItems?: u53;
    /** Label for the section header (e.g. "Options" / "Items"). */
    readonly headerLabel: string;
    /** Label for each item's input field. */
    readonly itemLabel: string;
    /** Optional callback invoked whenever the items change (add/delete/reorder/edit). */
    readonly onmutate?: () => void;
}
