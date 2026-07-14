import {
    O2oCallAnswerAction,
    O2oCallConnectionPolicy,
    O2oCallPolicy,
    O2oCallRejectReason,
} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {Contact, ServicesForModel} from '~/common/model';
import {
    OngoingO2oCall,
    type OngoingO2oCallController,
    type O2oCallEndReason,
    type O2oCallState,
} from '~/common/model/o2o-call';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {AnyOngoingCall, CallType} from '~/common/network/protocol/call';
import type {
    CallAnswerPayload,
    CallIceCandidatePayload,
    CallOfferPayload,
} from '~/common/network/protocol/call/o2o-call-signaling';
import type {TurnCredentials} from '~/common/network/protocol/directory';
import {OutgoingCallAnswerTask} from '~/common/network/protocol/task/csp/outgoing-call-answer';
import {OutgoingCallHangupTask} from '~/common/network/protocol/task/csp/outgoing-call-hangup';
import {OutgoingCallIceCandidateTask} from '~/common/network/protocol/task/csp/outgoing-call-ice-candidate';
import {OutgoingCallOfferTask} from '~/common/network/protocol/task/csp/outgoing-call-offer';
import {OutgoingCallRingingTask} from '~/common/network/protocol/task/csp/outgoing-call-ringing';
import {randomCallId} from '~/common/network/protocol/utils';
import type {CallId, IdentityString} from '~/common/network/types';
import {assert, ensureError, unreachable} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyEndpoint, type RemoteProxy} from '~/common/utils/endpoint';
import type {AsyncLock} from '~/common/utils/lock';
import {AbortRaiser} from '~/common/utils/signal';
import {WritableStore, type ReadableStore} from '~/common/utils/store';
import {TIMER, type TimerCanceller} from '~/common/utils/timer';
import type {
    AnyO2oCallContextAbort,
    O2oCallConnectionHandle,
    O2oCallConnectionState,
    O2oCallContext,
    O2oCallIceCandidate,
} from '~/common/webrtc/o2o-call';

/**
 * Note: This is `ServicesForModel` in full (not a narrower `Pick`, unlike `ServicesForGroupCall`)
 * because the manager directly constructs and schedules the 5 outgoing signaling tasks (which
 * require the full `ServicesForTasks` shape) -- `ServicesForModel` is a superset of
 * `ServicesForTasks`'s fields, same as how `model/group.ts` passes its own `ServicesForModel`
 * straight into `OutgoingGroupCallStartTask`.
 */
export type ServicesForO2oCall = ServicesForModel;

/** How long to ring out/in before giving up (Threema/WebRTC convention: ~60s). */
const RINGING_TIMEOUT_MS = 60_000;

/** Grace period after `disconnected` before giving up on a reconnect attempt. */
const RECONNECT_GRACE_MS = 15_000;

/**
 * Errors associated to a 1:1 call.
 */
export type O2oCallErrorType =
    | {readonly kind: 'disabled'}
    | {readonly kind: 'busy'}
    | {readonly kind: 'calls-not-configured'}
    | {readonly kind: 'unexpected-error'};

export class O2oCallError extends Error {
    public constructor(
        public readonly type: O2oCallErrorType['kind'],
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}

/** All mutable state tracked for the single currently-active 1:1 call. */
interface ActiveCallState {
    readonly callId: CallId;
    readonly peerIdentity: IdentityString;
    readonly ongoing: OngoingO2oCall;
    readonly lifetimeGuard: ModelLifetimeGuard<O2oCallState>;
    readonly abort: AbortRaiser<AnyO2oCallContextAbort>;
    /** Only set while incoming and not yet answered (needed by `accept()`). */
    pendingOffer: CallOfferPayload | undefined;
    /**
     * Remote ICE candidates that arrived before the WebRTC context existed (i.e. while `ringing-in`,
     * before `accept()`). Flushed into the context once it is created. See
     * `handleIncomingIceCandidates`.
     */
    pendingRemoteIce: O2oCallIceCandidate[];
    ringingTimeout: TimerCanceller | undefined;
    reconnectTimeout: TimerCanceller | undefined;
    webrtc: RemoteProxy<O2oCallContext> | undefined;
}

/**
 * Manages the single active 1:1 (o2o) call, its signaling and its WebRTC lifecycle.
 *
 * Mirrors {@link GroupCallManager} in spirit (a manager class shared via {@link CallManager}, one
 * active call tracked through the same `_ongoing` lock as group calls), but the state machine is
 * much simpler: there is no SFU, no participant list and no media-crypto worker -- just the local
 * state (see {@link O2oCallState}) and a single peer.
 *
 * State machine (see the design doc / `O2oCallState`):
 * ```
 * idle -> ringing-out -> connecting -> connected -> reconnecting -> ended   (outgoing)
 * idle -> ringing-in -> (accept) -> connecting -> ...                      (incoming, accepted)
 *                     -> (reject) -> ended                                  (incoming, rejected)
 * ```
 * Glare guard: if a call is already active and a new incoming `call-offer` arrives, it is
 * auto-rejected with `BUSY` and the active call is left untouched.
 */
export class O2oCallManager {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _log: Logger;
    private _active: ActiveCallState | undefined;

