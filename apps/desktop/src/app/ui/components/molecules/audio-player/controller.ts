import {globals} from '~/app/globals';
import type {Logger} from '~/common/logging';
import type {MessageId} from '~/common/network/types';
import type {WeakOpaque, f64} from '~/common/types';
import {ensureError, unreachable} from '~/common/utils/assert';
import {WritableStore, type IQueryableStore} from '~/common/utils/store';

/**
 * Identity used to key persistent audio playback: a real {@link MessageId} for conversation
 * messages, or a synthetic fallback for the rare context that renders an audio player without a
 * message id.
 */
export type AudioPlaybackId = WeakOpaque<bigint, {readonly AudioPlaybackId: unique symbol}>;

/**
 * Supported playback speeds, mirroring the speed control in the audio player.
 */
export type PlaybackSpeed = 0.5 | 1 | 1.25 | 1.5 | 2;

/**
 * Cycle to the next playback speed, in the fixed order used by the inline audio player's speed
 * control. Shared with the voice-playback banner so both surfaces cycle identically.
 */
export function cyclePlaybackSpeed(current: PlaybackSpeed): PlaybackSpeed {
    switch (current) {
        case 0.5:
            return 1;
        case 1:
            return 1.25;
        case 1.25:
            return 1.5;
        case 1.5:
            return 2;
        case 2:
            return 0.5;
        default:
            return unreachable(current);
    }
}

/**
 * FU-M05 (listen-once local hardening): decide whether playback of a listen-once voice message must
 * be LOCKED at a given entry point.
 *
 * A not-yet-consumed inbound listen-once voice message may only be played where it will actually be
 * consumed (burned) when it finishes. Every playing surface wires a consume callback for that; a
 * surface that does NOT (e.g. the search-result preview list) must not be able to play the message
 * at all, or the listen-once could be heard without being burned. This is the single choke point
 * that covers EVERY playback entry point.
 */
export function isListenOncePlaybackLocked(params: {
    readonly listenOnce: boolean;
    readonly listenOnceConsumed: boolean;
    readonly hasConsumeCallback: boolean;
}): boolean {
    return params.listenOnce && !params.listenOnceConsumed && !params.hasConsumeCallback;
}

/**
 * Decide whether the persistent voice-playback banner should be visible.
 *
 * Mirrors the shipped F1Whisper Android banner behaviour: show whenever a (non listen-once) voice
 * message is playing and the user is NOT currently viewing the conversation that owns it. The banner
 * is hidden inside the owning chat (where the inline player is already visible) and never shown for
 * listen-once playback (which must be heard in context and burned, never replayed from a banner).
 */
export function shouldShowVoiceBanner(params: {
    readonly hasActivePlayback: boolean;
    readonly isListenOnce: boolean;
    readonly isViewingOwningConversation: boolean;
}): boolean {
    return params.hasActivePlayback && !params.isListenOnce && !params.isViewingOwningConversation;
}

/**
 * FU-M05 (listen-once anti-replay): decide whether a seek from `fromSeconds` to `toSeconds` is
 * allowed. A listen-once voice message may only seek FORWARD (toward its single-play burn); backward
 * seeks are blocked so it can never be rewound to be re-heard. Regular messages seek freely.
 */
export function isSeekAllowed(isListenOnce: boolean, fromSeconds: f64, toSeconds: f64): boolean {
    return !isListenOnce || toSeconds >= fromSeconds;
}

/**
 * FU-M05 (listen-once anti-replay): decide whether a message whose single play has reached its end
 * may be replayed (restarted from the beginning). A listen-once message may NOT be restarted once its
 * one play is over; regular messages replay freely.
 */
export function isReplayAfterEndAllowed(isListenOnce: boolean): boolean {
    return !isListenOnce;
}

/**
 * Reinterpret a {@link MessageId} as an {@link AudioPlaybackId}.
 */
export function toAudioPlaybackId(messageId: MessageId): AudioPlaybackId {
    return messageId as unknown as AudioPlaybackId;
}

/**
 * Reinterpret an {@link AudioPlaybackId} back into the {@link MessageId} it was derived from, or
 * `undefined` for a synthetic fallback id (always negative), which does not correspond to a real
 * message and therefore cannot be jumped to.
 */
export function tryAudioPlaybackIdToMessageId(id: AudioPlaybackId): MessageId | undefined {
    return (id as unknown as bigint) < 0n ? undefined : (id as unknown as MessageId);
}

let fallbackAudioPlaybackIdCounter = 0n;

/**
 * Create a unique fallback playback id for a context that has no message id. The value is negative,
 * so it can never collide with a real (unsigned) {@link MessageId}.
 */
export function createFallbackAudioPlaybackId(): AudioPlaybackId {
    fallbackAudioPlaybackIdCounter -= 1n;
    return fallbackAudioPlaybackIdCounter as AudioPlaybackId;
}

