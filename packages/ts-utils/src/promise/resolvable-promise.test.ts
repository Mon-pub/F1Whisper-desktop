import {describe, expect, it} from 'vitest';

import {ResolvablePromise} from './resolvable-promise.js';

// `queueMicrotask` exists in both DOM and Node.
declare function queueMicrotask(callback: () => void): void;

describe('ResolvablePromise', () => {
    describe('constructor', () => {
        it('starts in the pending state when constructed without an executor', () => {
            // Arrange + Act
            const promise = new ResolvablePromise<number>({uncaught: 'default'});

            // Assert
            expect(promise.done).toBe(false);
            expect(promise.state).toEqual({type: 'pending'});
        });

        it('runs the provided executor synchronously', () => {
            // Arrange
            let outerResolve: ((value: number) => void) | undefined;

            // Act
            const promise = new ResolvablePromise<number>({
                executor: (resolve) => {
                    outerResolve = resolve;
                },
                uncaught: 'default',
            });

            // Assert
            expect(outerResolve).toBeTypeOf('function');
            expect(promise.done).toBe(false);
        });

        it('resolves when the executor calls `resolve` asynchronously', async () => {
            // Arrange + Act
            const promise = new ResolvablePromise<number>({
                executor: (resolve) => {
                    queueMicrotask(() => resolve(7));
                },
                uncaught: 'default',
            });

            // Assert
            await expect(promise).resolves.toBe(7);
            expect(promise.state).toEqual({type: 'resolved', result: 7});
        });

        it('rejects when the executor calls `reject` asynchronously', async () => {
            // Arrange
            const error = new Error('boom');

            // Act
            const promise = new ResolvablePromise<number, Error>({
                executor: (_, reject) => {
                    queueMicrotask(() => reject(error));
                },
                uncaught: 'discard',
            });

            // Assert
            await expect(promise).rejects.toBe(error);
            expect(promise.state).toEqual({type: 'rejected', result: error});
        });

        it('discards uncaught rejections when `uncaught` is `discard`', async () => {
            // Arrange + Act
            const promise = new ResolvablePromise<number, Error>({uncaught: 'discard'});
            promise.reject(new Error('boom'));

            // Allow the microtask queue to flush. If `discard` were not handled the unhandled
            // rejection would propagate.
            await new Promise((resolve) => {
                queueMicrotask(() => resolve(undefined));
            });

            // Assert
            expect(promise.done).toBe(true);
        });

        it('throws on an unknown `uncaught` behavior', () => {
            // Act + Assert
            expect(() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises, no-new
                new ResolvablePromise<number>({
                    uncaught: 'invalid' as 'default',
                });
            }).toThrow();
        });
    });

    describe('static resolve', () => {
        it('returns an already-resolved promise without a value', async () => {
            // Arrange + Act
            const promise = ResolvablePromise.resolve();

            // Assert
            expect(promise.done).toBe(true);
            expect(promise.state).toEqual({type: 'resolved', result: undefined});
            await expect(promise).resolves.toBeUndefined();
        });

        it('returns an already-resolved promise with a value', async () => {
            // Arrange + Act
            const promise = ResolvablePromise.resolve(42);

            // Assert
            expect(promise.done).toBe(true);
            await expect(promise).resolves.toBe(42);
        });
    });

    describe('static wrap', () => {
        it('resolves when the wrapped promise resolves', async () => {
            // Arrange
            const inner = Promise.resolve('hello');

            // Act
            const wrapped = ResolvablePromise.wrap(inner, {uncaught: 'default'});

            // Assert
            await expect(wrapped).resolves.toBe('hello');
        });

        it('rejects with the wrapped error when the wrapped promise rejects', async () => {
            // Arrange
            const error = new Error('boom');
            const inner = Promise.reject(error);

            // Act
            const wrapped = ResolvablePromise.wrap<string, Error>(inner, {uncaught: 'discard'});

            // Assert
            await expect(wrapped).rejects.toBe(error);
        });

        it('wraps a non-Error rejection into an Error', async () => {
            // Arrange
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            const inner = Promise.reject('not an error');

            // Act
            const wrapped = ResolvablePromise.wrap<string, Error>(inner, {uncaught: 'discard'});

            // Assert
            await expect(wrapped).rejects.toThrow('not an error');
        });
    });

    describe('resolve', () => {
        it('resolves the promise from the outside', async () => {
            // Arrange
            const promise = new ResolvablePromise<number>({uncaught: 'default'});

            // Act
            promise.resolve(5);

            // Assert
            await expect(promise).resolves.toBe(5);
            expect(promise.state).toEqual({type: 'resolved', result: 5});
        });
    });

    describe('reject', () => {
        it('rejects the promise from the outside', async () => {
            // Arrange
            const promise = new ResolvablePromise<number, Error>({uncaught: 'discard'});
            const error = new Error('boom');

            // Act
            promise.reject(error);

            // Assert
            await expect(promise).rejects.toBe(error);
            expect(promise.state).toEqual({type: 'rejected', result: error});
        });
    });

    describe('chained behavior', () => {
        // `.then()` triggers the species constructor pattern in which a `ResolvablePromise` is
        // constructed with an executor function rather than the options object.
        it('participates in `.then` chains via the species constructor', async () => {
            // Arrange
            const promise = ResolvablePromise.resolve<number>(2);

            // Act
            const doubled = await promise.then((value) => value * 2);

            // Assert
            expect(doubled).toBe(4);
        });

        it('participates in `.catch` chains', async () => {
            // Arrange
            const promise = new ResolvablePromise<number, Error>({uncaught: 'default'});
            const error = new Error('boom');

            // Act
            const recovered = promise.catch(
                (reason: unknown) => `recovered:${(reason as Error).message}`,
            );
            promise.reject(error);

            // Assert
            await expect(recovered).resolves.toBe('recovered:boom');
        });
    });
});
