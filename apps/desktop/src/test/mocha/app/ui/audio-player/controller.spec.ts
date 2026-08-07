import {expect} from 'chai';

import {
    type AudioPlaybackId,
    createAudioPlaybackControllerForTesting,
    cyclePlaybackSpeed,
    isListenOncePlaybackLocked,
    isReplayAfterEndAllowed,
    isSeekAllowed,
    type PlaybackSpeed,
    shouldShowVoiceBanner,
    tryAudioPlaybackIdToMessageId,
} from '~/app/ui/components/molecules/audio-player/controller';
import type {Logger} from '~/common/logging';

/** No-op logger for the controller under test. */
const NOOP_LOGGER = {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    assert: () => {},
} as unknown as Logger;

/**
 * Minimal fake of the subset of `HTMLAudioElement` that the controller drives. It is NOT a DOM
 * harness: it just records play/pause and lets a test dispatch the `ended` event, so the wired
 * terminal/anti-replay path (consume-once, revoke, block replay/backward-seek) can be exercised in
 * node.
 */
class FakeAudioElement {
    public readonly error = null;
    public paused = true;
    public currentTime = 0;
    public duration = Number.NaN; // Like a real element before metadata is known
    public playbackRate = 1;
    public src = '';
    public playCount = 0;
    private readonly _listeners = new Map<string, () => void>();

    public addEventListener(type: string, handler: () => void): void {
        this._listeners.set(type, handler);
    }

    public removeAttribute(name: string): void {
        if (name === 'src') {
            this.src = '';
        }
    }

    public load(): void {
        // No-op: a real element would abort/reset here.
    }

    public async play(): Promise<void> {
        this.paused = false;
        this.playCount += 1;
        return await Promise.resolve();
    }

    public pause(): void {
        this.paused = true;
    }

    /** Fire the `ended` event, as a real element does when playback reaches the end. */
    public dispatchEnded(): void {
        this._listeners.get('ended')?.();
    }
}

// Reference to the (browser-only) object-URL APIs, which are stubbed for the wired-path tests. The
// `Pick` reuses the DOM lib's own member names (rather than re-declaring the browser-cased
// `createObjectURL` / `revokeObjectURL`), so it stays type-safe without an eslint-disable.
const objectUrlApi: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL;

/**
 * Tests for the app-scoped audio playback controller: the pure decision helpers (shared speed cycle,
 * the FU-M05 listen-once playback LOCK that covers every entry point incl. the search-result preview
 * list, the banner visibility rule, the jump-to-message fallback-id guard, and the FU-M05 anti-replay
 * seek/restart decisions), plus the WIRED terminal/anti-replay path driven against a mock audio
 * element (single-shot consume, object-URL revoke, and blocked replay / backward seek).
 */
