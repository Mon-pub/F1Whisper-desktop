import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import {ResolvablePromise} from '~/common/utils/resolvable-promise';
import {TIMER} from '~/common/utils/timer';

/**
 * Everything the {@link TeardownCoordinator} needs from the main process, injected as callbacks so
 * the coordinator stays decoupled from Electron (and unit-testable).
 */
export interface TeardownCoordinatorContext {
    /**
     * Ask the renderer to flush pending outgoing work AND await in-flight critical writes (it signals
     * completion via {@link TeardownCoordinator.signalFlushDone}). Returns `true` if a flush was
     * actually requested, or `false` if there is no renderer to flush (no window / destroyed) -- in
     * which case the coordinator resolves immediately.
     */
    readonly requestRendererFlush: (rendererTimeoutMs: u53) => boolean;
    /** Time budget handed to the renderer for its flush. */
    readonly rendererTimeoutMs: u53;
    /** Main-side hard cap so a stuck renderer can never block teardown indefinitely. */
    readonly hardCapMs: u53;
    readonly log: Logger;
}

/**
 * F1Whisper fork (FU-H06): the single coordinator every NORMAL quit/restart path routes through, so
 * pending outgoing work and critical writes flush exactly once before the process tears down.
 *
 * The core guarantee: {@link run} performs the renderer flush AT MOST ONCE and hands the SAME promise
 * to every caller, so concurrent teardown triggers (a repeated quit, a quit racing a restart, a
 * profile switch) coalesce onto one flush instead of racing or restarting it. Callers await that
 * promise and only then hard-exit / destroy the window. Crash paths (uncaught errors) intentionally
 * bypass this and hard-exit.
 */
export class TeardownCoordinator {
    private _teardown: Promise<void> | undefined = undefined;
    private _flushDone: ResolvablePromise<void> | undefined = undefined;
    // `running` while the flush is in flight; `done` once it settles. `idle -> running -> done`.
    private _state: 'idle' | 'running' | 'done' = 'idle';

    public constructor(private readonly _ctx: TeardownCoordinatorContext) {}

    /**
     * Whether the teardown flush is currently IN FLIGHT (not merely started-and-finished). The close
     * handler uses this to keep the window alive during the flush while still allowing the
     * post-flush window destruction to proceed.
     */
    public get isTearingDown(): boolean {
        return this._state === 'running';
    }

    /**
     * Signal that the renderer finished flushing. Called from the FLUSH_PENDING_OUTGOING_DONE IPC.
     * A no-op if no flush is in flight.
     */
    public signalFlushDone(): void {
        this._flushDone?.resolve();
    }

    /**
     * Run the graceful teardown flush. Idempotent: the first call starts the flush, every subsequent
     * call returns the SAME in-flight (or settled) promise. Never rejects.
     */
    public async run(): Promise<void> {
        // `??=` sets `_teardown` (and `_runOnce` sets `_state = 'running'`) SYNCHRONOUSLY on the first
        // call, so `isTearingDown` is accurate immediately and concurrent callers coalesce onto the
        // one in-flight `_runOnce`.
        await (this._teardown ??= this._runOnce());
    }

    private async _runOnce(): Promise<void> {
        this._state = 'running';
        try {
            const flushDone = new ResolvablePromise<void>({uncaught: 'discard'});
            this._flushDone = flushDone;

            if (!this._ctx.requestRendererFlush(this._ctx.rendererTimeoutMs)) {
                this._ctx.log.debug('Teardown coordinator: no renderer to flush, proceeding');
                return;
            }

            this._ctx.log.debug(
                'Teardown coordinator: awaiting renderer flush of pending outgoing work + critical writes',
            );
            await Promise.race([flushDone, TIMER.sleep(this._ctx.hardCapMs)]).catch(() => {
                // Ignore: we tear down regardless of how the race settles.
            });
            this._ctx.log.debug('Teardown coordinator: flush complete (or hard-cap timed out)');
        } finally {
            this._state = 'done';
        }
    }
}