/**
 * Reactive view of the app-wide audio playback state. Only a single audio message plays at a time,
 * so this describes the one active playback (if any).
 */
export interface AudioPlaybackState {
    /**
     * The message currently loaded into the shared audio element, or `undefined` when nothing is
     * loaded.
     */
    readonly activeId: AudioPlaybackId | undefined;
    /** Whether the active playback is paused. */
    readonly paused: boolean;
    /** Current playback position, in seconds. */
    readonly currentTime: f64;
    /** Duration of the active audio, in seconds (0 until known). */
    readonly duration: f64;
    /** Current playback speed. */
    readonly playbackSpeed: PlaybackSpeed;
    /**
     * Whether the active message is an inbound listen-once voice message. The persistent banner
     * excludes listen-once playback, and the controller uses it to block restart / backward seek.
     */
    readonly isListenOnce: boolean;
}

/**
 * A request to start (or take over) playback of an audio message.
 */
export interface AudioPlaybackRequest {
    readonly id: AudioPlaybackId;
    /**
     * The already-decoded audio blob. The player component loads this for its waveform, so we reuse
     * it here instead of fetching a second time. The controller owns the resulting object URL for
     * its whole lifetime, keeping the blob data alive even after the originating component unmounts.
     */
    readonly blob: Blob;
    /** Duration hint from message metadata, used until the element reports its own duration. */
    readonly durationHint: f64;
    /** Position to start playback from, in seconds. Defaults to the start. */
    readonly startPositionSeconds?: f64;
    readonly playbackSpeed: PlaybackSpeed;
    /**
     * Whether this is an inbound listen-once voice message. Carried into the controller state so the
     * banner can exclude it and the controller can block restart / backward seek for that session.
     */
    readonly isListenOnce: boolean;
    /**
     * Consume hook for an inbound listen-once voice message. The controller invokes it exactly once,
     * when started playback of THIS message becomes terminal: natural end, explicit stop,
     * replacement, playback error, or abandonment by its component. Leave `undefined` for regular
     * (non listen-once) messages.
     */
    readonly onListenOnceConsumed?: () => void;
}

interface ListenOncePlaybackSession {
    readonly id: AudioPlaybackId;
    readonly onConsumed: (() => void) | undefined;
    started: boolean;
}

const IDLE_STATE: AudioPlaybackState = {
    activeId: undefined,
    paused: true,
    currentTime: 0,
    duration: 0,
    playbackSpeed: 1,
    isListenOnce: false,
};

/**
 * App-scoped, persistent audio playback controller.
 *
 * It owns a single {@link HTMLAudioElement} that is NOT attached to any component's DOM, letting
 * regular audio survive conversation switches (which unmount and destroy the per-message player
 * components). The {@link AudioPlayer} component is a view over this controller: it renders
 * {@link state} and issues commands. Listen-once components explicitly abandon their active session
 * on unmount so a started single play becomes terminal.
 */
class AudioPlaybackController {
    private readonly _log: Logger;
    private readonly _element: HTMLAudioElement;
    private readonly _state: WritableStore<AudioPlaybackState>;

    /** Listen-once message ids finalized in this app session, retained as an in-memory replay guard. */
    private readonly _terminalListenOnceIds = new Set<AudioPlaybackId>();

    /** Object URL currently assigned to the shared element; revoked when replaced or cleared. */
    private _objectUrl: string | undefined = undefined;

    /** Active listen-once playback, retained until it is finalized or discarded before starting. */
    private _listenOnceSession: ListenOncePlaybackSession | undefined = undefined;

    /** True while the slider is being dragged, so a scrub pause does not flip the paused state. */
    private _scrubbing = false;

    /**
     * FU-M05 (listen-once local hardening): whether the active playback is an inbound listen-once
     * voice message. While set, the controller blocks backward seeks and restart so the message
     * cannot be re-heard within its single play.
     */
    private _listenOnce = false;

    /**
     * Create the controller over a single detached audio element that is not attached to any
     * component's DOM, so regular playback survives conversation switches.
     *
     * @param element Audio element to drive. Defaults to a fresh detached {@link Audio}; injectable
     *   for testing.
     * @param log Logger. Defaults to the UI logging factory; injectable for testing.
     */
    public constructor(element: HTMLAudioElement = new Audio(), log?: Logger) {
        this._log =
            log ?? globals.unwrap().uiLogging.logger('ui.component.audio-player.controller');
        this._state = new WritableStore<AudioPlaybackState>(IDLE_STATE);

        element.addEventListener('timeupdate', this._handleTimeUpdate);
        element.addEventListener('durationchange', this._handleDurationChange);
        element.addEventListener('ended', this._handleEnded);
        element.addEventListener('error', this._handleError);
        this._element = element;
    }

