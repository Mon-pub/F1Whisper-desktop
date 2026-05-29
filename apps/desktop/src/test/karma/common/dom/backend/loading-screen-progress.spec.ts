import {expect} from 'chai';

import type {LoadingState} from '~/common/dom/backend';
import {
    type LoadingScreenProgressContext,
    wireLoadingScreenProgress,
} from '~/common/dom/backend/loading-screen-progress';
import {ConnectionState} from '~/common/enum';
import {LoadingInfo} from '~/common/loading';
import {NOOP_LOGGER} from '~/common/logging';
import type {u32, u53} from '~/common/types';
import {ResolvablePromise} from '~/common/utils/resolvable-promise';
import {WritableStore} from '~/common/utils/store';
import {TIMER} from '~/common/utils/timer';

/**
 * Drain all currently-queued microtasks (and any they queue in turn) by yielding to a macrotask.
 */
async function flushMicrotasks(): Promise<void> {
    await TIMER.sleep(0);
}

/**
 * Build a {@link wireLoadingScreenProgress} context backed by test doubles whose async results
 * (`reflectionQueueLength` / `reflectionQueueDry`) and connection state can be controlled by the
 * test, so that the ordering relevant for the loading-screen race can be reproduced
 * deterministically.
 */
function setup(): {
    readonly loadingInfo: LoadingInfo;
    readonly stateStore: WritableStore<ConnectionState>;
    readonly reflectionQueueLength: ResolvablePromise<u53>;
    readonly reflectionQueueDry: ResolvablePromise<void>;
    /** Every state passed to `loadingState.updateState`, in order. */
    readonly updates: LoadingState[];
} {
    const loadingInfo = new LoadingInfo(NOOP_LOGGER);
    // Start in a state that does not trigger any loading-screen transition on initial subscription.
    const stateStore = new WritableStore<ConnectionState>(ConnectionState.CONNECTING);
    const reflectionQueueLength = new ResolvablePromise<u53>({uncaught: 'default'});
    const reflectionQueueDry = new ResolvablePromise<void>({uncaught: 'default'});
    const updates: LoadingState[] = [];

    const context: LoadingScreenProgressContext = {
        loadingInfo,
        connectionManager: {
            reflectionQueueLength: async () => await reflectionQueueLength,
            reflectionQueueDry: async () => await reflectionQueueDry,
            state: stateStore,
        },
        loadingState: {
            // eslint-disable-next-line @typescript-eslint/require-await
            updateState: async (state) => {
                updates.push(state);
            },
        },
        log: NOOP_LOGGER,
    };

    wireLoadingScreenProgress(context);

    return {loadingInfo, stateStore, reflectionQueueLength, reflectionQueueDry, updates};
}

/**
 * Push a single processed reflected message through the loading info store.
 */
function processReflectedMessage(loadingInfo: LoadingInfo, reflectedId: u32): void {
    loadingInfo.add(reflectedId);
    loadingInfo.remove(reflectedId);
}

export function run(): void {
    describe('wireLoadingScreenProgress', function () {
        it('does not regress to processing-reflection-queue after the queue is dry (race)', async function () {
            const {loadingInfo, stateStore, reflectionQueueLength, reflectionQueueDry, updates} =
                setup();

            // A reflected message is processed: the subscriber suspends on `reflectionQueueLength()`.
            processReflectedMessage(loadingInfo, 1);

            // The connection becomes ready: the handler suspends on `reflectionQueueDry()`.
            stateStore.set(ConnectionState.CONNECTED);

            // The reflection queue drains first, so the loading screen transitions to 'ready' and
            // the loading info subscription is torn down.
            reflectionQueueDry.resolve();
            await flushMicrotasks();
            expect(
                updates.map((update) => update.state),
                'expected the loading screen to become ready',
            ).to.deep.equal(['ready']);

            // Only now does the (previously suspended) `reflectionQueueLength()` callback resume.
            // It must NOT re-emit a 'processing-reflection-queue' state, which would drop progress
            // back below 1 and leave the loading screen stuck forever.
            reflectionQueueLength.resolve(10);
            await flushMicrotasks();

            expect(
                updates.map((update) => update.state),
                'expected no state update after the loading screen became ready',
            ).to.deep.equal(['ready']);
        });

        it('updates progress while processing and then becomes ready (happy path)', async function () {
            const {loadingInfo, stateStore, reflectionQueueLength, reflectionQueueDry, updates} =
                setup();

            // A reflected message is processed and the queue length resolves before the queue is
            // dry: progress should be reported.
            processReflectedMessage(loadingInfo, 1);
            reflectionQueueLength.resolve(5);
            await flushMicrotasks();

            expect(updates).to.deep.equal([
                {
                    state: 'processing-reflection-queue',
                    reflectionQueueLength: 5,
                    reflectionQueueProcessed: 1,
                },
            ]);

            // The connection becomes ready and the queue drains.
            stateStore.set(ConnectionState.CONNECTED);
            reflectionQueueDry.resolve();
            await flushMicrotasks();

            expect(updates.at(-1)?.state).to.equal('ready');
        });

        it('stops emitting progress once the loading info subscription is torn down', async function () {
            const {loadingInfo, stateStore, reflectionQueueLength, reflectionQueueDry, updates} =
                setup();

            // Become ready first (no pending reflection messages).
            stateStore.set(ConnectionState.CONNECTED);
            reflectionQueueDry.resolve();
            reflectionQueueLength.resolve(3);
            await flushMicrotasks();
            expect(updates.map((update) => update.state)).to.deep.equal(['ready']);

            // A late reflected message must not revive the loading screen, because the subscription
            // was torn down on 'ready'.
            processReflectedMessage(loadingInfo, 2);
            await flushMicrotasks();

            expect(updates.map((update) => update.state)).to.deep.equal(['ready']);
        });
    });
}

run();
