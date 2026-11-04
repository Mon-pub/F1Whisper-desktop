import type {f64} from '@threema/ts-utils/float/f64';
import type {Snippet} from 'svelte';

import type {AudioPlaybackId} from '~/app/ui/components/molecules/audio-player/controller';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';

/**
 * Props accepted by the `AudioPlayer` component.
 */
export interface AudioPlayerProps {
    readonly audioFile: Exclude<MessageProps['file'], undefined>;

    /**
     * Identity used to key persistent playback across conversation switches. Playback is owned by
     * the app-scoped controller, so the player must know which message it represents.
     */
    readonly playbackId: AudioPlaybackId;

    /**
     * Invoked when started listen-once playback becomes terminal (F1Whisper fork), so the message
     * can be marked consumed (burned). Only fired for inbound, not-yet-consumed listen-once audio.
     */
    readonly onlistenoncecomplete?: () => void;
    readonly snippetFooter?: Snippet<[timestamp: f64 | undefined]>;
}
