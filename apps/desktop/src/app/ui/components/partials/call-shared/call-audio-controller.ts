import {AsyncLock} from '@threema/ts-utils/lock/async-lock';

import type {
    FeedType,
    ParticipantFeedProps,
} from '~/app/ui/components/partials/call-participant-feed/props';
import {findMediaDevice} from '~/app/ui/components/partials/call-shared/helpers';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
import type {Logger} from '~/common/logging';
import {assertUnreachable} from '~/common/utils/assert';
import {difference} from '~/common/utils/set';

/**
 * The feeds relevant to the audio graph, as passed by the hosting activity component. Matches the
 * shape of the component's `feeds` derived (local + remote feeds without the per-component `activity`
 * and `services` props).
 */
export type CallActivityFeeds = readonly Omit<
    ParticipantFeedProps<FeedType>,
    'activity' | 'services'
>[];

/**
 * Owns the WebAudio graph and the `<audio>` sink for a call activity.
 *
 * The controller mixes every remote participant's microphone track into a single
 * {@link MediaStreamAudioDestinationNode}, whose stream is attached to the activity's `<audio>`
 * element, and manages the selected output device (speaker) on that element. All mutations run under
 * a single {@link AsyncLock} so that feed updates, sink changes and startup speaker resolution never
 * race.
 */
export class CallAudioController {
    readonly #_log: Logger;
    readonly #_lock = new AsyncLock();
    readonly #_audioContext = new AudioContext();
    readonly #_incomingAudioSink = this.#_audioContext.createMediaStreamDestination();

    /**
     * Maps from track to the associated media stream and the node that receives said stream.
     *
     * Note: This is a plain field (not reactive) because it is only ever touched inside the lock and
     * in {@link close}.
     */
    #_audioTracksMap:
        | Map<
              MediaStreamTrack,
              {readonly stream: MediaStream; readonly node: MediaStreamAudioSourceNode}
          >
        | undefined = undefined;

    public constructor(log: Logger) {
        this.#_log = log;
    }

    /**
     * Handle updating audible audio streams if any of the feeds change (i.e., a feed is muted).
     */
    public async updateFeeds(
        audioElement: SvelteNullableBinding<HTMLAudioElement>,
        feeds: CallActivityFeeds,
    ): Promise<void> {
        return await this.#_lock.with(() => {
            if (audioElement === null) {
                return;
            }
            // We attach the stream to the audio element's source object only once.
            if (this.#_audioTracksMap === undefined) {
                // TODO(DESK-1711): Check if map has to be mutable.
                this.#_audioTracksMap = new Map();
                audioElement.srcObject = this.#_incomingAudioSink.stream;
            }

            const activeAudioTracks = new Set([...this.#_audioTracksMap.keys()]);
            const currentAudioTracks = new Set(
                feeds
                    .map((feed) => feed.tracks)
                    .filter((tracks) => tracks.type === 'remoteVideo')
                    .map((tracks) => tracks.microphone),
            );

            // `svelte-eslint` doesn't seem to support `Set.difference` yet.
            const newAudioTracks = difference(currentAudioTracks, activeAudioTracks);
            const lostAudioTracks = difference(activeAudioTracks, currentAudioTracks);

            for (const track of newAudioTracks) {
                if (this.#_audioTracksMap.has(track)) {
                    this.#_log.warn('Tried to add a media stream track that already exists.');
                    continue;
                }
                const stream = new MediaStream([track]);
                const node = this.#_audioContext.createMediaStreamSource(stream);
                node.connect(this.#_incomingAudioSink);
                // Workaround because of https://issues.chromium.org/issues/40094084
                new Audio().srcObject = stream;
                this.#_audioTracksMap.set(track, {stream, node});
            }
            for (const trackId of lostAudioTracks) {
                const mapEntry = this.#_audioTracksMap.get(trackId);
                if (mapEntry === undefined) {
                    this.#_log.warn('Tried to a remove an audio stream that did not exist');
                    continue;
                }
                mapEntry.node.disconnect(this.#_incomingAudioSink);
                this.#_audioTracksMap.delete(trackId);
            }
        });
    }

    /**
     * Handle updating the active audio sink (speaker).
     *
     * Note: The `feeds` parameter is unused but required so that callers can re-run this whenever the
     * feeds change (setting the sink only succeeds once the `<audio>` element has media tracks).
     */
    public async updateSink(
        audioElement: SvelteNullableBinding<HTMLAudioElement>,
        audioSinkDeviceId: string | undefined,
        // Needed to update audio sink when feeds change.
        feeds: CallActivityFeeds,
    ): Promise<void> {
        return await this.#_lock.with(async () => {
            if (audioElement === null) {
                return undefined;
            }
            if (audioSinkDeviceId === undefined) {
                return undefined;
            }

            // Return early, because if the `<audio>` element doesn't have any media tracks, setting
            // the audio sink would fail.
            if (!(audioElement.srcObject instanceof MediaStream)) {
                return undefined;
            }
            if (audioElement.srcObject.getTracks().length === 0) {
                return undefined;
            }

            return await audioElement.setSinkId(audioSinkDeviceId);
        });
    }

    /**
     * Resolve the initial audio sink (speaker) device id from the last selected speaker label, or
     * `undefined` if there is no stored label or the device is no longer available. Runs under the
     * same lock as {@link updateSink}.
     */
    public async resolveInitialSink(label: string | undefined): Promise<string | undefined> {
        return await this.#_lock.with(async () => {
            if (label === undefined) {
                return undefined;
            }
            const device = await findMediaDevice('audiooutput', label);
            return device?.deviceId;
        });
    }

    /**
     * Tear down the WebAudio graph. Must be called when the hosting activity is destroyed.
     */
    public close(): void {
        this.#_audioTracksMap?.clear();
        void this.#_audioContext.close().catch(assertUnreachable);
    }
}
