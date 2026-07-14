import type {ServicesForBackend} from '~/common/backend';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {CallId} from '~/common/network/types';
import {
    O2O_CALL_AUDIO_MAX_BITRATE_BPS,
    O2O_CALL_DATA_CHANNEL_PARAMETERS,
    O2O_CALL_MICROPHONE_TRACK_CONSTRAINTS,
    type AnyO2oCallContextAbort,
    type O2oCallConnectionHandle,
    type O2oCallConnectionState,
    type O2oCallContext,
    type O2oCallContextConfig,
    type O2oCallIceCandidate,
    type O2oCallIceServer,
    type O2oCallRemoteDescription,
} from '~/common/webrtc/o2o-call';
import {assert, ensureError, unreachable} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyEndpoint, type RemoteProxy} from '~/common/utils/endpoint';
import type {AbortListener, AbortRaiser} from '~/common/utils/signal';

/**
 * Apply the Threema Opus SDP munge (mirrors the Android `SdpPatcher`'s audio handling): force CBR
 * and cap the bitrate/sample rate to wideband speech, which is more than sufficient for a voice
 * call and keeps bandwidth usage low and predictable.
 *
 * Unlike the Android patcher, this does not strip non-Opus codecs or remap RTP header extension
 * IDs -- those exist to deal with SFU/video bundling concerns that do not apply to a direct (or
 * TURN-relayed) 1:1 audio-only peer connection.
 *
 * @throws {Error} if the SDP does not contain an Opus `a=rtpmap` line.
 */
function mungeOpusSdp(sdp: string): string {
    const rtpmapMatch = /^a=rtpmap:(?<payloadType>\d+) opus\/\d+(?:\/\d+)?$/mu.exec(sdp);
    const payloadType = rtpmapMatch?.groups?.payloadType;
    if (payloadType === undefined) {
        throw new Error('Unable to munge SDP: no Opus a=rtpmap line found');
    }

    const customParams =
        'stereo=0;sprop-stereo=0;cbr=1;maxaveragebitrate=16000;maxplaybackrate=8000;' +
        'sprop-maxcapturerate=8000;useinbandfec=1';

    const fmtpLineRe = new RegExp(`^a=fmtp:${payloadType} (?<params>.+)$`, 'mu');
    const fmtpMatch = fmtpLineRe.exec(sdp);
    if (fmtpMatch === null) {
        // No existing fmtp line for the Opus payload type, append one to the audio section
        // (immediately after the rtpmap line, as is customary).
        return sdp.replace(
            new RegExp(`^(a=rtpmap:${payloadType} opus/\\d+(?:/\\d+)?)$`, 'mu'),
            `$1\r\na=fmtp:${payloadType} ${customParams}`,
        );
    }

    // Rewrite the existing fmtp line: keep any parameters we don't care about, override the rest.
    const overriddenKeys = new Set([
        'stereo',
        'sprop-stereo',
        'cbr',
        'maxaveragebitrate',
        'maxplaybackrate',
        'sprop-maxcapturerate',
        'useinbandfec',
    ]);
    const keptParams = (fmtpMatch.groups?.params ?? '')
        .split(';')
        .map((param) => param.trim())
        .filter((param) => param !== '' && !overriddenKeys.has(param.split('=')[0] ?? ''));
    const newParams = [...keptParams, customParams].join(';');
    return sdp.replace(fmtpLineRe, `a=fmtp:${payloadType} ${newParams}`);
}

/**
 * Convert an {@link O2oCallIceServer} (a plain structural type, so this module stays usable from
 * the DOM-less backend worker) into a real (mutable) DOM {@link RTCIceServer}.
 */
function toRtcIceServer(server: O2oCallIceServer): RTCIceServer {
    const urls: string | string[] =
        typeof server.urls === 'string' ? server.urls : [...server.urls];
    return {
        urls,
        username: server.username,
        credential: server.credential,
    };
}

/**
 * Cap the outgoing audio {@link RTCRtpSender}'s encoding bitrate (belt-and-suspenders alongside the
 * SDP `maxaveragebitrate` munge above).
 */
async function capAudioSenderBitrate(pc: RTCPeerConnection): Promise<void> {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender === undefined) {
        return;
    }
    const parameters = sender.getParameters();
    if (parameters.encodings.length === 0) {
        parameters.encodings = [{}];
    }
    for (const encoding of parameters.encodings) {
        encoding.maxBitrate = O2O_CALL_AUDIO_MAX_BITRATE_BPS;
    }
    await sender.setParameters(parameters);
}

