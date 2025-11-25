import type {Snippet} from 'svelte';

import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {f64} from '~/common/types';

/**
 * Props accepted by the `AudioPlayer` component.
 */
export interface AudioPlayerProps {
    readonly audioFile: Exclude<MessageProps['file'], undefined>;

    /**
     * Function to fetch the audio data with.
     */
    readonly onerror: (error: Error) => void;
    readonly snippetFooter?: Snippet<[timestamp: f64 | undefined]>;
}