    public constructor(
        private readonly _services: ServicesForO2oCall,
        private readonly _ongoing: AsyncLock<CallType, WritableStore<AnyOngoingCall>>,
    ) {
        this._log = _services.logging.logger('network.protocol.call.o2o-call-manager');
    }

    /** A call that is considered ongoing (delegates to the shared cross-call-type store). */
    public get ongoing(): ReadableStore<AnyOngoingCall> {
        return this._ongoing.unwrap();
    }

    // ---------------------------------------------------------------------
    // Outgoing (initiated by the local user)
    // ---------------------------------------------------------------------

    /**
     * Place an outgoing 1:1 call to {@link contact}.
     *
     * @throws {O2oCallError} if calls are disabled by policy, another call is already active, or
     *   TURN credentials could not be obtained.
     */
    public async call(contact: ModelStore<Contact>): Promise<OngoingO2oCall> {
        this._assertCallsEnabled();

        return await this._ongoing.with(async (ongoingStore) => {
            if (ongoingStore.get() !== undefined) {
                throw new O2oCallError('busy', 'Another call is already active');
            }

            const peerIdentity = contact.get().view.identity;
            const callId = randomCallId(this._services.crypto);
            const active = this._registerActiveCall(callId, peerIdentity, 'outgoing', {
                status: 'ringing-out',
                micMuted: false,
                peerRinging: false,
            });
            ongoingStore.set(active.ongoing);
            this._wireAbortCleanup(active, ongoingStore);

            try {
                const iceServers = await this._turnIceServers();
                const context = await this._services.webrtc.createO2oCallContext(
                    active.abort,
                    callId,
                    {iceServers, iceTransportPolicy: this._iceTransportPolicy()},
                    this._makeConnectionHandle(active),
                );
                active.webrtc = context;

                const offerSdp = await context.createOffer();
                await this._services.taskManager.schedule(
                    new OutgoingCallOfferTask(this._services, contact.get(), {
                        callId,
                        offer: {sdpType: 'offer', sdp: offerSdp},
                    }),
                );
                this._log.info(`Placed outgoing call (callId=${callId})`);
            } catch (error) {
                this._log.error('Failed to place outgoing call:', error);
                this._endCall(active, {status: 'ended', reason: 'unexpected-error'});
                throw new O2oCallError('unexpected-error', 'Failed to place outgoing call', {
                    cause: ensureError(error),
                });
            }

            this._startRingingTimeout(active);
            return active.ongoing;
        }, '1:1-call');
    }

    // ---------------------------------------------------------------------
    // Incoming (from the CSP tasks, see incoming-call-*.ts)
    // ---------------------------------------------------------------------

