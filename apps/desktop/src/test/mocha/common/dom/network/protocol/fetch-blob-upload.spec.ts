import {ensureError} from '@threema/ts-utils/meta/ensure-error';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';
import {restore, stub, type SinonStub} from 'sinon';

import type {EncryptedData} from '~/common/crypto';
import {FetchBlobBackend} from '~/common/dom/network/protocol/fetch-blob';
import {BlobBackendError} from '~/common/network/protocol/blob';
import {DirectoryError} from '~/common/network/protocol/directory';
import {UPLOAD_MAX_DURATION_MS} from '~/common/network/protocol/f1-blob-upload-coordinator';
import {assert} from '~/common/utils/assert';
import {makeTestServices, makeTestUser} from '~/test/mocha/common/backend-mocks';

async function sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

const BLOB_ID_HEX = '00112233445566778899aabbccddeeff';
const DATA = new Uint8Array([1, 2, 3, 4]) as EncryptedData;

/**
 * Upload cancellation and the safety cap of `FetchBlobBackend` (F1Whisper fork).
 */
export function run(): void {
    describe('FetchBlobBackend.upload cancellation (F1Whisper fork)', function () {
        const me = makeTestUser('MEMEMEME');
        let backend: FetchBlobBackend;
        let services: ReturnType<typeof makeTestServices>;
        let fetchStub: SinonStub;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            backend = new FetchBlobBackend({
                config: services.config,
                device: services.device,
                directory: services.directory,
            });
            fetchStub = stub(globalThis, 'fetch');
        });

        this.afterEach(function () {
            restore();
        });

        /** A fetch that never answers, but rejects with the abort reason like the real one. */
        function hangingFetch(): void {
            fetchStub.callsFake(async (url: unknown, init: RequestInit) => {
                const signal = init.signal;
                const outcome = new ResolvablePromise<Response, Error>({uncaught: 'discard'});
                function rejectWithReason(): void {
                    outcome.reject(ensureError(signal?.reason));
                }
                if (signal?.aborted === true) {
                    rejectWithReason();
                } else {
                    signal?.addEventListener('abort', rejectWithReason, {once: true});
                }
                return await outcome;
            });
        }

        function signalOfCall(): AbortSignal {
            const signal = (fetchStub.firstCall.args[1] as RequestInit).signal;
            assert(signal !== null && signal !== undefined, 'the request carries a signal');
            return signal;
        }

        it('uploads and returns the blob id (unchanged happy path)', async function () {
            fetchStub.resolves(new Response(`${BLOB_ID_HEX}\n`, {status: 200}));

            const blobId = await backend.upload('public-volatile', DATA);

            expect(Buffer.from(blobId).toString('hex')).to.equal(BLOB_ID_HEX);
        });

        it('aborting the caller signal cancels the request and reports `aborted`', async function () {
            hangingFetch();
            const controller = new AbortController();

            const upload = backend.upload('public-volatile', DATA, {signal: controller.signal});
            await sleep(5);
            expect(signalOfCall().aborted).to.equal(false);
            controller.abort(new Error('user cancelled'));

            const error: unknown = await upload.catch((caught: unknown) => caught);
            expect(error).to.be.instanceOf(BlobBackendError);
            expect((error as BlobBackendError).type).to.equal('aborted');
            expect(signalOfCall().aborted).to.equal(true);
        });

        it('an already aborted signal never reaches the network as a live request', async function () {
            hangingFetch();
            const controller = new AbortController();
            controller.abort(new Error('already gone'));

            const error: unknown = await backend
                .upload('public-volatile', DATA, {signal: controller.signal})
                .catch((caught: unknown) => caught);

            expect((error as BlobBackendError).type).to.equal('aborted');
        });

        it('a transport failure that was not a cancel stays a `fetch` error', async function () {
            fetchStub.rejects(new TypeError('network down'));

            const error: unknown = await backend
                .upload('public-volatile', DATA, {signal: new AbortController().signal})
                .catch((caught: unknown) => caught);

            expect(error).to.be.instanceOf(BlobBackendError);
            expect((error as BlobBackendError).type).to.equal('fetch');
        });

        it('a refusal carries the HTTP status and the reason the server gave', async function () {
            fetchStub.resolves(new Response('upload too slow', {status: 408}));

            const error: unknown = await backend
                .upload('public-volatile', DATA)
                .catch((caught: unknown) => caught);

            expect(error).to.be.instanceOf(BlobBackendError);
            expect((error as BlobBackendError).status).to.equal(408);
            expect((error as BlobBackendError).body).to.equal('upload too slow');
        });

        it('a refusal whose body cannot be read still carries the status', async function () {
            fetchStub.resolves({
                status: 503,
                text: async () => await Promise.reject(new Error('socket closed')),
            } as unknown as Response);

            const error: unknown = await backend
                .upload('public-volatile', DATA)
                .catch((caught: unknown) => caught);

            expect((error as BlobBackendError).status).to.equal(503);
            expect((error as BlobBackendError).body).to.equal(undefined);
        });

        it('a long refusal body is cut short', async function () {
            fetchStub.resolves(new Response('x'.repeat(5000), {status: 500}));

            const error: unknown = await backend
                .upload('public-volatile', DATA)
                .catch((caught: unknown) => caught);

            expect((error as BlobBackendError).body).to.have.length(200);
        });

        it('records whether a server answered', async function () {
            async function failure(): Promise<BlobBackendError> {
                return (await backend
                    .upload('public-volatile', DATA)
                    .catch((caught: unknown) => caught)) as BlobBackendError;
            }

            fetchStub.rejects(new TypeError('network down'));
            expect((await failure()).responded, 'no connection: nobody answered').to.equal(false);

            fetchStub.resolves(new Response('busy', {status: 503}));
            expect((await failure()).responded, 'any HTTP status is an answer').to.equal(true);

            fetchStub.resolves(new Response('not hex'));
            const badId = await failure();
            expect(badId.type).to.equal('invalid-blob-id');
            expect(badId.responded, 'an unusable answer is still an answer').to.equal(true);
        });

        it('a response body that never arrives is a transport failure', async function () {
            fetchStub.resolves({
                status: 200,
                text: async () => await Promise.reject(new Error('socket closed')),
            } as unknown as Response);

            const error = (await backend
                .upload('public-volatile', DATA)
                .catch((caught: unknown) => caught)) as BlobBackendError;

            expect(error).to.be.instanceOf(BlobBackendError);
            expect(error.type).to.equal('fetch');
            expect(error.responded).to.equal(false);
        });

        it('a refused token counts as answered, an unreachable directory does not', async function () {
            async function failure(): Promise<BlobBackendError> {
                return (await backend
                    .upload('public-volatile', DATA)
                    .catch((caught: unknown) => caught)) as BlobBackendError;
            }
            const tokenStub = stub(services.directory, 'authToken');

            tokenStub.rejects(new DirectoryError('invalid-response', 'status 500'));
            expect((await failure()).responded).to.equal(true);
            tokenStub.rejects(new DirectoryError('authentication', 'refused'));
            expect((await failure()).responded).to.equal(true);
            tokenStub.rejects(new DirectoryError('fetch', 'offline'));
            expect((await failure()).responded).to.equal(false);
            tokenStub.rejects(new DirectoryError('timeout', 'no answer'));
            expect((await failure()).responded).to.equal(false);
            tokenStub.rejects(new Error('something else'));
            expect((await failure()).responded).to.equal(false);
            expect(fetchStub.called).to.equal(false);
        });

        it('a failure to get the upload token is a `fetch` error of this upload', async function () {
            stub(services.directory, 'authToken').rejects(new Error('directory unreachable'));

            const error: unknown = await backend
                .upload('public-volatile', DATA)
                .catch((caught: unknown) => caught);

            expect(error).to.be.instanceOf(BlobBackendError);
            expect((error as BlobBackendError).type).to.equal('fetch');
            expect((error as BlobBackendError).status).to.equal(undefined);
            expect(fetchStub.called, 'no request without a token').to.equal(false);
        });

        it('a server refusal stays a `fetch` error', async function () {
            fetchStub.resolves(new Response('blob too large', {status: 413}));

            const error: unknown = await backend
                .upload('public-volatile', DATA)
                .catch((caught: unknown) => caught);

            expect((error as BlobBackendError).type).to.equal('fetch');
        });

        it('bounds every upload by the 65 minute safety cap, with or without a caller signal', async function () {
            const timeoutSpy = stub(AbortSignal, 'timeout').callThrough();
            fetchStub.callsFake(async () => await Promise.resolve(new Response(BLOB_ID_HEX)));

            await backend.upload('public-volatile', DATA);
            await backend.upload('public-volatile', DATA, {signal: new AbortController().signal});

            expect(UPLOAD_MAX_DURATION_MS).to.equal(65 * 60 * 1000);
            expect(timeoutSpy.args.map(([ms]) => ms)).to.deep.equal([
                UPLOAD_MAX_DURATION_MS,
                UPLOAD_MAX_DURATION_MS,
            ]);
            for (const call of fetchStub.getCalls()) {
                expect((call.args[1] as RequestInit).signal).to.not.equal(undefined);
            }
        });

        it('the safety cap firing is an ordinary transport failure, not a cancel', async function () {
            hangingFetch();
            const fired = new AbortController();
            stub(AbortSignal, 'timeout').returns(fired.signal);

            const upload = backend.upload('public-volatile', DATA);
            await sleep(5);
            fired.abort(new DOMException('timed out', 'TimeoutError'));

            const error: unknown = await upload.catch((caught: unknown) => caught);
            expect(error).to.be.instanceOf(BlobBackendError);
            expect((error as BlobBackendError).type).to.equal('fetch');
        });
    });
}
