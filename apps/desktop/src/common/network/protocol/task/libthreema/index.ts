import type {u53} from '~/common/types';

/**
 * General structure of a task calling libthreema.
 */
export interface LibthreemaTask<TOutput> {
    readonly run: () => TOutput extends PromiseLike<infer TPromise> ? Promise<TPromise> : TOutput;
}

/**
 * Structure of a recuring task calling libthreema.
 */
export type LibthreemaRecurringTask<TOutput extends {readonly timeoutMs: u53}> = LibthreemaTask<
    Promise<TOutput>
>;
