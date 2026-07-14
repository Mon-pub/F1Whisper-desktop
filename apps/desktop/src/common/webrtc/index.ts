import type {GroupCallId} from '~/common/network/protocol/call/group-call';
import type {CallId} from '~/common/network/types';
import type {WeakOpaque, ReadonlyUint8Array, u8} from '~/common/types';
import type {ProxyEndpoint, ProxyMarked} from '~/common/utils/endpoint';
import type {RemoteAbortListener} from '~/common/utils/signal';
import type {AnyGroupCallContextAbort, GroupCallContext} from '~/common/webrtc/group-call';
import type {
    AnyO2oCallContextAbort,
    O2oCallConnectionHandle,
    O2oCallContext,
    O2oCallContextConfig,
} from '~/common/webrtc/o2o-call';

// From grammar for SDP 'token':
// https://www.rfc-editor.org/rfc/rfc4566#section-9
// prettier-ignore
export const SDP_TOKEN_RANGE = [
    '!', '#', '$', '%', '&', "'", '*', '+', '-', '.',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z', '^', '_', '`', 'a',
    'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k',
    'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
    'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~'
] as const;

/** An ICE username fragment must be at least 4 characters. */
export type IceUsernameFragment = WeakOpaque<string, {readonly IceUsernameFragment: unique symbol}>;
export function isIceUsernameFragment(value: string): value is IceUsernameFragment {
    return value.length >= 4;
}
export function ensureIceUsernameFragment(value: string): IceUsernameFragment {
    if (!isIceUsernameFragment(value)) {
        throw Error(`Not a valid ICE username fragment: '${value}'`);
    }
    return value;
}

/** An ICE password must be at least 22 characters. */
export type IcePassword = WeakOpaque<string, {readonly IcePassword: unique symbol}>;
export function isIcePassword(value: string): value is IcePassword {
    return value.length >= 22;
}
export function ensureIcePassword(value: string): IcePassword {
    if (!isIcePassword(value)) {
        throw Error(`Not a valid ICE password: '${value}'`);
    }
    return value;
}

/** We're exclusively using SHA-256 for DTLS fingerprints. */
export type DtlsFingerprint = WeakOpaque<
    ReadonlyUint8Array,
    {readonly DtlsFingerprint: unique symbol}
>;
export function isDtlsFingerprint(array: ReadonlyUint8Array): array is DtlsFingerprint {
    return array.byteLength === 32 && !array.every((byte) => byte === 0);
}
export function ensureDtlsFingerprint(array: Uint8Array): DtlsFingerprint {
    if (!isDtlsFingerprint(array)) {
        throw Error('Not a valid DTLS fingerprint');
    }
    return array;
}

/** An RTP one-byte header extension ID (4-bit, 1-14 inclusive). */
export type RtpHeaderExtensionId = WeakOpaque<u8, {readonly RtpHeaderExtensionId: unique symbol}>;

export function isRtpHeaderExtensionId(value: number): value is RtpHeaderExtensionId {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 14;
}

export function ensureRtpHeaderExtensionId(value: number): RtpHeaderExtensionId {
    if (!isRtpHeaderExtensionId(value)) {
        throw Error('Not a valid RTP header extension ID');
    }
    return value;
}

export type RtpHeaderExtensionIds = Record<
    | 'mid'
    | 'rtpStreamId'
    | 'repairedRtpStreamId'
    | 'absoluteSendTime'
    | 'transportWideCongestionControl_01'
    | 'videoOrientation'
    | 'timeOffset',
    RtpHeaderExtensionId
>;

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
