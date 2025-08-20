/**
 * General structure of a task calling libthreema.
 */
export interface LibthreemaTask<TOutput> {
    readonly run: () => TOutput extends PromiseLike<infer TPromise> ? Promise<TPromise> : TOutput;
}