/**
 * DOM-side implementation of {@link O2oCallContext}. See that interface for the high-level
 * contract; this class owns the actual {@link RTCPeerConnection}, local microphone capture, SDP
 * munging, the negotiated signaling data channel, ICE candidate emission and audio-level polling.
 */
export class O2oCallContextProvider implements O2oCallContext {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _log: Logger;
    private readonly _connectionHandle: RemoteProxy<O2oCallConnectionHandle>;

    private _pc: RTCPeerConnection | undefined;
    private _microphoneTrack: MediaStreamTrack | undefined;
    private _dataChannel: RTCDataChannel | undefined;
    private _pendingRemoteIceCandidates: O2oCallIceCandidate[] = [];
    private _lastEmittedConnectionState: O2oCallConnectionState | undefined;
    // Remote audio playback stays entirely DOM-side: a `MediaStream` is not proxy-serializable, so
    // it can neither be sent to the backend worker nor (for a 1:1 call, unlike group calls which
    // mix multiple participants through a shared `AudioContext` in the Svelte layer) does it need
    // to be. A single hidden, autoplaying `<audio>` element is simplest and needs no UI wiring.
    private _remoteAudioElement: HTMLAudioElement | undefined;

    public constructor(
        private readonly _services: Pick<ServicesForBackend, 'endpoint' | 'logging'>,
        public readonly callId: CallId,
        private readonly _config: O2oCallContextConfig,
        private readonly _abort: AbortRaiser<AnyO2oCallContextAbort>,
        connectionHandle: ProxyEndpoint<O2oCallConnectionHandle>,
    ) {
        this._log = _services.logging.logger(`o2o-call.context-provider.${callId}`);
        // Wrap the worker-provided endpoint into a callable remote proxy (mirrors
        // `GroupCallContextProvider.connect()`'s `_services.endpoint.wrap<GroupCallConnectionHandle>`).
        this._connectionHandle = _services.endpoint.wrap<O2oCallConnectionHandle>(
            connectionHandle,
            this._log,
        );

        this._abort.subscribe((event) => {
            this._log.info('Aborted, cause:', event);
            this._teardown();
        });

        this._log.debug(`Created (callId=${callId})`);
    }

    public get abort(): AbortListener<AnyO2oCallContextAbort> {
        return this._abort;
    }

    /** @inheritdoc */
    public async createOffer(): Promise<string> {
        const pc = await this._ensurePeerConnection();
        this._createSignalingDataChannel(pc);

        const offer = await pc.createOffer();
        assert(offer.sdp !== undefined, 'createOffer() returned an offer without an SDP');
        const munged = mungeOpusSdp(offer.sdp);
        await pc.setLocalDescription({type: 'offer', sdp: munged});
        await capAudioSenderBitrate(pc);
        return munged;
    }

    /** @inheritdoc */
    public async createAnswer(): Promise<string> {
        const pc = await this._ensurePeerConnection();
        assert(
            pc.remoteDescription !== null,
            'createAnswer() called before a remote offer was set',
        );
        this._createSignalingDataChannel(pc);

        const answer = await pc.createAnswer();
        assert(answer.sdp !== undefined, 'createAnswer() returned an answer without an SDP');
        const munged = mungeOpusSdp(answer.sdp);
        await pc.setLocalDescription({type: 'answer', sdp: munged});
        await capAudioSenderBitrate(pc);
        return munged;
    }

    /** @inheritdoc */
    public async setRemoteDescription(description: O2oCallRemoteDescription): Promise<void> {
        const pc = await this._ensurePeerConnection();
        switch (description.type) {
            case 'offer':
                await pc.setRemoteDescription({type: 'offer', sdp: description.sdp});
                break;
            case 'answer':
            case 'pranswer':
                await pc.setRemoteDescription({type: description.type, sdp: description.sdp});
                break;
            default:
                unreachable(description);
        }

        // Replay any ICE candidates that arrived before the remote description was set.
        const pending = this._pendingRemoteIceCandidates;
        this._pendingRemoteIceCandidates = [];
        for (const candidate of pending) {
            await this._addIceCandidate(pc, candidate);
        }
    }

