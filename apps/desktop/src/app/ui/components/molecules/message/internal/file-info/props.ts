import type {Snippet} from 'svelte';
import type {HTMLButtonAttributes} from 'svelte/elements';

import type {u53} from '~/common/types';

/**
 * Props accepted by the `FileInfo` component.
 */
export interface FileInfoProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    /**
     * Whether clicking on the file should be disabled. Defaults to `false`.
     */
    readonly disabled?: boolean;
    readonly mediaType: string;
    readonly name: {
        /**
         * Default file name used as a fallback if the raw name is empty.
         */
        readonly default: string;
        /**
         * The raw (original) file name.
         *
         * Note: Will be amended to `name.extension` using the `mediaType`, if needed.
         */
        readonly raw?: string;
    };
    /** The reported size of the file in bytes. */
    readonly sizeInBytes: u53;
    /** Optional snippet to display next to the file size in the component's footer. */
    readonly snippetFooterAside?: Snippet;
    /** Reason why the file scan failed; if set, a warning icon with this text as tooltip is shown. */
    readonly syncFailureReason?: string;
}
