import type {Snippet} from 'svelte';

import type {FileLoadResult} from '~/app/ui/utils/file';

/**
 * Props accepted by the `DropZoneProvider` component.
 */
export interface DropZoneProviderProps {
    readonly children?: Snippet;
    /**
     * Whether to show an overlay while hovering, and what message it should contain.
     */
    readonly overlay?: {
        readonly message: string;
    };
    /**
     * Called exactly once every time the drag-over state changes.
     */
    readonly ondragover?: (isDragOver: boolean) => void;
    readonly ondropfiles?: (files: FileLoadResult) => void;
}
