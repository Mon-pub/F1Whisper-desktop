import {expect} from 'chai';

import {ConnectionState} from '~/common/enum';
import {ACTIVE_TASK, type ActiveTask} from '~/common/network/protocol/task';
import {assert} from '~/common/utils/assert';
import {makeTestServices, makeTestUser} from '~/test/mocha/common/backend-mocks';

/**
 * Test the honesty of `ConnectedTaskManager.flushPendingOutgoing` (F1Whisper fork P-H12): the flush
 * must return the number of tasks STILL pending when it returns (0 = fully drained), so a caller can
 * establish whether the flush actually succeeded. Previously it returned the INITIAL count, making a
 * timed-out flush indistinguishable from a successful one.
 */
export function run(): void {
    describe('ConnectedTaskManager.flushPendingOutgoing honesty (F1Whisper fork P-H12)', function () {
        const me = makeTestUser('MEMEMEME');

        // A persistent task whose `run` never resolves, so the queue cannot drain within the flush
        // timeout (the "connected but a send is stuck" scenario).
        const neverResolvingTask: ActiveTask<void, 'persistent'> = {
            type: ACTIVE_TASK,
            persist: true,
            transaction: undefined,
            run: async () =>
                await new Promise<void>(() => {
                    // Intentionally never resolves: the "connected but a send is stuck" scenario.
                }),
        };

        it('returns 0 when the outgoing queue is already empty', async function () {
            const services = makeTestServices(me.identity.string);
            const connected = services.taskManager.replace(ConnectionState.CONNECTING);
            assert(connected !== undefined);

            const remaining = await connected.flushPendingOutgoing(50);
            expect(remaining).to.equal(0);
        });

        it('returns the remaining count (not 0) when a task cannot drain within the timeout', async function () {
            const services = makeTestServices(me.identity.string);
            const connected = services.taskManager.replace(ConnectionState.CONNECTING);
            assert(connected !== undefined);

            // Schedule a task that never completes (its promise is intentionally left pending).
            connected.schedule(neverResolvingTask).catch(() => {
                // The task never settles; this only satisfies the no-floating-promises rule.
            });

            const remaining = await connected.flushPendingOutgoing(100);
            // The flush timed out with the task still queued: a truthful non-zero remaining count,
            // never a misleading "success" (0).
            expect(remaining).to.equal(1);
        });
    });
}
