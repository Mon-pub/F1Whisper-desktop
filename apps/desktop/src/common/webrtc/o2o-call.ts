import type {CallId} from '~/common/network/types';
import type {u32} from '~/common/types';
import type {ProxyMarked} from '~/common/utils/endpoint';
import type {AbortListener} from '~/common/utils/signal';

// Note: `ProxyEndpoint` (the type used for `O2oCallContext.connectionHandle` below) is imported
// only where actually constructed/wrapped -- see `~/common/network/protocol/call/o2o-call.ts`
// (the worker side, creates the endpoint pair) and `~/common/dom/webrtc/o2o-call.ts` (the DOM
// side, wraps it via `endpoint.wrap()`), mirroring `GroupCallContext.connect()`'s
// `endpoints.connection: ProxyEndpoint<GroupCallConnectionHandle>` pattern exactly.

/**
 * Negotiated data channel used for the 1:1 call signaling channel (mirrors the Android/iOS
 * `SIGNALING_CHANNEL_ID`). Since it is negotiated (`negotiated: true`), no in-band signaling takes
 * place, so both peers must create it with the same `id`/`label` before creating the
 * offer/answer -- the two sides never explicitly renegotiate it.
 */
export const O2O_CALL_DATA_CHANNEL_PARAMETERS = {
    ID: 0,
    LABEL: '3MACALLdc0',
} as const;

/**
 * Opus/audio bandwidth cap applied both via SDP fmtp munging and the sender's encoding parameters
 * (mirrors the Android `SdpPatcher` audio patch): wideband speech is more than sufficient for a
 * voice call and keeps bandwidth usage low.
 */
export const O2O_CALL_AUDIO_MAX_BITRATE_BPS = 16_000;

/**
 * `getUserMedia` audio constraints for a 1:1 call (mono, standard voice-call DSP pipeline).
 *
 * Note: Deliberately untyped as `MediaTrackConstraints` (a DOM-only type) here -- this file must
 * stay usable from the backend worker (`lib: ["esnext", "webworker"]`, no DOM lib). The DOM-side
 * consumer (`~/common/dom/webrtc/o2o-call.ts`) passes this straight into `getUserMedia`, where it
 * gets checked against the real `MediaTrackConstraints` type at that call site.
 */
export const O2O_CALL_MICROPHONE_TRACK_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: {ideal: 1},
} as const;

/**
 * A TURN/STUN server entry, structurally compatible with the DOM `RTCIceServer` type. Kept as a
 * plain structural type here (rather than importing `RTCIceServer`) since this file must stay
 * usable from the backend worker, which has no DOM lib.
 */
export interface O2oCallIceServer {
    readonly urls: string | readonly string[];
    readonly username?: string;
    readonly credential?: string;
}

/**
 * Whether the {@link RTCPeerConnection} may use any candidate type (`'all'`) or is restricted to
 * relayed (TURN) candidates only (`'relay'`), structurally compatible with the DOM
 * `RTCIceTransportPolicy` type.
 */
export type O2oCallIceTransportPolicy = 'all' | 'relay';

/**
 * Configuration required to create an {@link O2oCallContext} (see
 * {@link WebRtcService.createO2oCallContext}).
 */
export interface O2oCallContextConfig {
    readonly iceServers: readonly O2oCallIceServer[];
    readonly iceTransportPolicy: O2oCallIceTransportPolicy;
}

/**
 * A single ICE candidate as gathered from (or to be added to) an {@link O2oCallContext}'s
 * {@link RTCPeerConnection}.
 */
export interface O2oCallIceCandidate {
    readonly candidate: string;
    readonly sdpMid: string | null;
    readonly sdpMLineIndex: u32 | null;
    readonly ufrag: string | null;
}

/**
 * Reason why an {@link O2oCallContext} was aborted.
 *
 * - main-thread: The abort originated in the DOM context itself (e.g. the underlying
 *   {@link RTCPeerConnection} failed or was closed).
 * - backend-worker: The abort was requested by the backend worker (e.g. user hangup, remote
 *   hangup, glare, or a manager-level timeout).
 */