    /** Handle an incoming `call-offer`. */
    public async handleIncomingOffer(
        peerIdentity: IdentityString,
        payload: CallOfferPayload,
    ): Promise<void> {
        // IMPORTANT: every outgoing signaling task scheduled from an incoming handler MUST be
        // fire-and-forget. These handlers run *inside* the active `IncomingMessageTask`, and the
        // task manager runs one task at a time; awaiting a newly scheduled outgoing task here would
        // deadlock (it queues behind the still-active incoming task, so it never runs, the incoming
        // message is never acknowledged -> the server redelivers the offer forever, and every later
        // decline/accept task is stuck behind it too). User-initiated actions (`call()`,
        // `_accept()`, `_hangup()`) are NOT inside a task and may await normally.
        if (!this._callsEnabled()) {
            void this._sendReject(peerIdentity, payload.callId, 'DISABLED');
            return;
        }

        await this._ongoing.with(async (ongoingStore) => {
            if (ongoingStore.get() !== undefined) {
                // Glare: already busy with another call, auto-reject, don't touch the active one.
                this._log.info(`Rejecting incoming offer (busy), callId=${payload.callId}`);
                void this._sendReject(peerIdentity, payload.callId, 'BUSY'); // fire-and-forget, see note above
                return;
            }

            const active = this._registerActiveCall(payload.callId, peerIdentity, 'incoming', {
                status: 'ringing-in',
                micMuted: false,
            });
            active.pendingOffer = payload;
            ongoingStore.set(active.ongoing);
            this._wireAbortCleanup(active, ongoingStore);

            // Acknowledge to the caller that we're ringing.
            const contact = this._services.model.contacts.getByIdentity(peerIdentity);
            if (contact !== undefined) {
                // Fire-and-forget (see the note at the top of this method): awaiting this schedule
                // would deadlock the task manager, so the offer would never be acknowledged.
                void this._services.taskManager
                    .schedule(
                        new OutgoingCallRingingTask(this._services, contact.get(), {
                            callId: payload.callId,
                        }),
                    )
                    .catch((error: unknown) => {
                        this._log.warn('Failed to send call-ringing:', error);
                    });
            }

            this._startRingingTimeout(active);
            this._log.info(
                `Incoming call ringing (callId=${payload.callId}, from=${peerIdentity})`,
            );
        }, '1:1-call');
    }

    /** Handle an incoming `call-answer`. */
    public async handleIncomingAnswer(
        peerIdentity: IdentityString,
        payload: CallAnswerPayload,
    ): Promise<void> {
        const active = this._active;
        if (active === undefined || active.callId !== payload.callId) {
            this._log.warn(`Ignoring call-answer for unknown/inactive callId=${payload.callId}`);
            return;
        }
        if (active.peerIdentity !== peerIdentity) {
            this._log.warn('Ignoring call-answer from unexpected sender');
            return;
        }

        // An answer is only ever valid for the CALLER while still ringing out (awaiting the first
        // and only answer). Ignore it in every other state: we are the callee still `ringing-in`
        // (no WebRTC context exists yet, so processing would throw), or the call already advanced to
        // connecting/connected/reconnecting (a duplicate, resent or out-of-order answer -- an ACCEPT
        // would re-apply a remote description on a `stable` peer connection [InvalidStateError] and a
        // REJECT would tear down a LIVE call). These handlers run on at-least-once-redelivered CSP
        // messages, so a stray/hostile answer must be a graceful no-op, NEVER a throw (an uncaught
        // throw here would leave the message un-acked -> endless redelivery -> connection loop).
        // Mirrors the tolerant callId/sender guards above.
        if (active.ongoing.get().view.status !== 'ringing-out' || active.webrtc === undefined) {
            this._log.warn(
                `Ignoring unexpected call-answer (status=${active.ongoing.get().view.status}, callId=${payload.callId})`,
            );
            return;
        }
        const webrtc = active.webrtc;

        active.ringingTimeout?.();
        active.ringingTimeout = undefined;

        if (payload.action === O2oCallAnswerAction.REJECT) {
            this._log.info(`Call rejected by peer (reason=${payload.rejectReason})`);
            this._endCall(active, {status: 'ended', reason: 'remote-reject'});
            return;
        }

        try {
            active.lifetimeGuard.update(() => ({status: 'connecting'}));
            await webrtc.setRemoteDescription({
                type: payload.answer.sdpType,
                sdp: payload.answer.sdp,
            });
        } catch (error) {
            this._log.error('Failed to apply call-answer:', error);
            this._endCall(active, {status: 'ended', reason: 'unexpected-error'});
        }
    }

    /** Handle incoming `call-ice-candidate`s. */
    public handleIncomingIceCandidates(
        peerIdentity: IdentityString,
        payload: CallIceCandidatePayload,
    ): void {
        const active = this._active;
        if (active === undefined || active.callId !== payload.callId) {
            this._log.debug(
                `Ignoring ICE candidates for unknown/inactive callId=${payload.callId}`,
            );
            return;
        }
        if (active.peerIdentity !== peerIdentity) {
            return;
        }
        const candidates = payload.candidates.map((candidate) => ({
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            ufrag: candidate.ufrag,
        }));
        if (active.webrtc === undefined) {
            // The caller trickles ICE candidates immediately, i.e. while we are still `ringing-in`
            // and have not yet created the WebRTC context (that only happens on `accept()`). Buffer
            // them and flush on accept, mirroring the Android client's `candidatesCache`. Without
            // this, the answerer never receives the caller's candidates and the call stays stuck in
            // `connecting` forever.
            active.pendingRemoteIce.push(...candidates);
            return;
        }
        // `addIceCandidates` crosses the DOM<->worker `RemoteProxy` boundary, so it returns a
        // Promise here even though the DOM-side implementation is synchronous; fire-and-forget.
        active.webrtc.addIceCandidates(candidates).catch((error: unknown) => {
            this._log.warn('Failed to add remote ICE candidates:', error);
        });
    }

