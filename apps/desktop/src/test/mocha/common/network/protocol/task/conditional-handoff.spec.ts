import {expect} from 'chai';

import {ConnectionState, CloseCode} from '~/common/enum';
import type {CloseInfo} from '~/common/network';
import {CspPayloadType, D2mPayloadType, type OutboundL4CspMessage} from '~/common/network/protocol';
import {D2mMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type TaskController,
} from '~/common/network/protocol/task';
import * as structbuf from '~/common/network/structbuf';
import {ensureMessageId} from '~/common/network/types';
import {assert} from '~/common/utils/assert';
import {ResolvablePromise} from '~/common/utils/resolvable-promise';
import {AbortRaiser} from '~/common/utils/signal';
import {TIMER} from '~/common/utils/timer';
import {makeTestServices, makeTestUser, TestHandle} from '~/test/mocha/common/backend-mocks';

export function run(): void {
    describe('TaskCodec conditional handoff', function () {
        const me = makeTestUser('MEMEMEME');

        async function withProtocolLoop<T>(
            test: (context: {
                readonly handle: ActiveTaskCodecHandle<'volatile'>;
                readonly resolveCsp: () => void;
                readonly resolveD2m: () => void;
                readonly encoderEmpty: () => boolean;
                readonly consumeEncoder: () => Promise<void>;
            }) => Promise<T>,
        ): Promise<T> {
            const services = makeTestServices(me.identity.string);
            const baseController = new TestHandle(services, []).controller;
            const cspAuthenticated = new ResolvablePromise<void>({uncaught: 'default'});
            const d2mAuthenticated = new ResolvablePromise<void>({uncaught: 'default'});
            const controller: TaskController = {
                ...baseController,
                csp: {...baseController.csp, authenticated: cspAuthenticated},
                d2m: {...baseController.d2m, authenticated: d2mAuthenticated},
            };
            const connected = services.taskManager.replace(ConnectionState.CONNECTING);
            assert(connected !== undefined);
            const abort = new AbortRaiser<CloseInfo>();
            const protocolLoop = connected.run(services, controller, abort).catch(() => undefined);

            const captureHandle: ActiveTask<ActiveTaskCodecHandle<'volatile'>, 'volatile'> = {
                type: ACTIVE_TASK,
                persist: false,
                transaction: undefined,
                run: async (handle) => await Promise.resolve(handle),
            };
            const taskHandle = await connected.schedule(captureHandle);

            try {
                return await test({
                    handle: taskHandle,
                    resolveCsp: () => cspAuthenticated.resolve(),
                    resolveD2m: () => d2mAuthenticated.resolve(),
                    encoderEmpty: () => connected.dispatch.encoder.empty,
                    consumeEncoder: async () => {
                        const queued = await connected.dispatch.encoder.get();
                        queued.consume();
                    },
                });
            } finally {
                abort.raise({code: CloseCode.NORMAL, origin: 'local', reason: 'Test complete'});
                await protocolLoop;
            }
        }

        it('drops a CSP write invalidated while authentication is unresolved', async function () {
            await withProtocolLoop(async ({handle, resolveCsp, encoderEmpty}) => {
                let eligible = true;
                let checks = 0;
                const message: OutboundL4CspMessage = {
                    type: D2mPayloadType.PROXY,
                    payload: {
                        type: CspPayloadType.INCOMING_MESSAGE_ACK,
                        payload: structbuf.bridge.encoder(structbuf.csp.payload.MessageAck, {
                            identity: me.identity.bytes,
                            messageId: ensureMessageId(1n),
                        }),
                    },
                };
                const write = handle.writeConditional(message, () => {
                    checks++;
                    return eligible;
                });

                await TIMER.sleep(1);
                expect(checks).to.equal(0);
                eligible = false;
                resolveCsp();

                expect(await write).to.be.false;
                expect(checks).to.equal(1);
                expect(encoderEmpty()).to.be.true;
            });
        });

        it('drops a reflection invalidated while D2M authentication is unresolved', async function () {
            await withProtocolLoop(async ({handle, resolveD2m, encoderEmpty}) => {
                let eligible = true;
                let checks = 0;
                const reflection = handle.reflect([
                    {
                        envelope: {},
                        flags: D2mMessageFlags.none(),
                        precondition: () => {
                            checks++;
                            return eligible;
                        },
                    },
                ] as const);

                await TIMER.sleep(1);
                expect(checks).to.equal(0);
                eligible = false;
                resolveD2m();

                expect(await reflection).to.deep.equal([undefined]);
                expect(checks).to.equal(1);
                expect(encoderEmpty()).to.be.true;
            });
        });

        it('revalidates a CSP write after real encoder backpressure clears', async function () {
            await withProtocolLoop(async ({handle, resolveCsp, encoderEmpty, consumeEncoder}) => {
                resolveCsp();
                const message: OutboundL4CspMessage = {
                    type: D2mPayloadType.PROXY,
                    payload: {
                        type: CspPayloadType.INCOMING_MESSAGE_ACK,
                        payload: structbuf.bridge.encoder(structbuf.csp.payload.MessageAck, {
                            identity: me.identity.bytes,
                            messageId: ensureMessageId(2n),
                        }),
                    },
                };
                await handle.write(message);

                let eligible = true;
                let checks = 0;
                const second = handle.writeConditional(message, () => {
                    checks++;
                    return eligible;
                });
                await TIMER.sleep(1);
                expect(checks).to.equal(0);

                eligible = false;
                await consumeEncoder();

                expect(await second).to.be.false;
                expect(checks).to.equal(1);
                expect(encoderEmpty()).to.be.true;
            });
        });
    });
}
