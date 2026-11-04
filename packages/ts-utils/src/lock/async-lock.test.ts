import {describe, expect, it} from 'vitest';

import {AsyncLock} from './async-lock.js';

// `setTimeout` exists in both DOM and Node; vitest runs tests in node by default.
declare function setTimeout(handler: () => void, ms: number): unknown;

async function sleep(ms: number): Promise<void> {
    return await new Promise((resolve) => {
        setTimeout(() => resolve(), ms);
    });
}

describe('AsyncLock', () => {
    it('runs executors serially', async () => {
        // Arrange
        const lock = new AsyncLock();
        const delays = [45, 37, 24, 30, 7, 13, 20, 10, 17, 4];
        const result: number[] = [];

        // Act: Run 10 async tasks with overlapping runtimes. If the execution were not guarded by
        // the lock, they would insert their results in ascending-delay order instead of in the
        // order they were enqueued in.
        await Promise.all(
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            delays.map((sleepMs) =>
                lock.with(async () => {
                    await sleep(sleepMs);
                    result.push(sleepMs);
                }),
            ),
        );

        // Assert
        expect(result).toEqual(delays);
    });

    it('returns the value produced by a synchronous executor wrapped in a promise', async () => {
        // Arrange
        const lock = new AsyncLock();

        // Act
        const result = lock.with(() => 42);

        // Assert
        expect(result).toBeInstanceOf(Promise);
        await expect(result).resolves.toBe(42);
    });

    it('returns the value produced by an asynchronous executor', async () => {
        // Arrange
        const lock = new AsyncLock();

        // Act
        const result = await lock.with(() => 'hello');

        // Assert
        expect(result).toBe('hello');
    });

    it('exposes the guarded value to the executor', async () => {
        // Arrange
        const lock = new AsyncLock<undefined, {count: number}>({count: 7});

        // Act
        const result = await lock.with((value) => value.count * 2);

        // Assert
        expect(result).toBe(14);
    });

    it('unwraps the guarded value without acquiring the lock', () => {
        // Arrange
        const value = {count: 3};
        const lock = new AsyncLock<undefined, {count: number}>(value);

        // Act + Assert
        expect(lock.unwrap()).toBe(value);
    });

    it('exposes the context only while an executor is running', async () => {
        // Arrange
        const lock = new AsyncLock<'ctx-a' | 'ctx-b'>();

        // Assert: initially undefined
        expect(lock.context).toBeUndefined();

        // Act + Assert: visible during executor, cleared afterwards
        const executing = lock.with(() => {
            expect(lock.context).toBe('ctx-a');
        }, 'ctx-a');
        await executing;
        expect(lock.context).toBeUndefined();
    });

    it('continues processing the queue after an executor rejects', async () => {
        // Arrange
        const lock = new AsyncLock();
        const failure = lock.with(() => {
            throw new Error('boom');
        });
        const followUp = lock.with(() => 'next');

        // Act + Assert
        await expect(failure).rejects.toThrow('boom');
        await expect(followUp).resolves.toBe('next');
    });
});
