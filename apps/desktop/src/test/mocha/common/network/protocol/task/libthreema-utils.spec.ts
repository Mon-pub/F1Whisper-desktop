import type {HttpsRequest} from '@threema/libthreema-wasm';
import {expect} from 'chai';
import {restore, stub, useFakeTimers} from 'sinon';

import {readResponseBytes, readSuccessfulResponseBytes} from '~/common/dom/utils/response';
import {NOOP_LOGGER} from '~/common/logging';
import {doRequest} from '~/common/network/protocol/task/libthreema/utils';

export function run(): void {
    describe('libthreema HTTPS request deadlines', function () {
        this.afterEach(function () {
            restore();
        });

        function request(timeoutMs: number): HttpsRequest {
            return {
                url: 'https://remote-secret.example/',
                method: 'get',
                headers: [],
                body: new Uint8Array(),
                timeoutMs,
            };
        }

        it('keeps the timeout armed while consuming the complete response body', async function () {
            const clock = useFakeTimers();
            stub(globalThis, 'fetch').callsFake(async (input, init) => {
                void input;
                const signal = init?.signal;
                return await Promise.resolve(
                    new Response(
                        new ReadableStream<Uint8Array>({
                            start: (controller) => {
                                signal?.addEventListener('abort', () =>
                                    controller.error(new DOMException('aborted', 'AbortError')),
                                );
                            },
                        }),
                        {status: 200},
                    ),
                );
            });

            const resultPromise = doRequest(request(100), NOOP_LOGGER);
            await clock.tickAsync(100);

            const result = await resultPromise;
            expect(result.type).to.equal('error');
            if (result.type === 'error') {
                expect(result.result.type).to.equal('timeout');
            }
        });

        it('uses the shorter shared deadline while consuming the response body', async function () {
            const clock = useFakeTimers({now: 1_000});
            stub(globalThis, 'fetch').callsFake(async (input, init) => {
                void input;
                const signal = init?.signal;
                return await Promise.resolve(
                    new Response(
                        new ReadableStream<Uint8Array>({
                            start: (controller) => {
                                signal?.addEventListener('abort', () =>
                                    controller.error(new DOMException('aborted', 'AbortError')),
                                );
                            },
                        }),
                        {status: 200},
                    ),
                );
            });

            const resultPromise = doRequest(request(1_000), NOOP_LOGGER, 1_100);
            await clock.tickAsync(100);

            const result = await resultPromise;
            expect(result.type).to.equal('error');
            if (result.type === 'error') {
                expect(result.result.type).to.equal('timeout');
            }
        });

        it('consumes a successful response body', async function () {
            stub(globalThis, 'fetch').resolves(new Response(new Uint8Array([1, 2, 3])));

            const successful = await doRequest(request(1_000), NOOP_LOGGER, Date.now() + 1_000);

            expect(successful).to.deep.include({type: 'response'});
        });

        it('rejects an oversized response body', async function () {
            stub(globalThis, 'fetch').resolves(new Response(new Uint8Array(4 * 1024 * 1024 + 1)));

            const result = await doRequest(request(1_000), NOOP_LOGGER);

            expect(result.type).to.equal('error');
            if (result.type === 'error') {
                expect(result.result.type).to.equal('unclassified');
            }
        });

        it('cancels a response whose declared length exceeds the safe integer range', async function () {
            let cancelReason: unknown;
            const response = new Response(
                new ReadableStream<Uint8Array>({
                    cancel: (reason) => {
                        cancelReason = reason;
                    },
                }),
                {
                    headers: {
                        'content-length': (BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(),
                    },
                },
            );
            let caught: unknown;

            try {
                await readResponseBytes(response, 4);
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(Error);
            expect(cancelReason).to.equal('Response body exceeds the configured limit');
        });

        it('cancels a streaming non-successful response', async function () {
            let cancelReason: unknown;
            const response = new Response(
                new ReadableStream<Uint8Array>({
                    cancel: (reason) => {
                        cancelReason = reason;
                    },
                }),
                {status: 503},
            );

            const bytes = await readSuccessfulResponseBytes(response, 4);

            expect(bytes).to.be.undefined;
            expect(cancelReason).to.equal('Response status is not successful');
        });
    });
}
