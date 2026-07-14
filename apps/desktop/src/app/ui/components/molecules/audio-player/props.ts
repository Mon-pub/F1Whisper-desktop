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
    /**
     * Invoked when a listen-once voice message finishes playing (F1Whisper fork), so the message
     * can be marked consumed (burned). Only fired for an inbound, not-yet-consumed listen-once
     * audio.
     */
    readonly onlistenoncecomplete?: () => void;
    readonly snippetFooter?: Snippet<[timestamp: f64 | undefined]>;
}
