/**
 * WebRTC call quality statistics collector.
 *
 * Periodically queries {@link RTCPeerConnection.getStats} and logs curated quality metrics to a
 * dedicated log file.
 *
 * The collector is started via {@link GroupCallStatsCollector.start} and stops automatically when
 * the provided abort listener fires.
 */

import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import type {AbortListener} from '~/common/utils/signal';

const LOG_INTERVAL_MS = 5_000;

/**
 * Curated snapshot of WebRTC quality metrics extracted from an {@link RTCStatsReport}.
 *
 * Only the stats with the highest impact for application-layer detection are tracked:
 *
 * - **Network congestion**: `qualityLimitationReason` (outbound video) combined with per-stream
 *   RTT from `remote-inbound-rtp` for dual-factor validation.
 * - **CPU limitation**: `qualityLimitationReason === 'cpu'` (outbound video) combined with
 *   `framesPerSecond` volatility on inbound video.
 * - **Stuck tracks**: `bytesReceived` remaining at 0 on inbound streams.
 * - **Frozen video**: `freezeCount` / `totalFreezesDuration` on inbound video.
 *
 * @see https://webrtchacks.com/power-up-getstats-for-client-monitoring/
 */
export interface WebrtcStatsSnapshot {
    /** ISO 8601 timestamp of when the snapshot was taken. */
    readonly timestamp: string;
    /**
     * Active ICE candidate pair quality metrics. Absent if no active pair is found.
     * https://www.w3.org/TR/webrtc-stats/#dom-rtcicecandidatepairstats
     */
    readonly candidatePair?: {
        /** Type of the local ICE candidate (e.g. 'host', 'srflx', 'relay'). */
        readonly localCandidateType: string;
        /** Type of the remote ICE candidate. */
        readonly remoteCandidateType: string;
        /** Round-trip time in seconds, if available. */
        readonly currentRoundTripTime?: u53;
        /** Available outgoing bitrate in bits/second, if available. */
        readonly availableOutgoingBitrate?: u53;
        /** Candidate pair state (e.g. 'succeeded', 'in-progress'). */
        readonly state: string;
    };
    /**
     * Per-inbound-stream stats (one entry per SSRC).
     * https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats
     */
    readonly inbound: {
        /** SSRC identifier. */
        readonly ssrc: u53;
        /** Media kind: 'audio' or 'video'. */
        readonly kind: string;
        /** Total packets lost (cumulative). Indicates quality degradation. */
        readonly packetsLost: u53;
        /** Interarrival jitter in seconds. Affects audio/video stability. */
        readonly jitter: u53;
        /** Total bytes received. A value stuck at 0 indicates a stuck track. */
        readonly bytesReceived: u53;
        /** Calculated receive bitrate in bits/second since the last snapshot (0 if first). */
        readonly receiveBitsPerSecond: u53;
        /** Current decoded frames per second (video only). Used for CPU limitation detection. */
        readonly framesPerSecond?: u53;
        /** Total number of video freezes experienced by this receiver (video only). */
        readonly freezeCount?: u53;
        /** Total duration (seconds) of rendered frames considered frozen (video only). */
        readonly totalFreezesDuration?: u53;
    };
    /**
     * Per-outbound-stream stats (one entry per SSRC).
     * https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats
     */
    readonly outbound: {
        /** SSRC identifier. */
        readonly ssrc: u53;
        /** Media kind: 'audio' or 'video'. */
        readonly kind: string;
        /** Total bytes sent. */
        readonly bytesSent: u53;
        /** Calculated send bitrate in bits/second since the last snapshot (0 if first). */
        readonly sendBitsPerSecond: u53;
        /**
         * Reason for quality limitation (video only). One of: 'none', 'cpu', 'bandwidth',
         * 'other'. Central signal for both congestion and CPU detection.
         */
        readonly qualityLimitationReason?: string;
        /** Target encoding bitrate in bits/second (video only), if available. */
        readonly targetBitrate?: u53;
    };
    /**
     * Per remote-inbound-rtp stats (one entry per SSRC). These are RTCP receiver reports from
     * the remote end, providing per-stream RTT needed for congestion validation.
     * https://www.w3.org/TR/webrtc-stats/#dom-rtcremoteinboundrtpstreamstats
     */
    readonly remoteInbound: {
        /** SSRC identifier. */
        readonly ssrc: u53;
        /** Most recently measured round-trip time in seconds, if available. */
        readonly roundTripTime?: u53;
        /** Cumulative RTT in seconds across all measurements. For EWMA delta calculation. */
        readonly totalRoundTripTime?: u53;
        /** Total number of RTT measurements. For EWMA delta calculation. */
        readonly roundTripTimeMeasurements?: u53;
        /** Fraction of packets lost (0..1) as reported by the remote end. */
        readonly fractionLost?: u53;
    };
}