    /** Handle an incoming `call-hangup`. */
    public handleIncomingHangup(peerIdentity: IdentityString, callId: CallId): void {
        const active = this._active;
        if (active === undefined || active.callId !== callId) {
            this._log.debug(`Ignoring hangup for unknown/inactive callId=${callId}`);
            return;
        }
        if (active.peerIdentity !== peerIdentity) {
            return;
        }
        this._log.info(`Peer hung up (callId=${callId})`);
        this._endCall(active, {status: 'ended', reason: 'remote-hangup'});
    }

    /** Handle an incoming `call-ringing`. */
    public handleIncomingRinging(peerIdentity: IdentityString, callId: CallId): void {
        const active = this._active;
        if (
            active === undefined ||
            active.callId !== callId ||
            active.peerIdentity !== peerIdentity
        ) {
            return;
        }
        // The callee's device is now ringing: advance the caller UI label from 'Calling…' to
        // 'Ringing…'. `peerRinging` is only read while `ringing-out`; later states ignore it.
        active.lifetimeGuard.update(() => ({peerRinging: true}));
        this._log.debug(`Peer is ringing (callId=${callId})`);
    }

    // ---------------------------------------------------------------------
    // Controller actions (accept/hangup/mute), exposed via OngoingO2oCallController
    // ---------------------------------------------------------------------

    private async _accept(active: ActiveCallState): Promise<void> {
        // Idempotency guard: accept() may be re-fired (e.g. a double-tap before the `ringing-in`
        // view has updated to `connecting`). Only a still-ringing incoming call can be accepted,
        // and its offer is consumed exactly once; a repeated accept() is a no-op so it can never
        // build a second WebRTC context (which the DOM provider rejects, tearing down the live one).
        const pendingOffer = active.pendingOffer;
        if (active.ongoing.get().view.status !== 'ringing-in' || pendingOffer === undefined) {
            return;
        }
        active.pendingOffer = undefined;
        const contact = this._services.model.contacts.getByIdentity(active.peerIdentity);
        assert(contact !== undefined, 'accept() called but the caller contact no longer exists');

        active.ringingTimeout?.();
        active.ringingTimeout = undefined;

        try {
            active.lifetimeGuard.update(() => ({status: 'connecting'}));
            const iceServers = await this._turnIceServers();
            const context = await this._services.webrtc.createO2oCallContext(
                active.abort,
                active.callId,
                {iceServers, iceTransportPolicy: this._iceTransportPolicy()},
                this._makeConnectionHandle(active),
            );
            active.webrtc = context;
            await context.setRemoteDescription({
                type: 'offer',
                sdp: pendingOffer.offer.sdp,
            });

            // Flush ICE candidates the caller trickled while we were ringing (before the context
            // existed). The remote description is set now, so they apply immediately.
            if (active.pendingRemoteIce.length > 0) {
                const buffered = active.pendingRemoteIce;
                active.pendingRemoteIce = [];
                context.addIceCandidates(buffered).catch((error: unknown) => {
                    this._log.warn('Failed to add buffered remote ICE candidates:', error);
                });
            }

            const answerSdp = await context.createAnswer();
            await this._services.taskManager.schedule(
                new OutgoingCallAnswerTask(this._services, contact.get(), {
                    callId: active.callId,
                    action: O2oCallAnswerAction.ACCEPT,
                    answer: {sdpType: 'answer', sdp: answerSdp},
                }),
            );
        } catch (error) {
            this._log.error('Failed to accept incoming call:', error);
            this._endCall(active, {status: 'ended', reason: 'unexpected-error'});
        }
    }

