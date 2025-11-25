import type {FileResult} from '~/app/ui/svelte-components/utils/filelist';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

export interface FileInputProps {
    /**
     * Optional file type filter, comma-separated list of unique file type specifiers (see
     * https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file#unique_file_type_specifiers).
     */
    readonly accept?: string;
    /**
     * Whether to accept multiple files.
     */
    readonly multiple?: boolean;
    readonly ondropfiles?: (files: FileResult) => void;
    readonly fileInput: SvelteNullableBinding<HTMLInputElement>;
}