export function run(): void {
    describe('Audio playback controller helpers', function () {
        describe('cyclePlaybackSpeed', function () {
            it('cycles through the fixed speed order and wraps', function () {
                expect(cyclePlaybackSpeed(0.5)).to.equal(1);
                expect(cyclePlaybackSpeed(1)).to.equal(1.25);
                expect(cyclePlaybackSpeed(1.25)).to.equal(1.5);
                expect(cyclePlaybackSpeed(1.5)).to.equal(2);
                expect(cyclePlaybackSpeed(2)).to.equal(0.5);
            });

            it('returns a full cycle back to the starting speed', function () {
                let speed: PlaybackSpeed = 1;
                for (let i = 0; i < 5; i++) {
                    speed = cyclePlaybackSpeed(speed);
                }
                expect(speed).to.equal(1);
            });
        });

        describe('isListenOncePlaybackLocked (FU-M05)', function () {
            it('LOCKS a not-yet-consumed listen-once with no consume callback (search-entry path)', function () {
                // This is the search-result preview list case: it wires no consume callback, so a
                // listen-once must not be playable there (it could otherwise be heard without being
                // burned).
                expect(
                    isListenOncePlaybackLocked({
                        listenOnce: true,
                        listenOnceConsumed: false,
                        hasConsumeCallback: false,
                    }),
                ).to.equal(true);
            });

            it('does NOT lock a listen-once with a consume callback (conversation path)', function () {
                expect(
                    isListenOncePlaybackLocked({
                        listenOnce: true,
                        listenOnceConsumed: false,
                        hasConsumeCallback: true,
                    }),
                ).to.equal(false);
            });

            it('does NOT lock an already-consumed listen-once', function () {
                expect(
                    isListenOncePlaybackLocked({
                        listenOnce: true,
                        listenOnceConsumed: true,
                        hasConsumeCallback: false,
                    }),
                ).to.equal(false);
            });

            it('does NOT lock a regular (non listen-once) audio message', function () {
                expect(
                    isListenOncePlaybackLocked({
                        listenOnce: false,
                        listenOnceConsumed: false,
                        hasConsumeCallback: false,
                    }),
                ).to.equal(false);
            });
        });

        describe('shouldShowVoiceBanner', function () {
            it('shows when a non listen-once voice plays and the owning chat is not open', function () {
                expect(
                    shouldShowVoiceBanner({
                        hasActivePlayback: true,
                        isListenOnce: false,
                        isViewingOwningConversation: false,
                    }),
                ).to.equal(true);
            });

            it('hides when nothing is playing', function () {
                expect(
                    shouldShowVoiceBanner({
                        hasActivePlayback: false,
                        isListenOnce: false,
                        isViewingOwningConversation: false,
                    }),
                ).to.equal(false);
            });

            it('hides while the user is viewing the owning conversation', function () {
                expect(
                    shouldShowVoiceBanner({
                        hasActivePlayback: true,
                        isListenOnce: false,
                        isViewingOwningConversation: true,
                    }),
                ).to.equal(false);
            });

            it('never shows for listen-once playback', function () {
                expect(
                    shouldShowVoiceBanner({
                        hasActivePlayback: true,
                        isListenOnce: true,
                        isViewingOwningConversation: false,
                    }),
                ).to.equal(false);
            });
        });

        describe('isSeekAllowed (FU-M05 anti-replay)', function () {
            it('blocks a BACKWARD seek for a listen-once message', function () {
                expect(isSeekAllowed(true, 5, 1)).to.equal(false);
            });

            it('allows a FORWARD seek for a listen-once message (toward the burn)', function () {
                expect(isSeekAllowed(true, 5, 8)).to.equal(true);
            });

            it('allows a same-position seek for a listen-once message', function () {
                expect(isSeekAllowed(true, 5, 5)).to.equal(true);
            });

            it('allows backward and forward seeks for a regular message', function () {
                expect(isSeekAllowed(false, 5, 1)).to.equal(true);
                expect(isSeekAllowed(false, 5, 8)).to.equal(true);
            });
        });

        describe('isReplayAfterEndAllowed (FU-M05 anti-replay)', function () {
            it('blocks replay of a listen-once message after its single play ends', function () {
                expect(isReplayAfterEndAllowed(true)).to.equal(false);
            });

            it('allows replay of a regular message', function () {
                expect(isReplayAfterEndAllowed(false)).to.equal(true);
            });
        });

        describe('tryAudioPlaybackIdToMessageId', function () {
            it('maps a real (non-negative) playback id back to a message id', function () {
                const id = 123n as unknown as AudioPlaybackId;
                const messageId = tryAudioPlaybackIdToMessageId(id);
                expect(messageId).to.not.equal(undefined);
                expect(messageId as unknown as bigint).to.equal(123n);
            });

            it('returns undefined for a synthetic fallback (negative) id', function () {
                const id = -1n as unknown as AudioPlaybackId;
                expect(tryAudioPlaybackIdToMessageId(id)).to.equal(undefined);
            });
        });
    });

    describe('Audio playback controller anti-replay (wired path, FU-M05)', function () {
        let revokedUrls: string[];
        let originalCreate: typeof objectUrlApi.createObjectURL;
        let originalRevoke: typeof objectUrlApi.revokeObjectURL;

        beforeEach(function () {
            // Stub the browser-only object-URL APIs (absent in the node test env) and record revokes.
            revokedUrls = [];
            originalCreate = objectUrlApi.createObjectURL;
            originalRevoke = objectUrlApi.revokeObjectURL;
            let counter = 0;
            objectUrlApi.createObjectURL = () => `blob:fake-${(counter += 1)}`;
            objectUrlApi.revokeObjectURL = (url: string) => {
                revokedUrls.push(url);
            };
        });

        afterEach(function () {
            objectUrlApi.createObjectURL = originalCreate;
            objectUrlApi.revokeObjectURL = originalRevoke;
        });

        it('consumes a listen-once exactly once on end, revokes its URL, then blocks replay and backward seek', async function () {
            const element = new FakeAudioElement();
            const controller = createAudioPlaybackControllerForTesting(
                element as unknown as HTMLAudioElement,
                NOOP_LOGGER,
            );
            let consumeCount = 0;
            const id = 7n as unknown as AudioPlaybackId;
            const request = {
                id,
                blob: new Blob(['audio']),
                durationHint: 10,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: true,
                onListenOnceConsumed: () => {
                    consumeCount += 1;
                },
            };

            // First play.
            await controller.toggle(request);
            expect(element.playCount).to.equal(1);

            // Backward seek DURING play is blocked; forward seek is allowed.
            element.duration = 10;
            element.currentTime = 5;
            controller.seek(id, 1);
            expect(element.currentTime).to.equal(5);
            controller.seek(id, 8);
            expect(element.currentTime).to.equal(8);

            // Reaching the end consumes exactly once and revokes the object URL.
            element.currentTime = 10;
            element.dispatchEnded();
            expect(consumeCount).to.equal(1);
            expect(revokedUrls.length).to.be.greaterThan(0);

            // A repeated `ended` event never fires the consume a second time.
            element.dispatchEnded();
            expect(consumeCount).to.equal(1);

            // Anti-replay: toggling the same (now consumed) message again does not restart playback.
            const playCountAfterEnd = element.playCount;
            element.paused = true;
            await controller.toggle(request);
            expect(element.playCount).to.equal(playCountAfterEnd);
        });

        it('makes started listen-once playback terminal on stop and consumes exactly once', async function () {
            const element = new FakeAudioElement();
            const controller = createAudioPlaybackControllerForTesting(
                element as unknown as HTMLAudioElement,
                NOOP_LOGGER,
            );
            let consumeCount = 0;
            const id = 8n as unknown as AudioPlaybackId;
            const request = {
                id,
                blob: new Blob(['audio']),
                durationHint: 10,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: true,
                onListenOnceConsumed: () => {
                    consumeCount += 1;
                },
            };
            await controller.toggle(request);

            element.duration = 10;
            element.currentTime = 4;
            controller.stop();

            expect(consumeCount).to.equal(1);
            expect(revokedUrls.length).to.be.greaterThan(0);

            // Repeated terminal signals cannot consume twice, and the same message cannot restart
            // while its asynchronous model update is still propagating.
            controller.stop();
            element.dispatchEnded();
            await controller.toggle(request);
            expect(consumeCount).to.equal(1);
            expect(element.playCount).to.equal(1);
        });

        it('finalizes a started listen-once when another message replaces it', async function () {
            const element = new FakeAudioElement();
            const controller = createAudioPlaybackControllerForTesting(
                element as unknown as HTMLAudioElement,
                NOOP_LOGGER,
            );
            let consumeCount = 0;
            const listenOnceId = 10n as unknown as AudioPlaybackId;
            const listenOnceRequest = {
                id: listenOnceId,
                blob: new Blob(['listen-once']),
                durationHint: 10,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: true,
                onListenOnceConsumed: () => {
                    consumeCount += 1;
                },
            };
            const regularId = 11n as unknown as AudioPlaybackId;

            await controller.toggle(listenOnceRequest);
            await controller.toggle({
                id: regularId,
                blob: new Blob(['regular']),
                durationHint: 20,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: false,
            });

            expect(consumeCount).to.equal(1);
            expect(controller.state.get().activeId).to.equal(regularId);
            expect(element.playCount).to.equal(2);

            // The finalized message cannot replace the regular playback again this session.
            await controller.toggle(listenOnceRequest);
            expect(consumeCount).to.equal(1);
            expect(controller.state.get().activeId).to.equal(regularId);
            expect(element.playCount).to.equal(2);
        });

        it('finalizes abandoned listen-once playback but leaves regular audio playing', async function () {
            const element = new FakeAudioElement();
            const controller = createAudioPlaybackControllerForTesting(
                element as unknown as HTMLAudioElement,
                NOOP_LOGGER,
            );
            let consumeCount = 0;
            const listenOnceId = 12n as unknown as AudioPlaybackId;
            await controller.toggle({
                id: listenOnceId,
                blob: new Blob(['listen-once']),
                durationHint: 10,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: true,
                onListenOnceConsumed: () => {
                    consumeCount += 1;
                },
            });

            controller.abandon(listenOnceId);
            controller.abandon(listenOnceId);
            expect(consumeCount).to.equal(1);
            expect(controller.state.get().activeId).to.equal(undefined);

            const regularId = 13n as unknown as AudioPlaybackId;
            await controller.toggle({
                id: regularId,
                blob: new Blob(['regular']),
                durationHint: 10,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: false,
            });
            controller.abandon(regularId);
            expect(controller.state.get().activeId).to.equal(regularId);
            expect(element.paused).to.equal(false);
            controller.stop();
        });

        it('allows a regular (non listen-once) message to replay from end and seek backward', async function () {
            const element = new FakeAudioElement();
            const controller = createAudioPlaybackControllerForTesting(
                element as unknown as HTMLAudioElement,
                NOOP_LOGGER,
            );
            const id = 9n as unknown as AudioPlaybackId;
            const request = {
                id,
                blob: new Blob(['audio']),
                durationHint: 10,
                playbackSpeed: 1 as PlaybackSpeed,
                isListenOnce: false,
            };
            await controller.toggle(request);

            // Backward seek is allowed for a regular message.
            element.duration = 10;
            element.currentTime = 5;
            controller.seek(id, 1);
            expect(element.currentTime).to.equal(1);

            // Replay from the end is allowed (rewinds to 0).
            element.currentTime = 10;
            element.paused = true;
            await controller.toggle(request);
            expect(element.currentTime).to.equal(0);
        });
    });
}