export interface MainThreadO2oCallContextAbort {
    readonly origin: 'main-thread';
    readonly cause: 'disconnected' | 'unexpected-error';
}
export interface BackendWorkerO2oCallContextAbort {
    readonly origin: 'backend-worker';
    readonly cause: 'hangup' | 'timeout' | 'unexpected-error';
}
export type AnyO2oCallContextAbort =
    | MainThreadO2oCallContextAbort
    | BackendWorkerO2oCallContextAbort;

/**
 * Normalized connection state reported to the worker via
 * {@link O2oCallConnectionHandle.handleConnectionState}, derived from the underlying
 * `RTCPeerConnection.connectionState`/`iceConnectionState`.
 *
 * - `connecting`: The peer connection exists but media isn't flowing yet (used to detect the
 *   `connecting -> connected` transition, which is what starts the manager's in-call timer).
 * - `connected`: Media is flowing.
 * - `reconnecting`: Was `connected`, but the connection reports `disconnected` -- possibly
 *   transient; the ICE agent's continual connectivity checks may recover it within the manager's
 *   grace window (no signaled ICE restart, mirroring Android). Not yet torn down.
 * - `failed`: The connection failed (e.g. ICE exhausted) and cannot recover; the call should end.
 * - `closed`: The peer connection was closed (e.g. via `O2oCallContext.close()`).
 */
export type O2oCallConnectionState =
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'failed'
    | 'closed';

/**
 * Backend worker handle passed into {@link WebRtcService.createO2oCallContext}, allowing the
 * DOM-side context to call back into the worker-side call manager (mirrors
 * {@link GroupCallConnectionHandle}).
 */
export interface O2oCallConnectionHandle extends ProxyMarked {
    /** Called for every locally gathered ICE candidate, to be sent to the peer as gathered. */
    readonly handleLocalIceCandidate: (candidate: O2oCallIceCandidate) => void;
    /**
     * Called whenever the normalized connection state changes (including the initial
     * `connecting` -> `connected` transition, which the manager needs to start the in-call timer).
     */
    readonly handleConnectionState: (state: O2oCallConnectionState) => void;
}

/**
 * The remote description to apply, either as the initiator (received answer) or as the callee
 * (received offer).
 */
export type O2oCallRemoteDescription =
    | {readonly type: 'offer'; readonly sdp: string}
    | {readonly type: 'answer' | 'pranswer'; readonly sdp: string};

/**
 * High-level helper context to create 1:1 call related WebRTC items that can only be done in the
 * main thread (DOM). It is exposed to the backend worker as a {@link Remote}.
 *
 * Unlike the group call context, this is a direct (or TURN-relayed) peer-to-peer connection: there
 * is no SFU and no media crypto worker, so standard WebRTC DTLS-SRTP already provides end-to-end
 * media encryption.
 */
export interface O2oCallContext extends ProxyMarked {
    readonly callId: CallId;
    readonly abort: AbortListener<AnyO2oCallContextAbort>;

    /**
     * Create the local offer (as the calling party). Must be called before {@link addIceCandidates}
     * and before {@link setRemoteDescription} is called with the answer.
     *
     * Captures the local microphone, creates the {@link RTCPeerConnection} and the negotiated
     * signaling data channel, and returns the (Opus-munged) SDP offer.
     */
    readonly createOffer: () => Promise<string>;

    /**
     * Create the local answer (as the callee). Must be called after {@link setRemoteDescription} was
     * called with the remote offer.
     *
     * Captures the local microphone, creates the {@link RTCPeerConnection} and the negotiated
     * signaling data channel, and returns the (Opus-munged) SDP answer.
     */
    readonly createAnswer: () => Promise<string>;

    /** Apply a remote offer/answer/pranswer. */
    readonly setRemoteDescription: (description: O2oCallRemoteDescription) => Promise<void>;

    /**
     * Add remote ICE candidates. Candidates received before the peer connection exists are cached
     * and replayed once it is created (i.e. this may be called before {@link createOffer} /
     * {@link createAnswer} return).
     */
    readonly addIceCandidates: (candidates: readonly O2oCallIceCandidate[]) => void;

    /** Mute/unmute the local microphone. Implemented via `track.enabled`, no renegotiation. */
    readonly setMuted: (muted: boolean) => void;

    /** Close the peer connection, data channel and release the local microphone track. */
    readonly close: () => void;
}