    private async _hangup(active: ActiveCallState): Promise<void> {
        const contact = this._services.model.contacts.getByIdentity(active.peerIdentity);
        const isRingingIn = active.ongoing.get().view.status === 'ringing-in';

        if (contact !== undefined) {
            try {
                if (isRingingIn) {
                    await this._services.taskManager.schedule(
                        new OutgoingCallAnswerTask(this._services, contact.get(), {
                            callId: active.callId,
                            action: O2oCallAnswerAction.REJECT,
                            rejectReason: O2oCallRejectReason.REJECTED,
                        }),
                    );
                } else {
                    await this._services.taskManager.schedule(
                        new OutgoingCallHangupTask(this._services, contact.get(), {
                            callId: active.callId,
                        }),
                    );
                }
            } catch (error) {
                this._log.warn('Failed to send hangup/reject:', error);
            }
        }

        this._endCall(active, {
            status: 'ended',
            reason: isRingingIn ? 'local-reject' : 'local-hangup',
        });
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    private _callsEnabled(): boolean {
        return (
            this._services.model.user.callsSettings.get().view.o2oCallPolicy ===
            O2oCallPolicy.ALLOW_CALL
        );
    }

    private _assertCallsEnabled(): void {
        if (!this._callsEnabled()) {
            throw new O2oCallError('disabled', 'Calls are disabled by policy');
        }
    }

    private _iceTransportPolicy(): 'all' | 'relay' {
        const policy = this._services.model.user.callsSettings.get().view.o2oCallConnectionPolicy;
        return policy === O2oCallConnectionPolicy.REQUIRE_RELAY ? 'relay' : 'all';
    }

    private async _turnIceServers(): Promise<
        readonly {
            readonly urls: readonly string[];
            readonly username: string;
            readonly credential: string;
        }[]
    > {
        const forceRelay = this._iceTransportPolicy() === 'relay';
        let credentials: TurnCredentials | undefined;
        try {
            credentials = await this._services.directory.turnCredentials(
                this._services.device.identity.string,
                this._services.device.csp.ck,
            );
        } catch (error) {
            throw new O2oCallError('unexpected-error', 'Failed to fetch TURN credentials', {
                cause: ensureError(error),
            });
        }
        if (credentials === undefined || !credentials.success) {
            throw new O2oCallError('calls-not-configured', 'TURN is not configured on the server');
        }
        const urls = forceRelay ? credentials.turnUrlsDualStack : credentials.turnUrls;
        return [
            {
                urls: [...urls],
                username: credentials.turnUsername,
                credential: credentials.turnPassword,
            },
        ];
    }

    /**
     * Build a fresh {@link O2oCallConnectionHandle} for {@link active} and expose it via an
     * endpoint pair, returning the `remote` end to be passed into `createO2oCallContext` (mirrors
     * `GroupCallManager.join()`'s `services.endpoint.createEndpointPair<GroupCallConnectionHandle>()`
     * + `exposeProxy` pattern).
     */
    private _makeConnectionHandle(active: ActiveCallState): ProxyEndpoint<O2oCallConnectionHandle> {
        const manager = this;
        const handle: O2oCallConnectionHandle = {
            [TRANSFER_HANDLER]: PROXY_HANDLER,
            handleLocalIceCandidate(candidate) {
                const contact = manager._services.model.contacts.getByIdentity(active.peerIdentity);
                if (contact === undefined) {
                    return;
                }
                manager._services.taskManager
                    .schedule(
                        new OutgoingCallIceCandidateTask(manager._services, contact.get(), {
                            callId: active.callId,
                            removed: false,
                            candidates: [candidate],
                        }),
                    )
                    .catch((error: unknown) => {
                        manager._log.warn('Failed to send local ICE candidate:', error);
                    });
            },
            handleConnectionState(state) {
                manager._handleConnectionState(active, state);
            },
        };
        const {local, remote} =
            this._services.endpoint.createEndpointPair<O2oCallConnectionHandle>();
        this._services.endpoint.exposeProxy(handle, local, this._log);
        // The endpoint's `MessagePort` must be TRANSFERRED (not structured-cloned) when it crosses
        // to the DOM context as a `createO2oCallContext` argument, otherwise `postMessage` throws
        // `DataCloneError: ... a MessagePort could not be cloned because it was not transferred`.
        // Mirrors how group calls hand their connection endpoint to the DOM side (see
        // `webrtc/group-call.ts`: `context.connect(services.endpoint.transfer({...}, [...]))`).
        return this._services.endpoint.transfer(remote, [remote]);
    }

    /**
     * React to a normalized connection-state report from the DOM context. This is what drives the
     * `connecting -> connected` transition (starting the in-call timer via `connectedAt`) as well
     * as `connected <-> reconnecting` and the `failed`/`closed` terminal paths.
     */
    private _handleConnectionState(active: ActiveCallState, state: O2oCallConnectionState): void {
        // Once the call has ended (`_endCall` raised the abort, which deactivated the lifetime
        // guard and cleared `_active`), a still-in-flight connection-state report from the DOM
        // context must be a no-op: calling `lifetimeGuard.update()` on the deactivated guard would
        // throw `DelayedError`. Mirror the same guard `_endCall` uses (its comment explains why).
        if (active.abort.aborted || this._active !== active) {
            return;
        }
        const current = active.ongoing.get().view;

        switch (state) {
            case 'connecting':
                // Nothing to do: `connecting` is already the state entered right after the local
                // offer/answer is created (see `call()`/`_accept()`), before this callback can even
                // fire for the first time.
                break;

            case 'connected': {
                active.reconnectTimeout?.();
                active.reconnectTimeout = undefined;
                if (current.status === 'connected') {
                    // Already connected (e.g. a duplicate report); keep the original `connectedAt`.
                    break;
                }
                const connectedAt =
                    current.status === 'reconnecting' ? current.connectedAt : new Date();
                active.lifetimeGuard.update(() => ({status: 'connected', connectedAt}));
                break;
            }

            case 'reconnecting': {
                if (current.status !== 'connected' && current.status !== 'reconnecting') {
                    // Only a `connected` call can become `reconnecting`; ignore otherwise (e.g. ICE
                    // flapping during initial connection setup, which `connecting` already covers).
                    break;
                }
                if (current.status === 'reconnecting') {
                    break;
                }
                const connectedAt = current.connectedAt;
                active.lifetimeGuard.update(() => ({status: 'reconnecting', connectedAt}));
                active.reconnectTimeout?.();
                active.reconnectTimeout = TIMER.timeout(() => {
                    this._log.info(`Reconnect grace period expired (callId=${active.callId})`);
                    this._endCall(active, {status: 'ended', reason: 'connection-failed'});
                }, RECONNECT_GRACE_MS);
                break;
            }

            case 'failed':
                this._log.info(`WebRTC connection failed (callId=${active.callId})`);
                this._endCall(active, {status: 'ended', reason: 'connection-failed'});
                break;

            case 'closed':
                // Reported after our own `close()` (e.g. via `_wireAbortCleanup`); the call has
                // already ended through whichever path triggered the close, nothing further to do.
                break;

            default:
                unreachable(state);
        }
    }

    private _registerActiveCall(
        callId: CallId,
        peerIdentity: IdentityString,
        direction: 'outgoing' | 'incoming',
        initialState: O2oCallState,
    ): ActiveCallState {
        const abort = new AbortRaiser<AnyO2oCallContextAbort>();
        const lifetimeGuard = new ModelLifetimeGuard<O2oCallState>();
        const ongoing = this._createOngoingCallModel(
            callId,
            peerIdentity,
            direction,
            initialState,
            lifetimeGuard,
            abort,
        );
        const active: ActiveCallState = {
            callId,
            peerIdentity,
            ongoing,
            lifetimeGuard,
            abort,
            pendingOffer: undefined,
            pendingRemoteIce: [],
            ringingTimeout: undefined,
            reconnectTimeout: undefined,
            webrtc: undefined,
        };
        this._active = active;
        return active;
    }

    private _createOngoingCallModel(
        callId: CallId,
        peerIdentity: IdentityString,
        direction: 'outgoing' | 'incoming',
        initialState: O2oCallState,
        lifetimeGuard: ModelLifetimeGuard<O2oCallState>,
        abort: AbortRaiser<AnyO2oCallContextAbort>,
    ): OngoingO2oCall {
        const manager = this;
        const controller: OngoingO2oCallController = {
            [TRANSFER_HANDLER]: PROXY_HANDLER,
            lifetimeGuard,
            abort,
            async accept() {
                const activeCall = manager._active;
                assert(activeCall !== undefined && activeCall.callId === callId);
                await manager._accept(activeCall);
            },
            async hangup() {
                const activeCall = manager._active;
                if (activeCall === undefined || activeCall.callId !== callId) {
                    return;
                }
                await manager._hangup(activeCall);
            },
            setMuted(muted: boolean) {
                const activeCall = manager._active;
                if (activeCall === undefined || activeCall.callId !== callId) {
                    return;
                }
                activeCall.lifetimeGuard.update(() => ({micMuted: muted}));
                activeCall.webrtc?.setMuted(muted).catch((error: unknown) => {
                    manager._log.warn('Failed to set muted state:', error);
                });
            },
        };
        return new OngoingO2oCall(
            this._services,
            initialState,
            controller,
            {callId, direction, peerIdentity},
            abort,
        );
    }

    private _wireAbortCleanup(
        active: ActiveCallState,
        ongoingStore: WritableStore<AnyOngoingCall>,
    ): void {
        active.abort.subscribe(() => {
            active.ringingTimeout?.();
            active.reconnectTimeout?.();
            active.webrtc?.close().catch((error: unknown) => {
                this._log.warn('Failed to close WebRTC context:', error);
            });
            if (this._active === active) {
                this._active = undefined;
            }
            if (ongoingStore.get() === active.ongoing) {
                ongoingStore.set(undefined);
            }
        });
    }

    private _startRingingTimeout(active: ActiveCallState): void {
        active.ringingTimeout?.();
        active.ringingTimeout = TIMER.timeout(() => {
            const status = active.ongoing.get().view.status;
            if (status !== 'ringing-out' && status !== 'ringing-in') {
                return;
            }
            this._log.info(`Ringing timeout (callId=${active.callId})`);
            if (status === 'ringing-in') {
                this._sendReject(active.peerIdentity, active.callId, 'TIMEOUT').catch(
                    (error: unknown) => {
                        this._log.warn('Failed to send TIMEOUT reject:', error);
                    },
                );
            } else {
                const contact = this._services.model.contacts.getByIdentity(active.peerIdentity);
                if (contact !== undefined) {
                    this._services.taskManager
                        .schedule(
                            new OutgoingCallHangupTask(this._services, contact.get(), {
                                callId: active.callId,
                            }),
                        )
                        .catch(() => undefined);
                }
            }
            this._endCall(active, {status: 'ended', reason: 'timeout'});
        }, RINGING_TIMEOUT_MS);
    }

    private _endCall(
        active: ActiveCallState,
        finalState: {readonly status: 'ended'; readonly reason: O2oCallEndReason},
    ): void {
        // Idempotent teardown: every terminal path must be safe on an already-ended call.
        // `active.abort` is raised ONLY here, so `aborted === true` means a prior `_endCall(active)`
        // already committed the `ended` state and deactivated the lifetime guard -- a second
        // `update()` would throw `DelayedError` on the now-unset handle. This races in practice:
        // a peer hangup/answer-reject can run its synchronous `_endCall` while a user-initiated
        // `_hangup`/`_accept` is still awaiting an outgoing schedule, which then resumes into a
        // second `_endCall`.
        if (active.abort.aborted) {
            return;
        }
        // `micMuted` is intentionally omitted here and merged in from the current view by
        // `ModelLifetimeGuard.update()`'s partial-update semantics (see `Model.update`), so the
        // mute state carries through to the terminal `ended` state without every call site having
        // to know the current value.
        active.lifetimeGuard.update(() => finalState);
        active.abort.raise({origin: 'main-thread', cause: 'unexpected-error'});
    }

    private async _sendReject(
        peerIdentity: IdentityString,
        callId: CallId,
        reason: 'DISABLED' | 'BUSY' | 'TIMEOUT' | 'REJECTED',
    ): Promise<void> {
        const contact = this._services.model.contacts.getByIdentity(peerIdentity);
        if (contact === undefined) {
            return;
        }
        let rejectReason: O2oCallRejectReason;
        switch (reason) {
            case 'DISABLED':
                rejectReason = O2oCallRejectReason.DISABLED;
                break;
            case 'BUSY':
                rejectReason = O2oCallRejectReason.BUSY;
                break;
            case 'TIMEOUT':
                rejectReason = O2oCallRejectReason.TIMEOUT;
                break;
            case 'REJECTED':
                rejectReason = O2oCallRejectReason.REJECTED;
                break;
            default:
                unreachable(reason);
        }
        try {
            await this._services.taskManager.schedule(
                new OutgoingCallAnswerTask(this._services, contact.get(), {
                    callId,
                    action: O2oCallAnswerAction.REJECT,
                    rejectReason,
                }),
            );
        } catch (error) {
            this._log.warn(`Failed to send reject (${reason}):`, error);
        }
    }
}
