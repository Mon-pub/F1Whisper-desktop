export type LazyAudioContent =
    | LoadingLazyAudioContent
    | FailedLazyAudioContent
    | LoadedLazyAudioContent;

interface LoadingLazyAudioContent {
    state: 'loading';
}

interface FailedLazyAudioContent {
    state: 'failed';
}

interface LoadedLazyAudioContent {
    state: 'loaded';
    /**
     * The decoded audio blob. Used for the waveform, and handed to the playback controller (which
     * owns its own object URL) when the user starts playback.
     */
    blob: Blob;
}