    /** @inheritdoc */
    public addIceCandidates(candidates: readonly O2oCallIceCandidate[]): void {
        const pc = this._pc;
        if (pc === undefined || pc.remoteDescription === null) {
            // No peer connection yet, or the remote description was not set yet: cache for replay.
            this._pendingRemoteIceCandidates.push(...candidates);
            return;
        }
        for (const candidate of candidates) {
            this._addIceCandidate(pc, candidate).catch((error: unknown) => {
                this._log.warn('Failed to add remote ICE candidate:', error);
            });
        }
    }

    private async _addIceCandidate(
        pc: RTCPeerConnection,
        candidate: O2oCallIceCandidate,
    ): Promise<void> {
        try {
            await pc.addIceCandidate({
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
                usernameFragment: candidate.ufrag ?? undefined,
            });
        } catch (error) {
            // A candidate that can no longer be applied (e.g. the connection already moved past
            // it) is not fatal, see the structbuf docs: "adding ICE candidates again has no
            // ill-effect". Log and continue.
            this._log.warn('addIceCandidate failed (non-fatal):', ensureError(error));
        }
    }

    /** @inheritdoc */
    public setMuted(muted: boolean): void {
        if (this._microphoneTrack !== undefined) {
            this._microphoneTrack.enabled = !muted;
        }
    }

    /** @inheritdoc */
    public close(): void {
        this._abort.raise({origin: 'main-thread', cause: 'disconnected'});
    }

