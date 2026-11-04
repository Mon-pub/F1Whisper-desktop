import {expect} from 'chai';
import {restore, stub, type SinonStub} from 'sinon';

import type {ThreemaWorkCredentials} from '~/common/device';
import {FetchBlobBackend} from '~/common/dom/network/protocol/fetch-blob';
import {FetchDirectoryBackend} from '~/common/dom/network/protocol/fetch-directory';
import {BlobBackendError} from '~/common/network/protocol/blob';
import {DirectoryError} from '~/common/network/protocol/directory';
import {WritableStore} from '~/common/utils/store';
import {makeTestServices, makeTestUser} from '~/test/mocha/common/backend-mocks';

const CREDENTIALS: ThreemaWorkCredentials = {username: 'user', password: 'password'};
const ENCODER = new TextEncoder();

/** A 200 response whose body stream breaks while it is being read (connection reset). */
function interruptedBody(): Response {
    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(ENCODER.encode('{"authTo'));
                controller.error(new Error('connection reset'));
            },
        }),
        {status: 200},
    );
}

/**
 * Reading the blob upload token through the REAL directory code (F1Whisper fork): a body that
 * fails to arrive is a transport failure (nobody answered), a body that arrived but is malformed
 * is an answer. The blob retry budget depends on the difference.
 */
export function run(): void {
    describe('directory auth token: failed body vs malformed body', function () {
        let fetchStub: SinonStub;
        let directory: FetchDirectoryBackend;

        this.beforeEach(function () {
            // eslint-disable-next-line turbo/no-undeclared-env-vars -- vite-defined constant
            if (import.meta.env.BUILD_ENVIRONMENT !== 'onprem') {
                this.skip();
            }
            const services = makeTestServices(makeTestUser('MEMEMEME').identity.string);
            directory = new FetchDirectoryBackend(
                {config: services.config, logging: services.logging},
                new WritableStore<ThreemaWorkCredentials | undefined>(CREDENTIALS),
            );
            fetchStub = stub(globalThis, 'fetch');
        });

        this.afterEach(function () {
            restore();
        });

        async function directoryError(): Promise<DirectoryError> {
            const error: unknown = await directory.authToken().catch((caught: unknown) => caught);
            expect(error).to.be.instanceOf(DirectoryError);
            return error as DirectoryError;
        }

        it('reads a valid token', async function () {
            fetchStub.callsFake(
                async () =>
                    await Promise.resolve(new Response(JSON.stringify({authToken: 'secret'}))),
            );

            expect(await directory.authToken()).to.equal('secret');
        });

        it('a body that breaks while it streams is a `fetch` error, not an answer', async function () {
            fetchStub.callsFake(async () => await Promise.resolve(interruptedBody()));

            const error = await directoryError();

            expect(error.type).to.equal('fetch');
        });

        for (const [name, body] of [
            ['not JSON', '{not json'],
            ['JSON null', 'null'],
            ['an unexpected shape', '{"somethingElse": 1}'],
            ['an empty body', ''],
        ] as const) {
            // eslint-disable-next-line @typescript-eslint/no-loop-func
            it(`a body that arrived but is malformed (${name}) is an \`invalid-response\``, async function () {
                fetchStub.callsFake(async () => await Promise.resolve(new Response(body)));

                const error = await directoryError();

                expect(error.type).to.equal('invalid-response');
            });
        }

        it('a non-200 status is an `invalid-response`', async function () {
            fetchStub.callsFake(
                async () => await Promise.resolve(new Response('oops', {status: 500})),
            );

            expect((await directoryError()).type).to.equal('invalid-response');
        });

        describe('as seen by the blob upload', function () {
            let blob: FetchBlobBackend;

            this.beforeEach(function () {
                const services = makeTestServices(makeTestUser('MEMEMEME').identity.string);
                blob = new FetchBlobBackend({
                    config: services.config,
                    device: services.device,
                    directory,
                });
            });

            async function uploadError(): Promise<BlobBackendError> {
                const error: unknown = await blob
                    .upload('public-volatile', new Uint8Array([1, 2, 3]) as never)
                    .catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobBackendError);
                return error as BlobBackendError;
            }

            it('a token body that breaks mid-read counts as NO answer (not charged to the retry budget)', async function () {
                fetchStub.callsFake(async () => await Promise.resolve(interruptedBody()));

                const error = await uploadError();

                expect(error.responded).to.equal(false);
                expect(fetchStub.callCount, 'no upload request without a token').to.equal(1);
            });

            it('a token body that arrived malformed counts as an answer', async function () {
                fetchStub.callsFake(async () => await Promise.resolve(new Response('garbage')));

                expect((await uploadError()).responded).to.equal(true);
            });

            it('a token refused with a status counts as an answer', async function () {
                fetchStub.callsFake(
                    async () => await Promise.resolve(new Response('no', {status: 403})),
                );

                expect((await uploadError()).responded).to.equal(true);
            });

            it('an unreachable directory counts as no answer', async function () {
                fetchStub.rejects(new TypeError('network down'));

                expect((await uploadError()).responded).to.equal(false);
            });
        });
    });
}