    /**
     * Reactive store describing the single active playback. Components subscribe to this to render
     * play/pause state, position, duration and speed for the message they represent.
     */
    public get state(): IQueryableStore<AudioPlaybackState> {
        return this._state;
    }

    /**
     * Toggle playback for the given request. If the request's message is already active, this pauses
     * or resumes it; otherwise it replaces the active playback with the requested message.
     */
    public async toggle(request: AudioPlaybackRequest): Promise<void> {
        // The model update fired by the consume hook crosses an async boundary. Keep an immediate
        // session-local guard so the same message cannot be replayed before its reactive view burns.
        if (this._terminalListenOnceIds.has(request.id)) {
            return;
        }
        if (this._state.get().activeId === request.id) {
            if (this._element.paused) {
                await this._resume();
            } else {
                this._pause();
            }
            return;
        }
        await this._replace(request);
    }

    /**
     * Seek the given message to a position, if it is the active one (no-op otherwise).
     */
    public seek(id: AudioPlaybackId, positionSeconds: f64): void {
        if (this._state.get().activeId !== id || this._terminalListenOnceIds.has(id)) {
            return;
        }
        // Listen-once (FU-M05): block backward seeks so the single play cannot be rewound to
        // re-hear it. Forward seeks are allowed (they only bring the play closer to its burn).
        if (!isSeekAllowed(this._listenOnce, this._element.currentTime, positionSeconds)) {
            return;
        }
        this._element.currentTime = positionSeconds;
        this._patch({currentTime: positionSeconds});
    }

    /**
     * Set the playback speed for the given message, if it is the active one (no-op otherwise).
     */
    public setSpeed(id: AudioPlaybackId, speed: PlaybackSpeed): void {
        if (this._state.get().activeId !== id) {
            return;
        }
        this._element.playbackRate = speed;
        this._patch({playbackSpeed: speed});
    }

    /**
     * Pause the active message for the duration of a slider scrub, without flipping the logical
     * paused state (so the play/pause control does not flicker while dragging). No-op unless the
     * given message is active and playing.
     */
    public beginScrub(id: AudioPlaybackId): void {
        if (this._state.get().activeId !== id || this._element.paused) {
            return;
        }
        this._scrubbing = true;
        this._element.pause();
    }

    /**
     * End a slider scrub started with {@link beginScrub}; resume playback if it was logically
     * playing.
     */
    public endScrub(id: AudioPlaybackId): void {
        if (!this._scrubbing || this._state.get().activeId !== id) {
            this._scrubbing = false;
            return;
        }
        this._scrubbing = false;
        if (!this._state.get().paused) {
            this._resume().catch((error: unknown) => {
                this._log.error('Failed to resume playback after scrub', ensureError(error));
            });
        }
    }

    /**
     * Toggle play/pause for the currently active message, if any. Used by the persistent
     * voice-playback banner, which controls the active playback without holding the audio blob.
     */
    public togglePlayPause(): void {
        const activeId = this._state.get().activeId;
        if (activeId === undefined || this._terminalListenOnceIds.has(activeId)) {
            return;
        }
        if (this._element.paused) {
            this._resume().catch((error: unknown) => {
                this._log.error('Failed to resume playback', ensureError(error));
            });
        } else {
            this._pause();
        }
    }

    /**
     * Cycle the playback speed of the currently active message (banner speed control). No-op when
     * nothing is active.
     */
    public cycleSpeed(): void {
        const {activeId, playbackSpeed} = this._state.get();
        if (activeId === undefined) {
            return;
        }
        this.setSpeed(activeId, cyclePlaybackSpeed(playbackSpeed));
    }

    /**
     * Stop playback entirely and reset to idle (banner close button). Started listen-once playback
     * becomes terminal and is consumed; regular audio retains its established stop behaviour.
     */
    public stop(): void {
        this._element.pause();
        this._finalizeActiveListenOnce();
        this._listenOnce = false;
        this._scrubbing = false;
        this._clearElementSource();
        this._state.set(IDLE_STATE);
    }

    /**
     * Abandon playback owned by an unmounting component. This is intentionally a no-op for regular
     * audio, whose app-scoped playback must continue across conversation switches. A matching
     * listen-once playback is stopped and finalized so it cannot continue invisibly or be replayed.
     */
    public abandon(id: AudioPlaybackId): void {
        if (this._state.get().activeId !== id || !this._listenOnce) {
            return;
        }
        this.stop();
    }