    private async _ensurePeerConnection(): Promise<RTCPeerConnection> {
        if (this._pc !== undefined) {
            return this._pc;
        }

        this._log.debug('Capturing local microphone');
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: O2O_CALL_MICROPHONE_TRACK_CONSTRAINTS,
            video: false,
        });
        const [microphoneTrack] = stream.getAudioTracks();
        assert(microphoneTrack !== undefined, 'getUserMedia() returned no audio track');

        // The call may have been torn down (e.g. remote hangup) while the microphone permission
        // prompt / getUserMedia was pending. The abort already fired and will NOT fire again, so
        // the constructor's `_teardown()` subscriber ran as a no-op (nothing was assigned yet).
        // Release the freshly-granted capture ourselves and bail before building an
        // RTCPeerConnection + 200ms stats poll that would otherwise leak forever (mic stays hot).
        // This is the only `await` before the pc is fully wired, so one check closes the window.
        if (this._abort.aborted) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('O2o call context aborted during microphone capture');
        }
        this._microphoneTrack = microphoneTrack;

        this._log.debug('Creating peer connection');
        const pc = new RTCPeerConnection({
            iceServers: this._config.iceServers.map(toRtcIceServer),
            iceTransportPolicy: this._config.iceTransportPolicy,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
        });
        this._pc = pc;

        pc.addEventListener('icecandidate', (event) => {
            if (event.candidate === null) {
                return;
            }
            // Android's `SdpUtil.getIceCandidates()` feeds `sdpMLineIndex` into
            // `new IceCandidate(String, int, String)` (primitive int) and NPEs on a null Integer,
            // dropping the ENTIRE candidate batch. With `bundlePolicy: 'max-bundle'` every candidate
            // rides one transport, so an index-less candidate is never needed -- skip it rather than
            // put `sdpMLineIndex: null` on the wire.
            if (event.candidate.sdpMLineIndex === null) {
                this._log.debug('Skipping ICE candidate with null sdpMLineIndex');
                return;
            }
            this._connectionHandle
                .handleLocalIceCandidate({
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex,
                    ufrag: event.candidate.usernameFragment ?? null,
                })
                .catch((error: unknown) => {
                    this._log.warn('Failed to forward local ICE candidate to worker:', error);
                });
        });
        pc.addEventListener('icecandidateerror', (event) =>
            this._log.warn('ICE candidate error', event),
        );
        pc.addEventListener('iceconnectionstatechange', () => {
            this._log.debug(`ICE connection state: ${pc.iceConnectionState}`);
            this._handleConnectionStateChange(pc);
        });
        pc.addEventListener('connectionstatechange', () => {
            this._log.debug(`Connection state: ${pc.connectionState}`);
            this._handleConnectionStateChange(pc);
        });
        pc.addEventListener('track', (event) => this._handleRemoteTrack(event));

        pc.addTrack(microphoneTrack, stream);

        return pc;
    }

    /**
     * Play the remote peer's incoming audio through a hidden, autoplaying `<audio>` element. This
     * never leaves the DOM: neither the backend worker nor the Svelte UI ever see the
     * `MediaStream` (it isn't proxy-serializable, and there's exactly one remote peer here, so
     * there's no mixing to do as there is for group calls).
     */
    private _handleRemoteTrack(event: RTCTrackEvent): void {
        if (event.track.kind !== 'audio') {
            return;
        }
        if (this._remoteAudioElement === undefined) {
            // Note: `playsInline` is an `HTMLVideoElement`-only property (audio has no
            // inline-vs-fullscreen concept), so there's nothing to set for an `<audio>` element.
            const audio = new Audio();
            audio.autoplay = true;
            this._remoteAudioElement = audio;
        }
        const [remoteStream] = event.streams;
        this._remoteAudioElement.srcObject = remoteStream ?? new MediaStream([event.track]);
        this._remoteAudioElement.play().catch((error: unknown) => {
            this._log.warn('Failed to start remote audio playback:', error);
        });
    }

    private _handleConnectionStateChange(pc: RTCPeerConnection): void {
        // 'failed' ends the call outright (unrecoverable). 'disconnected' is treated as a
        // transient, possibly-recoverable state: surface it to the worker (so the UI can show a
        // "reconnecting" overlay) but do NOT tear down. Recovery is left to the ICE agent's own
        // continual connectivity checks on the existing candidate pairs; if they don't self-heal,
        // the manager's grace timeout ends the call. This mirrors the Android client, which
        // likewise performs NO signaled ICE restart -- it relies on continual gathering during a
        // short grace window and otherwise ends the call. 'closed' is only reachable via our own
        // close(), which already tears down separately, so it's reported but not treated as an
        // abort trigger here (avoids a double-abort).
        const state = pc.connectionState;
        const iceState = pc.iceConnectionState;

        let normalized: O2oCallConnectionState;
        if (state === 'closed') {
            normalized = 'closed';
        } else if (state === 'failed' || iceState === 'failed') {
            normalized = 'failed';
        } else if (state === 'disconnected' || iceState === 'disconnected') {
            normalized = 'reconnecting';
        } else if (state === 'connected') {
            normalized = 'connected';
        } else {
            // 'new' | 'connecting' | (iceState 'new'/'checking'/'connected'/'completed' with no
            // higher-priority connectionState signal yet)
            normalized = 'connecting';
        }

        if (normalized === 'failed') {
            if (!this._abort.aborted) {
                this._log.info(`Closed (by connection state '${state}'/'${iceState}')`);
                this._abort.raise({origin: 'main-thread', cause: 'disconnected'});
            }
        }

        this._emitConnectionState(normalized);
    }

    private _emitConnectionState(newState: O2oCallConnectionState): void {
        if (newState === this._lastEmittedConnectionState) {
            return;
        }
        this._lastEmittedConnectionState = newState;
        this._connectionHandle.handleConnectionState(newState).catch((error: unknown) => {
            this._log.warn('Failed to notify worker of connection state:', error);
        });
    }

    private _createSignalingDataChannel(pc: RTCPeerConnection): RTCDataChannel {
        if (this._dataChannel !== undefined) {
            return this._dataChannel;
        }
        const dc = pc.createDataChannel(O2O_CALL_DATA_CHANNEL_PARAMETERS.LABEL, {
            negotiated: true,
            ordered: true,
            id: O2O_CALL_DATA_CHANNEL_PARAMETERS.ID,
        });
        dc.addEventListener('open', () => this._log.debug(`Channel '${dc.label}' open`), {
            once: true,
        });
        dc.addEventListener('close', () => this._log.debug(`Channel '${dc.label}' closed`), {
            once: true,
        });
        dc.addEventListener('error', (event) =>
            this._log.warn(`Channel '${dc.label}' error`, event),
        );
        this._dataChannel = dc;
        return dc;
    }

    private _teardown(): void {
        this._dataChannel?.close();
        this._dataChannel = undefined;

        this._microphoneTrack?.stop();
        this._microphoneTrack = undefined;

        if (this._remoteAudioElement !== undefined) {
            this._remoteAudioElement.pause();
            this._remoteAudioElement.srcObject = null;
            this._remoteAudioElement = undefined;
        }

        this._pc?.close();
        this._pc = undefined;
    }
}
