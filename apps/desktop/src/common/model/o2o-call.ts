import {TRANSFER_HANDLER} from '~/common/index';
import type {ServicesForModel} from '~/common/model';
import type {Model} from '~/common/model/types/common';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import type {Call} from '~/common/network/protocol/call';
import type {CallId, IdentityString} from '~/common/network/types';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {AbortListener, AbortRaiser} from '~/common/utils/signal';
import type {AnyO2oCallContextAbort} from '~/common/webrtc/o2o-call';

/**
 * Direction of a 1:1 call, from the local user's perspective.
 */
export type O2oCallDirection = 'outgoing' | 'incoming';

/**
 * State of an ongoing 1:1 call.
 *
 * - `ringing-out`: We called the peer, waiting for them to accept/reject (`CallOffer` sent, no
 *   answer yet).
 * - `ringing-in`: The peer is calling us, waiting for the local user to accept/reject (incoming
 *   `CallOffer` received, no answer sent yet).
 * - `connecting`: An answer was exchanged, the WebRTC connection is being established.
 * - `connected`: Media is flowing.
 * - `reconnecting`: The connection was `connected`, but the underlying `RTCPeerConnection` reports
 *   `disconnected` -- possibly transient, an ICE restart may recover it. The call is NOT torn down;
 *   the UI should show a "reconnecting" indicator.
 * - `ended`: Terminal state, see {@link O2oCallEndReason}.
 *
 * `micMuted` is tracked outside the status union (applies uniformly to every non-`ended` status)
 * so the UI can reflect the mute button's state without a `status`-specific branch. `peerRinging`
 * is likewise outside the union but only meaningful while `ringing-out`: it flips to `true` once
 * the callee sends `CallRinging`, letting the caller UI show "Ringing…" instead of "Calling…".
 */
export type O2oCallState = {readonly micMuted: boolean; readonly peerRinging?: boolean} & (
    | {readonly status: 'ringing-out'}
    | {readonly status: 'ringing-in'}
    | {readonly status: 'connecting'}
    | {readonly status: 'connected'; readonly connectedAt: Date}
    | {readonly status: 'reconnecting'; readonly connectedAt: Date}
    | {readonly status: 'ended'; readonly reason: O2oCallEndReason}
);

/**
 * Why a 1:1 call ended.
 *
 * - local-hangup: The local user hung up.
 * - remote-hangup: The peer sent a `CallHangup`.
 * - local-reject / remote-reject: The (local|remote) user explicitly rejected an incoming call.
 * - busy: Rejected locally because another call was already active (glare).
 * - timeout: The peer did not answer/ring in time.
 * - connection-failed: The `RTCPeerConnection` reported `failed`/`closed` (e.g. ICE exhausted).
 * - disabled: Calls are disabled by local policy (`O2oCallPolicy.DENY_CALL`).
 * - unexpected-error: Anything else.
 */
export type O2oCallEndReason =
    | 'local-hangup'
    | 'remote-hangup'
    | 'local-reject'
    | 'remote-reject'
    | 'busy'
    | 'timeout'
    | 'connection-failed'
    | 'disabled'
    | 'unexpected-error';

export interface OngoingO2oCallController extends ProxyMarked {
    readonly lifetimeGuard: ModelLifetimeGuard<O2oCallState>;
    readonly abort: AbortListener<AnyO2oCallContextAbort>;

    /** Accept an incoming call (`status === 'ringing-in'` only). */
    readonly accept: () => Promise<void>;

    /**
     * Reject or hang up the call, depending on its current state (reject while `ringing-in`,
     * hangup otherwise). Safe to call from any non-`ended` state.
     */
    readonly hangup: () => Promise<void>;

    /** Mute/unmute the local microphone. */
    readonly setMuted: (muted: boolean) => void;

    // Note: A UI-facing audio-level indicator (remote peer speaking) is not implemented. When added,
    // expose it via an explicit method (e.g. `subscribeAudioLevel(callback)`) rather than a store
    // property: `IQueryableStore` properties resolve to a `Promise<RemoteStore>` across the
    // worker<->DOM `RemoteProxy<O2oCallContext>` (needing `STORE_TRANSFER_HANDLER`, not the generic
    // `PROXY_HANDLER` a plain property access assumes), so it cannot be read synchronously from the UI.
}

export interface OngoingO2oCallContext {
    readonly callId: CallId;
    readonly direction: O2oCallDirection;
    readonly peerIdentity: IdentityString;
}

export type OngoingO2oCallModel = Model<
    O2oCallState,
    OngoingO2oCallController,
    OngoingO2oCallContext,
    '1:1-call'
>;

/**
 * Represents a 1:1 call that is considered _ongoing_ (i.e. not yet `ended`, or `ended` but not yet
 * cleared by the manager). Mirrors {@link OngoingGroupCall}, but much simpler: there is no SFU, no
 * media-crypto worker and no participant list -- just the local state machine and a single peer.
 */
export class OngoingO2oCall extends ModelStore<OngoingO2oCallModel> implements Call<'1:1-call'> {
    public constructor(
        services: Pick<ServicesForModel, 'logging'>,
        initialState: O2oCallState,
        controller: OngoingO2oCallController,
        context: OngoingO2oCallContext,
        abort: AbortRaiser<AnyO2oCallContextAbort>,
    ) {
        const tag = `o2o-call.${context.callId}`;
        super(initialState, controller, context, '1:1-call', {
            debug: {
                log: services.logging.logger(`model.${tag}`),
                tag,
            },
        });

        abort.subscribe(() => controller.lifetimeGuard.deactivate());
    }
}
