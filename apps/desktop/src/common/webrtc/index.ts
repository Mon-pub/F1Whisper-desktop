import type {GroupCallId} from '~/common/network/protocol/call/group-call';
import type {CallId} from '~/common/network/types';
import type {ProxyEndpoint, ProxyMarked} from '~/common/utils/endpoint';
import type {RemoteAbortListener} from '~/common/utils/signal';
import type {AnyGroupCallContextAbort, GroupCallContext} from '~/common/webrtc/group-call';
import type {
    AnyO2oCallContextAbort,
    O2oCallConnectionHandle,
    O2oCallContext,
    O2oCallContextConfig,
} from '~/common/webrtc/o2o-call';

export interface WebRtcService extends ProxyMarked {
    /**
     * Create a {@link GroupCallContext} for a {@link callId}.
     *
     * @param remoteAbort signal that removes the context when raised.
     * @param callId Group Call ID used as a lookup value for the context via
     *   {@link getGroupCallContextHandle}.
     * */
    readonly createGroupCallContext: (
        remoteAbort: RemoteAbortListener<AnyGroupCallContextAbort>,
        callId: GroupCallId,
    ) => GroupCallContext;

    /**
     * Create an {@link O2oCallContext} for a 1:1 call identified by {@link callId}.
     *
     * Unlike group calls, only one 1:1 call may be active at a time -- calling this while a
     * previous context has not yet been removed (i.e. its `abort` has not fired) throws.
     *
     * @param remoteAbort signal that removes the context when raised.
     * @param callId 1:1 call ID.
     * @param config TURN/STUN servers and ICE transport policy to use for the peer connection.
     * @param connectionHandle Endpoint for the worker-side handle the DOM context calls back into
     *   (ICE candidates, reconnect state). The worker-side caller builds this via
     *   `endpoint.createEndpointPair<O2oCallConnectionHandle>()` + `exposeProxy(local, ...)` and
     *   passes the `.remote` end; the DOM-side implementation `.wrap()`s it into a callable
     *   `RemoteProxy` (mirrors `GroupCallContext.connect()`'s
     *   `endpoints.connection: ProxyEndpoint<GroupCallConnectionHandle>`).
     */
    readonly createO2oCallContext: (
        remoteAbort: RemoteAbortListener<AnyO2oCallContextAbort>,
        callId: CallId,
        config: O2oCallContextConfig,
        connectionHandle: ProxyEndpoint<O2oCallConnectionHandle>,
    ) => O2oCallContext;
}
