import type {ChatFolder} from '~/common/dom/ui/local-storage';

/**
 * Props accepted by the `FolderChips` component (F1Whisper fork). A row of filter chips above the
 * conversation list; selecting a chip filters the list to conversations assigned to that folder.
 */
export interface FolderChipsProps {
    readonly folders: readonly ChatFolder[];
    /** `undefined` means the synthetic "All" chip is selected (no filter applied). */
    readonly selectedFolderId: string | undefined;
    readonly onselect: (folderId: string | undefined) => void;
}