// Extended stat types for properties not yet in TypeScript's bundled DOM lib.
// The W3C WebRTC Stats spec defines these; browsers implement them but TS declarations lag.
interface ExtendedIceCandidatePairStats extends RTCIceCandidatePairStats {
    readonly localCandidateId: string;
    readonly remoteCandidateId: string;
}

interface LocalCandidateStat extends RTCStats {
    readonly type: 'local-candidate';
    readonly candidateType?: string;
}

interface RemoteCandidateStat extends RTCStats {
    readonly type: 'remote-candidate';
    readonly candidateType?: string;
}

interface ExtendedInboundRtpStats extends RTCInboundRtpStreamStats {
    /** Current decoded frames per second (video only). */
    readonly framesPerSecond?: u53;
    /** Total number of video freeze events. */
    readonly freezeCount?: u53;
    /** Total duration of video freezes in seconds. */
    readonly totalFreezesDuration?: u53;
}

interface ExtendedOutboundRtpStats extends RTCOutboundRtpStreamStats {
    readonly targetBitrate?: u53;
}

/** https://www.w3.org/TR/webrtc-stats/#dom-rtcremoteinboundrtpstreamstats */
interface RemoteInboundRtpStats extends RTCStats {
    readonly type: 'remote-inbound-rtp';
    readonly ssrc: u53;
    /** Most recently measured round-trip time in seconds. */
    readonly roundTripTime?: u53;
    /** Cumulative round-trip time in seconds across all measurements. */
    readonly totalRoundTripTime?: u53;
    /** Total number of round-trip time measurements received. */
    readonly roundTripTimeMeasurements?: u53;
    /** Fraction of RTP packets lost (0..1) as reported by the remote receiver. */
    readonly fractionLost?: u53;
}

// Previous-sample accumulators for bitrate calculations.
interface PreviousSample {
    readonly timestampMs: u53;
    readonly bytesReceived: Map<u53, u53>;
    readonly bytesSent: Map<u53, u53>;
}

function calculateBitsPerSecond(current: u53, prev: u53, elapsedMs: u53): u53 {
    // Avoid calculating a negative bitrate
    if (prev >= current) {
        return 0;
    }

    return ((current - prev) * 8 * 1000) / elapsedMs;
}

/**
 * Collects and logs periodic WebRTC call quality statistics during a group call.
 */
export class GroupCallStatsCollector {
    private _intervalId: ReturnType<typeof setInterval> | undefined;
    private _previousSample: PreviousSample | undefined;

    /**
     * Creates a new stats collector. Call {@link start} to begin collection.
     *
     * @param _pc The peer connection to collect stats from.
     * @param _log Logger targeting the dedicated WebRTC stats log file.
     * @param abort Abort listener; the collector stops when this fires.
     */
    public constructor(
        private readonly _pc: RTCPeerConnection,
        private readonly _log: Logger,
        abort: AbortListener<unknown>,
    ) {
        abort.subscribe(() => this._stop());
    }

    /**
     * Start periodic stats collection. Safe to call only once.
     */
    public start(): void {
        if (this._intervalId !== undefined) {
            return;
        }
        const intervalMs = LOG_INTERVAL_MS;
        this._log.info(`Stats collection started (interval=${intervalMs}ms)`);
        this._intervalId = setInterval(() => {
            this._collect().catch((error: unknown) => {
                this._log.warn('Failed to collect WebRTC stats:', error);
            });
        }, intervalMs);
    }

    private _stop(): void {
        if (this._intervalId !== undefined) {
            clearInterval(this._intervalId);
            this._intervalId = undefined;
        }
        this._log.info('Stats collection stopped');
    }