    private async _replace(request: AudioPlaybackRequest): Promise<void> {
        // Replacement makes any already-started listen-once session terminal before the shared
        // element is repointed. Regular playback is replaced exactly as before.
        this._element.pause();
        this._finalizeActiveListenOnce();
        this._listenOnce = request.isListenOnce;
        this._listenOnceSession = request.isListenOnce
            ? {
                  id: request.id,
                  onConsumed: request.onListenOnceConsumed,
                  started: false,
              }
            : undefined;
        this._scrubbing = false;
        this._revokeObjectUrl();

        const url = URL.createObjectURL(request.blob);
        this._objectUrl = url;
        this._element.src = url;
        this._element.playbackRate = request.playbackSpeed;
        this._element.currentTime = request.startPositionSeconds ?? 0;

        this._state.set({
            activeId: request.id,
            paused: false,
            currentTime: request.startPositionSeconds ?? 0,
            duration: Number.isFinite(this._element.duration)
                ? this._element.duration
                : request.durationHint,
            playbackSpeed: request.playbackSpeed,
            isListenOnce: request.isListenOnce,
        });

        await this._play();
    }

    private async _resume(): Promise<void> {
        const activeId = this._state.get().activeId;
        if (activeId !== undefined && this._terminalListenOnceIds.has(activeId)) {
            return;
        }
        // If playback is at (or past) the end, rewind before replaying.
        if (
            Number.isFinite(this._element.duration) &&
            this._element.currentTime >= this._element.duration
        ) {
            // Listen-once (FU-M05): never rewind/restart; the single play is over.
            if (!isReplayAfterEndAllowed(this._listenOnce)) {
                return;
            }
            this._element.currentTime = 0;
            this._patch({currentTime: 0});
        }
        this._patch({paused: false});
        await this._play();
    }

    private _pause(): void {
        this._element.pause();
        this._patch({paused: true});
    }

    private async _play(): Promise<void> {
        const listenOnceSession = this._listenOnceSession;
        try {
            await this._element.play();
            // `play()` may resolve after a stop/replacement. Only mark the exact session that still
            // owns the element as started.
            if (listenOnceSession !== undefined && this._listenOnceSession === listenOnceSession) {
                listenOnceSession.started = true;
            }
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                this._log.warn('Could not play audio: DOMException AbortError');
                return;
            }
            this._log.error('Could not play audio: ', ensureError(error));
        }
    }

    private readonly _handleTimeUpdate = (): void => {
        this._patch({currentTime: this._element.currentTime});
    };

    private readonly _handleDurationChange = (): void => {
        if (Number.isFinite(this._element.duration)) {
            this._patch({duration: this._element.duration});
        }
    };

    private readonly _handleEnded = (): void => {
        this._patch({paused: true});
        if (this._listenOnce) {
            this._finalizeActiveListenOnce();
            // Drop decoded bytes immediately. The state keeps the now-paused message active while
            // the session replay guard blocks commands until the model's consumed view arrives.
            this._clearElementSource();
        }
    };

    private readonly _handleError = (): void => {
        this._patch({paused: true});
        this._log.error('Audio playback element error', this._element.error ?? undefined);
        if (this._listenOnce) {
            this._finalizeActiveListenOnce();
            this._clearElementSource();
        }
    };

    /** Finalize the active listen-once session at most once if playback actually started. */
    private _finalizeActiveListenOnce(): void {
        const session = this._listenOnceSession;
        this._listenOnceSession = undefined;
        if (session?.started !== true) {
            return;
        }
        if (this._terminalListenOnceIds.has(session.id)) {
            return;
        }
        // Arm replay protection before invoking external code, including against re-entrant calls.
        this._terminalListenOnceIds.add(session.id);
        session.onConsumed?.();
    }

    private _patch(partial: Partial<AudioPlaybackState>): void {
        this._state.update((current) => ({...current, ...partial}));
    }

    /** Detach and unload the shared element's source, then revoke its object URL. */
    private _clearElementSource(): void {
        this._element.removeAttribute('src');
        this._element.load();
        this._revokeObjectUrl();
    }

    private _revokeObjectUrl(): void {
        if (this._objectUrl !== undefined) {
            URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = undefined;
        }
    }
}

let controller: AudioPlaybackController | undefined = undefined;

/**
 * Get the app-scoped audio playback controller, creating it on first use.
 *
 * Note: Constructed lazily (on the first playback interaction) so that {@link globals} is already
 * initialized and the renderer DOM is available for the shared audio element.
 */
export function getAudioPlaybackController(): AudioPlaybackController {
    controller ??= new AudioPlaybackController();
    return controller;
}

/**
 * Test-only factory: construct a controller with injected dependencies so tests can drive the wired
 * playback path against a mock audio element without a DOM. Application code MUST use
 * {@link getAudioPlaybackController} (the shared singleton).
 */
export function createAudioPlaybackControllerForTesting(
    element: HTMLAudioElement,
    log: Logger,
): AudioPlaybackController {
    return new AudioPlaybackController(element, log);
}

export type {AudioPlaybackController};
