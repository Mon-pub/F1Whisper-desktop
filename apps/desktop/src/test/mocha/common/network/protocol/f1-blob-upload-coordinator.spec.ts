import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';

import type {DbMessageUid} from '~/common/db';
import {
    BlobUploadCancelledError,
    BlobUploadCoordinator,
    getBlobUploadCoordinator,
} from '~/common/network/protocol/f1-blob-upload-coordinator';
import {WritableStore} from '~/common/utils/store';
import {makeTestServices, makeTestUser} from '~/test/mocha/common/backend-mocks';

const UID_A = 1n as DbMessageUid;
const UID_B = 2n as DbMessageUid;

/**
 * An executor that stays pending until released, and records how it was called.
 */
function controllableUpload<T>(result: T): {
    readonly executor: (signal: AbortSignal) => Promise<T>;
    readonly calls: AbortSignal[];
    readonly release: () => void;
    readonly fail: (error: Error) => void;
} {
    const calls: AbortSignal[] = [];
    const outcome = new ResolvablePromise<T, Error>({uncaught: 'discard'});
    async function executor(signal: AbortSignal): Promise<T> {
        calls.push(signal);
        // Like a real fetch: reject when the signal fires.
        signal.addEventListener('abort', () => outcome.reject(new Error('transport aborted')), {
            once: true,
        });
        return await outcome;
    }
    function release(): void {
        outcome.resolve(result);
    }
    function fail(error: Error): void {
        outcome.reject(error);
    }
    return {executor, calls, release, fail};
}

