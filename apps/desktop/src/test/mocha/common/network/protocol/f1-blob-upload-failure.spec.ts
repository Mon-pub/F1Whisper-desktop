import {expect} from 'chai';

import {TRANSFER_HANDLER} from '~/common/index';
import {BlobBackendError} from '~/common/network/protocol/blob';
import {BlobUploadCancelledError} from '~/common/network/protocol/f1-blob-upload-coordinator';
import {
    abortableSleep,
    backoffDelayMs,
    classifyUploadFailure,
    isTransportFailure,
    pickPrimaryFailure,
    RETRY_BUDGET_MS,
    type UploadFailureClass,
} from '~/common/network/protocol/f1-blob-upload-failure';

function refusal(status: number, body?: string): BlobBackendError {
    return new BlobBackendError('fetch', `status ${status}`, {status, body});
}

/**
 * What to do when an upload fails (F1Whisper fork): classification, backoff, abortable sleep, and
 * the structured detail of the blob backend error.
 */
export function run(): void {
    describe('network::protocol::f1-blob-upload-failure', function () {
        describe('classifyUploadFailure', function () {
            const RETRY: UploadFailureClass = {kind: 'retry'};
            const TABLE: readonly [string, unknown, UploadFailureClass][] = [
                ['network error (no status)', new BlobBackendError('fetch', 'down'), RETRY],
                ['429 too many uploads', refusal(429, 'too many uploads'), RETRY],
                ['503 server busy', refusal(503, 'server busy'), RETRY],
                ['500', refusal(500), RETRY],
                ['502', refusal(502, 'bad gateway'), RETRY],
                ['408 upload stalled', refusal(408, 'upload stalled'), RETRY],
                ['408 without a body', refusal(408), RETRY],
                ['408 unknown body', refusal(408, 'something else'), RETRY],
                ['401', refusal(401), RETRY],
                ['403', refusal(403), RETRY],
                ['404', refusal(404), RETRY],
                [
                    'invalid blob id from the server',
                    new BlobBackendError('invalid-blob-id', 'bad id'),
                    RETRY,
                ],
                [
                    '408 upload too slow',
                    refusal(408, 'upload too slow'),
                    {kind: 'terminal', reason: 'too-slow'},
                ],
                [
                    '408 "Upload Too Slow" (case)',
                    refusal(408, 'Upload Too Slow'),
                    {kind: 'terminal', reason: 'too-slow'},
                ],
                [
                    '413 blob too large',
                    refusal(413, 'blob too large'),
                    {kind: 'terminal', reason: 'too-large'},
                ],
                [
                    '507 storage full',
                    refusal(507, 'storage full'),
                    {kind: 'terminal', reason: 'storage-full'},
                ],
                [
                    'a local failure (not a blob backend error)',
                    new Error('cannot read file'),
                    {kind: 'terminal', reason: 'failed'},
                ],
                [
                    'something thrown that is not an error',
                    'oops',
                    {kind: 'terminal', reason: 'failed'},
                ],
                [
                    'cancelled on purpose',
                    new BlobBackendError('aborted', 'cancelled'),
                    {kind: 'cancelled'},
                ],
            ];
            for (const [name, error, expected] of TABLE) {
                it(name, function () {
                    expect(classifyUploadFailure(error)).to.deep.equal(expected);
                });
            }
        });

        describe('pickPrimaryFailure', function () {
            const retryable = refusal(503, 'server busy');
            const terminal = refusal(507, 'storage full');
            const cancel = new BlobUploadCancelledError('message-removed');
            const siblingCancel = new BlobUploadCancelledError('sibling-failed');

            it('a terminal failure wins over a retryable one, in either order', function () {
                expect(pickPrimaryFailure([retryable, terminal])).to.equal(terminal);
                expect(pickPrimaryFailure([terminal, retryable])).to.equal(terminal);
            });

            it('a deliberate cancel wins over everything', function () {
                expect(pickPrimaryFailure([terminal, cancel])).to.equal(cancel);
                expect(pickPrimaryFailure([cancel, retryable])).to.equal(cancel);
            });

            it('a cancel that only says the sibling failed never wins', function () {
                expect(pickPrimaryFailure([siblingCancel, retryable])).to.equal(retryable);
                expect(pickPrimaryFailure([retryable, siblingCancel])).to.equal(retryable);
                expect(pickPrimaryFailure([siblingCancel, terminal])).to.equal(terminal);
                expect(pickPrimaryFailure([siblingCancel])).to.equal(siblingCancel);
            });

            it('a retryable failure where a server answered wins over a transport failure, in either order', function () {
                const offline = new BlobBackendError('fetch', 'offline');
                expect(pickPrimaryFailure([offline, retryable])).to.equal(retryable);
                expect(pickPrimaryFailure([retryable, offline])).to.equal(retryable);
                expect(pickPrimaryFailure([offline, terminal])).to.equal(terminal);
                expect(pickPrimaryFailure([siblingCancel, offline])).to.equal(offline);
            });

            it('with failures of the same kind the first is reported', function () {
                const other = refusal(413, 'blob too large');
                expect(pickPrimaryFailure([terminal, other])).to.equal(terminal);
                expect(pickPrimaryFailure([retryable, refusal(429)])).to.equal(retryable);
            });
        });

        describe('transport failures (nothing answered)', function () {
            it('are exactly the blob errors where no server answered', function () {
                expect(isTransportFailure(new BlobBackendError('fetch', 'offline'))).to.equal(true);
                expect(isTransportFailure(refusal(503, 'busy'))).to.equal(false);
                expect(isTransportFailure(refusal(408))).to.equal(false);
                expect(
                    isTransportFailure(
                        new BlobBackendError('invalid-blob-id', 'bad id', {responded: true}),
                    ),
                ).to.equal(false);
                expect(
                    isTransportFailure(new BlobBackendError('fetch', 'token', {responded: true})),
                ).to.equal(false);
                expect(isTransportFailure(new Error('local'))).to.equal(false);
            });

            it('a status implies that a server answered, unless said otherwise', function () {
                expect(new BlobBackendError('fetch', 'x', {status: 500}).responded).to.equal(true);
                expect(new BlobBackendError('fetch', 'x').responded).to.equal(false);
                expect(
                    new BlobBackendError('fetch', 'x', {status: 500, responded: false}).responded,
                ).to.equal(false);
            });
        });

        describe('backoffDelayMs', function () {
            function middle(): number {
                return 0.5;
            }

            it('is 5 s, 15 s, 60 s and then 60 s every time (without jitter)', function () {
                expect(
                    [0, 1, 2, 3, 4, 50].map((index) => backoffDelayMs(index, middle)),
                ).to.deep.equal([5_000, 15_000, 60_000, 60_000, 60_000, 60_000]);
            });

            it('spreads every delay by at most 20% in both directions', function () {
                for (const index of [0, 1, 2, 3]) {
                    const base = backoffDelayMs(index, middle);
                    expect(backoffDelayMs(index, () => 0)).to.equal(Math.round(base * 0.8));
                    expect(backoffDelayMs(index, () => 0.999999)).to.be.within(
                        Math.round(base * 1.19),
                        Math.round(base * 1.2),
                    );
                }
            });

            it('the retry budget is 60 minutes', function () {
                expect(RETRY_BUDGET_MS).to.equal(60 * 60 * 1000);
            });
        });

        describe('abortableSleep', function () {
            it('resolves after the delay', async function () {
                await abortableSleep(5, new AbortController().signal);
            });

            it('ends early with the abort reason', async function () {
                const controller = new AbortController();
                const sleeping = abortableSleep(60_000, controller.signal);
                controller.abort(new Error('stop'));

                const error: unknown = await sleeping.catch((caught: unknown) => caught);
                expect((error as Error).message).to.equal('stop');
            });

            it('does not sleep at all if already aborted', async function () {
                const controller = new AbortController();
                controller.abort(new Error('already'));

                const error: unknown = await abortableSleep(60_000, controller.signal).catch(
                    (caught: unknown) => caught,
                );
                expect((error as Error).message).to.equal('already');
            });
        });

        describe('BlobBackendError detail', function () {
            interface Handler {
                readonly serialize: (value: unknown, service: unknown) => [unknown[], unknown[]];
                readonly deserialize: (
                    value: unknown[],
                    service: unknown,
                    root: boolean,
                ) => unknown;
            }

            it('keeps the status and the reason across the worker boundary', function () {
                const error = refusal(408, 'upload too slow');
                const handler = Reflect.get(error, TRANSFER_HANDLER) as unknown as Handler;

                const [serialized] = handler.serialize(error, undefined);
                const restored = handler.deserialize(serialized, undefined, false);

                expect(restored).to.be.instanceOf(BlobBackendError);
                expect((restored as BlobBackendError).type).to.equal('fetch');
                expect((restored as BlobBackendError).status).to.equal(408);
                expect((restored as BlobBackendError).body).to.equal('upload too slow');
                expect((restored as BlobBackendError).responded).to.equal(true);
                expect(classifyUploadFailure(restored)).to.deep.equal({
                    kind: 'terminal',
                    reason: 'too-slow',
                });
            });

            it('keeps whether a server answered, also for answers without a status', function () {
                const handler = Reflect.get(
                    new BlobBackendError('fetch', 'x'),
                    TRANSFER_HANDLER,
                ) as unknown as Handler;
                for (const responded of [true, false]) {
                    const error = new BlobBackendError('invalid-blob-id', 'bad id', {responded});
                    const [serialized] = handler.serialize(error, undefined);
                    const restored = handler.deserialize(serialized, undefined, false);
                    expect((restored as BlobBackendError).responded).to.equal(responded);
                    expect((restored as BlobBackendError).status).to.equal(undefined);
                }
            });

            it('a transport failure has no status', function () {
                const error = new BlobBackendError('fetch', 'down');
                expect(error.status).to.equal(undefined);
                expect(error.body).to.equal(undefined);
            });
        });
    });
}