    private async _collect(): Promise<void> {
        const report = await this._pc.getStats();
        const now = Date.now();

        // Collect outbound-rtp stats — focused on bitrate, qualityLimitationReason (congestion +
        // CPU detection), and target bitrate.
        const outbound: WebrtcStatsSnapshot['outbound'][] = [];
        const newBytesSent = new Map<u53, u53>();

        // Collect inbound-rtp stats — focused on packet loss, jitter, bitrate, freeze detection,
        // and FPS for CPU limitation detection.
        const inbound: WebrtcStatsSnapshot['inbound'][] = [];
        const newBytesReceived = new Map<u53, u53>();

        // Accumulate previous bytes for bitrate calculations.
        const prevBytesReceived = this._previousSample?.bytesReceived ?? new Map<u53, u53>();
        const prevBytesSent = this._previousSample?.bytesSent ?? new Map<u53, u53>();
        const prevTimestampMs = this._previousSample?.timestampMs ?? now;
        const elapsedMs = Math.max(now - prevTimestampMs, 1);

        // Collect remote-inbound-rtp stats — per-stream RTT from RTCP receiver reports, needed
        // for congestion detection via RTT volatility (EWMA approach).
        const remoteInbound: WebrtcStatsSnapshot['remoteInbound'][] = [];

        let candidatePair: WebrtcStatsSnapshot['candidatePair'];

        // Find the active (nominated) ICE candidate pair and index candidate stats by id for
        // cross-referencing local/remote candidate types.
        let activePair: ExtendedIceCandidatePairStats | undefined;
        const candidateById = new Map<string, RTCStats>();

        report.forEach((stat: RTCStats) => {
            switch (stat.type) {
                case 'candidate-pair': {
                    const pair = stat as ExtendedIceCandidatePairStats;
                    if (pair.nominated === true) {
                        activePair = pair;
                    }
                    break;
                }
                case 'local-candidate':
                case 'remote-candidate':
                    candidateById.set(stat.id, stat);
                    break;
                case 'inbound-rtp': {
                    const inboundStat = stat as ExtendedInboundRtpStats;
                    const ssrc = inboundStat.ssrc;
                    const bytesRx = inboundStat.bytesReceived ?? 0;
                    newBytesReceived.set(ssrc, bytesRx);

                    const prevBytes = prevBytesReceived.get(ssrc) ?? 0;
                    const receiveBitsPerSecond = calculateBitsPerSecond(
                        bytesRx,
                        prevBytes,
                        elapsedMs,
                    );
                    const isVideo = inboundStat.kind === 'video';

                    inbound.push({
                        ssrc,
                        kind: inboundStat.kind,
                        packetsLost: inboundStat.packetsLost ?? 0,
                        jitter: inboundStat.jitter ?? 0,
                        bytesReceived: bytesRx,
                        receiveBitsPerSecond,
                        framesPerSecond: isVideo ? inboundStat.framesPerSecond : undefined,
                        freezeCount: isVideo ? (inboundStat.freezeCount ?? 0) : undefined,
                        totalFreezesDuration: isVideo
                            ? (inboundStat.totalFreezesDuration ?? 0)
                            : undefined,
                    });
                    break;
                }
                case 'outbound-rtp': {
                    const outboundStat = stat as ExtendedOutboundRtpStats;
                    const ssrc = outboundStat.ssrc;
                    const bytesTx = outboundStat.bytesSent ?? 0;
                    newBytesSent.set(ssrc, bytesTx);

                    const prevBytes = prevBytesSent.get(ssrc) ?? 0;
                    const sendBitsPerSecond = calculateBitsPerSecond(bytesTx, prevBytes, elapsedMs);

                    outbound.push({
                        ssrc,
                        kind: outboundStat.kind,
                        bytesSent: bytesTx,
                        sendBitsPerSecond,
                        qualityLimitationReason:
                            outboundStat.kind === 'video'
                                ? outboundStat.qualityLimitationReason
                                : undefined,
                        targetBitrate:
                            outboundStat.kind === 'video' ? outboundStat.targetBitrate : undefined,
                    });
                    break;
                }
                case 'remote-inbound-rtp': {
                    const remoteInboundStat = stat as RemoteInboundRtpStats;

                    remoteInbound.push({
                        ssrc: remoteInboundStat.ssrc,
                        roundTripTime: remoteInboundStat.roundTripTime,
                        totalRoundTripTime: remoteInboundStat.totalRoundTripTime,
                        roundTripTimeMeasurements: remoteInboundStat.roundTripTimeMeasurements,
                        fractionLost: remoteInboundStat.fractionLost,
                    });
                    break;
                }
                default:
                    // We only care about the above handled RTCStats
                    break;
            }
        });

        if (activePair !== undefined) {
            const localStat = candidateById.get(activePair.localCandidateId);
            const remoteStat = candidateById.get(activePair.remoteCandidateId);
            const localCandidate =
                localStat?.type === 'local-candidate'
                    ? (localStat as LocalCandidateStat)
                    : undefined;
            const remoteCandidate =
                remoteStat?.type === 'remote-candidate'
                    ? (remoteStat as RemoteCandidateStat)
                    : undefined;

            candidatePair = {
                localCandidateType: localCandidate?.candidateType ?? 'unknown',
                remoteCandidateType: remoteCandidate?.candidateType ?? 'unknown',
                currentRoundTripTime: activePair.currentRoundTripTime,
                availableOutgoingBitrate: activePair.availableOutgoingBitrate,
                state: activePair.state,
            };
        }

        // Save current bytes for next iteration's delta calculation.
        this._previousSample = {
            timestampMs: now,
            bytesReceived: newBytesReceived,
            bytesSent: newBytesSent,
        };

        this._log.info('webrtc-stats', {
            timestamp: new Date(now).toISOString(),
            candidatePair,
            inbound,
            outbound,
            remoteInbound,
        });
    }
}