async function settle(): Promise<void> {
    // Let the coordinator's microtask-deferred start of the executor run.
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

export function run(): void {
    describe('network::protocol::f1-blob-upload-coordinator', function () {
        let coordinator: BlobUploadCoordinator;
        let active: WritableStore<boolean>;

        this.beforeEach(function () {
            coordinator = new BlobUploadCoordinator();
            active = new WritableStore(true);
        });

        describe('single-flight', function () {
            it('a second caller for the same blob joins the running upload', async function () {
                const upload = controllableUpload('result');
                const first = coordinator.run(UID_A, 'main', active, upload.executor);
                const second = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();

                expect(upload.calls).to.have.length(1);
                expect(coordinator.inFlightCount).to.equal(1);
                upload.release();
                expect(await first).to.equal('result');
                expect(await second).to.equal('result');
                expect(upload.calls).to.have.length(1);
            });

            it('main and thumbnail of one message, and other messages, are independent', async function () {
                const main = controllableUpload('m');
                const thumbnail = controllableUpload('t');
                const otherMessage = controllableUpload('o');
                const promises = [
                    coordinator.run(UID_A, 'main', active, main.executor),
                    coordinator.run(UID_A, 'thumbnail', active, thumbnail.executor),
                    coordinator.run(UID_B, 'main', active, otherMessage.executor),
                ];
                await settle();

                expect(coordinator.inFlightCount).to.equal(3);
                main.release();
                thumbnail.release();
                otherMessage.release();
                expect(await Promise.all(promises)).to.deep.equal(['m', 't', 'o']);
            });

            it('clears the entry when the upload succeeds, so a later call uploads again', async function () {
                const first = controllableUpload('one');
                const firstPromise = coordinator.run(UID_A, 'main', active, first.executor);
                await settle();
                first.release();
                await firstPromise;
                expect(coordinator.inFlightCount).to.equal(0);

                const second = controllableUpload('two');
                const secondPromise = coordinator.run(UID_A, 'main', active, second.executor);
                await settle();
                second.release();
                expect(await secondPromise).to.equal('two');
                expect(second.calls).to.have.length(1);
            });

            it('clears the entry when the upload fails, and every joined caller sees the failure', async function () {
                const upload = controllableUpload('never');
                const first = coordinator.run(UID_A, 'main', active, upload.executor);
                const second = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();
                const failure = new Error('server said no');
                upload.fail(failure);

                const outcomes = await Promise.allSettled([first, second]);
                expect(outcomes.map((outcome) => outcome.status)).to.deep.equal([
                    'rejected',
                    'rejected',
                ]);
                expect(coordinator.inFlightCount).to.equal(0);

                const retry = controllableUpload('retried');
                const retryPromise = coordinator.run(UID_A, 'main', active, retry.executor);
                await settle();
                retry.release();
                expect(await retryPromise).to.equal('retried');
            });

            it('after a cancelled upload the blob can be uploaded afresh, and joiners join the fresh one', async function () {
                const cancelled = controllableUpload('old');
                const cancelledPromise = coordinator.run(UID_A, 'main', active, cancelled.executor);
                await settle();
                coordinator.abortMessage(UID_A, 'quit');
                await cancelledPromise.catch(() => undefined);

                const fresh = controllableUpload('new');
                const freshPromise = coordinator.run(UID_A, 'main', active, fresh.executor);
                const joiner = coordinator.run(UID_A, 'main', active, fresh.executor);
                await settle();
                expect(fresh.calls).to.have.length(1);
                expect(fresh.calls[0]?.aborted).to.equal(false);
                fresh.release();
                expect(await Promise.all([freshPromise, joiner])).to.deep.equal(['new', 'new']);
            });

            it('registers the entry synchronously, before the executor starts', function () {
                const upload = controllableUpload('x');
                coordinator.run(UID_A, 'main', active, upload.executor).catch(() => undefined);
                // No await in between: the executor has not run yet, but the entry exists.
                expect(upload.calls).to.have.length(0);
                expect(coordinator.inFlightCount).to.equal(1);
                coordinator.abortAll('quit');
            });
        });

        describe('cancellation', function () {
            it('abortMessage aborts the signal and rejects with the reason, not the transport error', async function () {
                const upload = controllableUpload('never');
                const promise = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();

                coordinator.abortMessage(UID_A, 'message-removed');

                const error: unknown = await promise.catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobUploadCancelledError);
                expect((error as BlobUploadCancelledError).reason).to.equal('message-removed');
                expect(upload.calls[0]?.aborted).to.equal(true);
                expect(coordinator.inFlightCount).to.equal(0);
            });

            it('abortMessage leaves other messages alone', async function () {
                const target = controllableUpload('a');
                const other = controllableUpload('b');
                const targetPromise = coordinator.run(UID_A, 'main', active, target.executor);
                const otherPromise = coordinator.run(UID_B, 'main', active, other.executor);
                await settle();

                coordinator.abortMessage(UID_A, 'teardown');
                await targetPromise.catch(() => undefined);

                expect(other.calls[0]?.aborted).to.equal(false);
                other.release();
                expect(await otherPromise).to.equal('b');
            });

            it('abortAll cancels everything with the given reason', async function () {
                const a = controllableUpload('a');
                const b = controllableUpload('b');
                const promises = [
                    coordinator.run(UID_A, 'main', active, a.executor),
                    coordinator.run(UID_B, 'thumbnail', active, b.executor),
                ];
                await settle();

                coordinator.abortAll('quit');

                const outcomes = await Promise.allSettled(promises);
                for (const outcome of outcomes) {
                    expect(outcome.status).to.equal('rejected');
                    const reason: unknown = (outcome as PromiseRejectedResult).reason;
                    expect(reason).to.be.instanceOf(BlobUploadCancelledError);
                    expect((reason as BlobUploadCancelledError).reason).to.equal('quit');
                }
            });

            it('the message turning inactive cancels the upload as message-removed', async function () {
                const upload = controllableUpload('never');
                const promise = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();

                active.set(false);

                const error: unknown = await promise.catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobUploadCancelledError);
                expect((error as BlobUploadCancelledError).reason).to.equal('message-removed');
            });

            it('an upload that starts for an already inactive message is cancelled before it runs', async function () {
                active.set(false);
                const upload = controllableUpload('never');
                const error: unknown = await coordinator
                    .run(UID_A, 'main', active, upload.executor)
                    .catch((caught: unknown) => caught);

                expect(error).to.be.instanceOf(BlobUploadCancelledError);
                expect(upload.calls).to.have.length(0);
            });

            it('the first reason wins when several aborts arrive', async function () {
                const upload = controllableUpload('never');
                const promise = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();

                coordinator.abortAll('quit');
                coordinator.abortAll('teardown');

                const error: unknown = await promise.catch((caught: unknown) => caught);
                expect((error as BlobUploadCancelledError).reason).to.equal('quit');
            });

            it('a cancel ends the upload promptly even if the transport ignores the signal', async function () {
                const transport = new ResolvablePromise<string, never>({uncaught: 'discard'});
                async function ignoringSignal(): Promise<string> {
                    return await transport;
                }
                const promise = coordinator.run(UID_A, 'main', active, ignoringSignal);
                await settle();

                coordinator.abortMessage(UID_A, 'message-removed');

                const error: unknown = await promise.catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobUploadCancelledError);
                transport.resolve('late result');
            });

            it('an upload that is not cancelled keeps its own transport error', async function () {
                const upload = controllableUpload('never');
                const promise = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();

                upload.fail(new Error('network down'));

                const error: unknown = await promise.catch((caught: unknown) => caught);
                expect(error).to.not.be.instanceOf(BlobUploadCancelledError);
                expect((error as Error).message).to.equal('network down');
            });

            it('a joiner never cancels the shared upload', async function () {
                const upload = controllableUpload('shared');
                const first = coordinator.run(UID_A, 'main', active, upload.executor);
                const joiner = coordinator.run(UID_A, 'main', active, upload.executor);
                await settle();

                expect(upload.calls[0]?.aborted).to.equal(false);
                upload.release();
                expect(await first).to.equal('shared');
                expect(await joiner).to.equal('shared');
            });
        });

        describe('getBlobUploadCoordinator', function () {
            it('is stable per backend and separate between backends', function () {
                const me = makeTestUser('MEMEMEME');
                const one = makeTestServices(me.identity.string);
                const two = makeTestServices(me.identity.string);

                expect(getBlobUploadCoordinator(one.blob)).to.equal(
                    getBlobUploadCoordinator(one.blob),
                );
                expect(getBlobUploadCoordinator(one.blob)).to.not.equal(
                    getBlobUploadCoordinator(two.blob),
                );
            });
        });
    });
}
