import {expect} from 'chai';

import {NOOP_LOGGER} from '~/common/logging';
import type {u53} from '~/common/types';
import {TeardownCoordinator} from '~/electron/teardown-coordinator';

/**
 * Test the F1Whisper fork FU-H06 teardown coordinator: the single-flight `run()`, the `isTearingDown`
 * state that keeps the window alive (so a repeated quit cannot bypass the flush), `signalFlushDone`,
 * and the hard-cap / no-renderer fallbacks.
 */
export function run(): void {
    describe('TeardownCoordinator (F1Whisper fork FU-H06)', function () {
        function make(options: {
            readonly rendererAvailable: boolean;
            readonly hardCapMs?: u53;
        }): {
            readonly coordinator: TeardownCoordinator;
            readonly flushRequests: () => u53;
        } {
            let flushRequestCount = 0;
            const coordinator = new TeardownCoordinator({
                requestRendererFlush: () => {
                    flushRequestCount += 1;
                    return options.rendererAvailable;
                },
                rendererTimeoutMs: 1000,
                hardCapMs: options.hardCapMs ?? 40,
                log: NOOP_LOGGER,
            });
            return {coordinator, flushRequests: () => flushRequestCount};
        }

        it('resolves immediately when there is no renderer to flush', async function () {
            const {coordinator, flushRequests} = make({rendererAvailable: false});
            await coordinator.run();
            expect(flushRequests()).to.equal(1);
            expect(coordinator.isTearingDown).to.be.false;
        });

        it('resolves when the renderer signals done, before the hard cap', async function () {
            // Large hard cap: the only way this resolves promptly is via signalFlushDone.
            const {coordinator} = make({rendererAvailable: true, hardCapMs: 10_000});
            const running = coordinator.run();
            expect(coordinator.isTearingDown, 'tearing down while flushing').to.be.true;
            coordinator.signalFlushDone();
            await running;
            expect(coordinator.isTearingDown, 'no longer tearing down after flush').to.be.false;
        });

        it('resolves via the hard cap when the renderer never signals done', async function () {
            const {coordinator} = make({rendererAvailable: true, hardCapMs: 30});
            // Never call signalFlushDone; run() must still resolve via the hard cap.
            await coordinator.run();
            expect(coordinator.isTearingDown).to.be.false;
        });

        it('is single-flight: concurrent run() calls flush the renderer exactly once', async function () {
            const {coordinator, flushRequests} = make({rendererAvailable: true, hardCapMs: 10_000});
            const first = coordinator.run();
            const second = coordinator.run();
            coordinator.signalFlushDone();
            await Promise.all([first, second]);
            expect(flushRequests(), 'only one renderer flush for concurrent teardowns').to.equal(1);
        });

        it('keeps isTearingDown true for the whole flush (repeated quit cannot bypass it)', async function () {
            const {coordinator} = make({rendererAvailable: true, hardCapMs: 10_000});
            const running = coordinator.run();
            // A second teardown trigger arriving mid-flush must still observe an in-flight teardown,
            // which is what the close handler uses to keep the window alive.
            expect(coordinator.isTearingDown).to.be.true;
            coordinator.run().catch(() => {
                // The run() promise never rejects; the second teardown coalesces onto the first.
            });
            expect(coordinator.isTearingDown).to.be.true;
            coordinator.signalFlushDone();
            await running;
            expect(coordinator.isTearingDown).to.be.false;
        });
    });
}
