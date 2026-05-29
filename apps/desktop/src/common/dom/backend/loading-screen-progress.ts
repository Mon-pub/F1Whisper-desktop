import type {LoadingState} from '~/common/dom/backend';
import {ConnectionState} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import {assertUnreachable} from '~/common/utils/assert';
import type {IQueryableStore} from '~/common/utils/store';

/**
 * Max number of allowed disconnects at startup before skipping the loading screen entirely.
 */
const MAX_DISCONNECTS_THRESHOLD = 1;

/**
 * Dependencies required to drive the loading screen from the reflection queue. Declared
 * structurally (rather than depending on the concrete {@link Backend}/{@link ConnectionManager})
 * so that {@link wireLoadingScreenProgress} can be exercised in isolation by tests.
 */
export interface LoadingScreenProgressContext {
    readonly loadingInfo: {
        /**
         * Number of reflected messages that have been processed and acknowledged so far.
         */
        readonly loadedStore: IQueryableStore<u53>;
    };
    readonly connectionManager: {
        /**
         * Total number of messages in the reflection queue, as reported by the server.
         */
        readonly reflectionQueueLength: () => Promise<u53>;
        /**
         * Resolves once the reflection queue has been fully drained.
         */
        readonly reflectionQueueDry: () => Promise<void>;
        /**
         * Current connection state.
         */
        readonly state: IQueryableStore<ConnectionState>;
    };
    readonly loadingState: {
        readonly updateState: (state: LoadingState) => Promise<unknown>;
    };
    readonly log: Logger;
}

/**
 * Subscribe to the reflection queue and connection state in order to drive the loading screen's
 * progress, and finalise it (transition to `'ready'`) once the reflection queue is dry.
 */
export function wireLoadingScreenProgress(context: LoadingScreenProgressContext): void {
    const {loadingInfo, connectionManager, loadingState, log} = context;

    // `loadingFinalized` guards the LoadingScreen state machine against a race where a subscriber
    // callback fires, suspends on `reflectionQueueLength()` or `updateState(...)`, and then resumes
    // after the terminal `'ready'` transition has already been posted to the main thread. Without
    // the guard, `progress` jumps back below `1` and the logo's completion animation gets
    // cancelled, leaving the loading screen visible forever.
    let loadingFinalized = false;

    // Subscribe reflection queue to update loading screen.
    const loadingInfoStoreUnsubscriber = loadingInfo.loadedStore.subscribe((value) => {
        if (value !== 0) {
            connectionManager
                .reflectionQueueLength()
                .then(async (reflectionQueueLength) => {
                    if (loadingFinalized) {
                        return;
                    }
                    await loadingState.updateState({
                        state: 'processing-reflection-queue',
                        reflectionQueueLength,
                        reflectionQueueProcessed: value,
                    });
                    log.debug(
                        `Processed ${value} message(s) of total reflection queue length of ${reflectionQueueLength},
                                    loadingState set to 'processing-reflection-queue'`,
                    );
                })
                .catch(assertUnreachable);
        }
    });

    let disconnects = 0;
    connectionManager.state.subscribe((state) => {
        switch (state) {
            case ConnectionState.DISCONNECTED:
                if (++disconnects > MAX_DISCONNECTS_THRESHOLD) {
                    log.warn('Disconnect threshold reached, skipping loading screen');
                    loadingState
                        .updateState({
                            state: 'cancelled',
                        })
                        .catch(assertUnreachable);
                }
                break;

            case ConnectionState.CONNECTED:
                connectionManager
                    .reflectionQueueDry()
                    .then(async () => {
                        loadingFinalized = true;
                        loadingInfoStoreUnsubscriber();
                        await loadingState.updateState({
                            state: 'ready',
                        });
                        log.info(`ReflectionQueueDry received, loadingState set to 'ready'`);
                    })
                    .catch(assertUnreachable);
                break;

            default:
                break;
        }
    });
}
