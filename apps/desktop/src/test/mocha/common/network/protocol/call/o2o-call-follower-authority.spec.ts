import {expect} from 'chai';
import {restore, stub} from 'sinon';

import {
    CloseCode,
    ConnectionState,
    CspE2eConversationType,
    O2oCallAnswerAction,
    O2oCallRejectReason,
} from '~/common/enum';
import {OngoingO2oCall} from '~/common/model/o2o-call';
import type {CloseInfo} from '~/common/network';
import {O2oCallError} from '~/common/network/protocol/call/o2o-call-error';
import {ACTIVE_TASK, type ActiveTask} from '~/common/network/protocol/task';
import {IncomingCallOfferTask} from '~/common/network/protocol/task/csp/incoming-call-offer';
import {OutgoingCallAnswerTask} from '~/common/network/protocol/task/csp/outgoing-call-answer';
import {OutgoingCallHangupTask} from '~/common/network/protocol/task/csp/outgoing-call-hangup';
import {OutgoingCallIceCandidateTask} from '~/common/network/protocol/task/csp/outgoing-call-ice-candidate';
import {OutgoingCallOfferTask} from '~/common/network/protocol/task/csp/outgoing-call-offer';
import {OutgoingCallRingingTask} from '~/common/network/protocol/task/csp/outgoing-call-ringing';
import {ensureCallId, ensureMessageId, type MessageId} from '~/common/network/types';
import {assert} from '~/common/utils/assert';
import {Delayed} from '~/common/utils/delayed';
import type {RemoteProxy} from '~/common/utils/endpoint';
import {intoU64} from '~/common/utils/number';
import {ResolvablePromise} from '~/common/utils/resolvable-promise';
import {AbortRaiser} from '~/common/utils/signal';
import type {
    O2oCallConnectionHandle,
    O2oCallContext,
    O2oCallIceCandidate,
} from '~/common/webrtc/o2o-call';
import {
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    NetworkExpectationFactory,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';

/** Regression coverage for PR3-H06 follower authority in 1:1 call signaling. */
export function run(): void {
    describe('1:1 call follower authority (PR3-H06)', function () {
        const me = makeTestUser('MEMEMEME');
        const peer = makeTestUser('PEER0001');
        const callId = ensureCallId(42);
        let services: TestServices;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
        });

        this.afterEach(function () {
            restore();
        });

        function installNoopConnectionHandleEndpoint(
            onExpose?: (handle: O2oCallConnectionHandle) => void,
        ): void {
            // The call manager creates and transfers a connection-handle endpoint before asking the
            // WebRTC service for a context. These no-op endpoint methods are sufficient for these
            // backend-only lifecycle tests; no messages cross that endpoint.
            Object.assign(services.endpoint, {
                createEndpointPair: () => ({local: {}, remote: {}}),
                exposeProxy: (handle: O2oCallConnectionHandle) => onExpose?.(handle),
                transfer: <T>(value: T): T => value,
            });
        }

        it('returns follower-mode instead of throwing from an outgoing offer task', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            const handle = new TestHandle(services, [], {promotedToLeader: false});
            const task = new OutgoingCallOfferTask(services, contact.get(), {
                callId,
                offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
            });

            expect(await task.run(handle)).to.equal('follower-mode');
            handle.finish();
        });

        it('suppresses an offer write when authority is lost during reflection', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            // Keep this test focused on the guarded call offer rather than the independent lazy
            // profile-picture control generated for a receiver without cached distribution state.
            services.persistentProtocolState.setLastUserProfileDistributionState(
                peer.identity.string,
                {type: 'removed'},
                new Date(),
            );
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(() => {
                    services.volatileProtocolState.setCspOriginator(false);
                }),
            ]);
            const task = new OutgoingCallOfferTask(services, contact.get(), {
                callId,
                offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
            });

            expect(await task.run(handle)).to.equal('follower-mode');
            handle.finish();
        });

        it('rejects a follower before creating an outgoing WebRTC context', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            services.volatileProtocolState.setCspOriginator(false);
            const createContext = stub(services.webrtc, 'createO2oCallContext');

            let callError: unknown;
            try {
                await services.model.call.o2o.call(contact);
            } catch (error) {
                callError = error;
            }

            expect(callError).to.be.instanceOf(O2oCallError);
            assert(callError instanceof O2oCallError);
            expect(callError.type).to.equal('follower-mode');
            expect(createContext.called).to.be.false;
            expect(services.model.call.ongoing.get()).to.be.undefined;
        });

        it('returns follower-mode instead of throwing from an ACCEPT answer task', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            const handle = new TestHandle(services, [], {promotedToLeader: false});
            const task = new OutgoingCallAnswerTask(services, contact.get(), {
                callId,
                action: O2oCallAnswerAction.ACCEPT,
                answer: {sdpType: 'answer', sdp: 'v=0\r\n'},
            });

            expect(await task.run(handle)).to.equal('follower-mode');
            handle.finish();
        });

        it('still sends a REJECT answer from a follower', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            const reflectedMessageId = Delayed.simple<MessageId>(
                'reflected call-answer message ID',
            );
            const handle = new TestHandle(
                services,
                [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('outgoingMessage');
                        const message = payload.outgoingMessage;
                        assert(message !== undefined && message !== null);
                        expect(message.type).to.equal(CspE2eConversationType.CALL_ANSWER);
                        reflectedMessageId.set(ensureMessageId(intoU64(message.messageId)));
                    }),
                    NetworkExpectationFactory.write(),
                    NetworkExpectationFactory.readIncomingMessageAck(
                        peer.identity.string,
                        reflectedMessageId,
                    ),
                ],
                {promotedToLeader: false},
            );
            const task = new OutgoingCallAnswerTask(services, contact.get(), {
                callId,
                action: O2oCallAnswerAction.REJECT,
                rejectReason: O2oCallRejectReason.REJECTED,
            });

            expect(await task.run(handle)).to.equal('sent');
            handle.finish();
        });

        it('discards a queued OFFER task after the local caller cancels', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            installNoopConnectionHandleEndpoint();

            const close = stub().resolves(undefined);
            const context = {
                createOffer: stub().resolves('v=0\r\n'),
                close,
            } as unknown as RemoteProxy<O2oCallContext>;
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => await Promise.resolve(context),
            });

            const scheduledOffer = new ResolvablePromise<OutgoingCallOfferTask>({
                uncaught: 'default',
            });
            const offerResult = new ResolvablePromise<'discarded'>({uncaught: 'default'});
            const scheduledTasks: unknown[] = [];
            stub(services.taskManager, 'schedule').callsFake(async (task: unknown) => {
                scheduledTasks.push(task);
                if (task instanceof OutgoingCallOfferTask) {
                    scheduledOffer.resolve(task);
                    return await offerResult;
                }
                if (task instanceof OutgoingCallHangupTask) {
                    return 'sent';
                }
                throw new Error('Unexpected task scheduled by outgoing call');
            });

            const callPromise = services.model.call.o2o.call(contact);
            const offerTask = await scheduledOffer;
            const ongoing = services.model.call.ongoing.get();
            expect(ongoing).to.be.instanceOf(OngoingO2oCall);
            assert(ongoing instanceof OngoingO2oCall);

            await ongoing.get().controller.hangup();

            const handle = new TestHandle(services, []);
            expect(await offerTask.run(handle)).to.equal('discarded');
            handle.finish();
            offerResult.resolve('discarded');

            expect(await callPromise).to.equal(ongoing);
            expect(services.model.call.ongoing.get()).to.be.undefined;
            expect(close.calledOnce).to.be.true;
            expect(
                scheduledTasks.filter((task) => task instanceof OutgoingCallHangupTask),
            ).to.have.length(1);
        });

        it('discards a queued ACCEPT task after the local callee cancels', async function () {
            addTestUserAsContact(services.model, peer);
            installNoopConnectionHandleEndpoint();

            const close = stub().resolves(undefined);
            const context = {
                setRemoteDescription: stub().resolves(undefined),
                createAnswer: stub().resolves('v=0\r\n'),
                close,
            } as unknown as RemoteProxy<O2oCallContext>;
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => await Promise.resolve(context),
            });

            const scheduledAnswer = new ResolvablePromise<OutgoingCallAnswerTask>({
                uncaught: 'default',
            });
            const answerResult = new ResolvablePromise<'discarded'>({uncaught: 'default'});
            const scheduledTasks: unknown[] = [];
            stub(services.taskManager, 'schedule').callsFake(async (task: unknown) => {
                scheduledTasks.push(task);
                if (task instanceof OutgoingCallRingingTask) {
                    return undefined;
                }
                if (task instanceof OutgoingCallAnswerTask) {
                    scheduledAnswer.resolve(task);
                    return await answerResult;
                }
                if (task instanceof OutgoingCallHangupTask) {
                    return 'sent';
                }
                throw new Error('Unexpected task scheduled by incoming call');
            });

            await services.model.call.o2o.handleIncomingOffer(peer.identity.string, {
                callId,
                offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
            });
            const ongoing = services.model.call.ongoing.get();
            expect(ongoing).to.be.instanceOf(OngoingO2oCall);
            assert(ongoing instanceof OngoingO2oCall);

            const acceptPromise = ongoing.get().controller.accept();
            const answerTask = await scheduledAnswer;
            expect(ongoing.get().view.status).to.equal('connecting');

            await ongoing.get().controller.hangup();

            const handle = new TestHandle(services, []);
            expect(await answerTask.run(handle)).to.equal('discarded');
            handle.finish();
            answerResult.resolve('discarded');
            await acceptPromise;

            expect(services.model.call.ongoing.get()).to.be.undefined;
            expect(close.calledOnce).to.be.true;
            expect(
                scheduledTasks.filter((task) => task instanceof OutgoingCallHangupTask),
            ).to.have.length(1);
        });

        it('closes a context that resolves after demotion without creating or signaling an offer', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            installNoopConnectionHandleEndpoint();

            const createOffer = stub().resolves('v=0\r\n');
            const close = stub().resolves(undefined);
            const context = {createOffer, close} as unknown as RemoteProxy<O2oCallContext>;
            const pendingContext = new ResolvablePromise<RemoteProxy<O2oCallContext>>({
                uncaught: 'default',
            });
            const contextRequested = new ResolvablePromise<void>({uncaught: 'default'});
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => {
                    contextRequested.resolve(undefined);
                    return await pendingContext;
                },
            });
            const schedule = stub(services.taskManager, 'schedule').callsFake(
                // eslint-disable-next-line @typescript-eslint/require-await
                async () => undefined,
            );

            const callPromise = services.model.call.o2o.call(contact);
            await contextRequested;
            const ongoing = services.model.call.ongoing.get();
            expect(ongoing).to.be.instanceOf(OngoingO2oCall);
            assert(ongoing instanceof OngoingO2oCall);

            services.volatileProtocolState.setCspOriginator(false);
            services.model.call.o2o.handleCspOriginationAuthorityChange(false);
            expect(ongoing.get().view).to.include({
                status: 'ended',
                reason: 'unexpected-error',
            });

            pendingContext.resolve(context);
            expect(await callPromise).to.equal(ongoing);

            expect(close.calledOnce).to.be.true;
            expect(createOffer.called).to.be.false;
            expect(schedule.called).to.be.false;
            expect(services.model.call.ongoing.get()).to.be.undefined;
        });

        it('does not register an incoming call when demoted while its task waits for the call lock', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            installNoopConnectionHandleEndpoint();

            const pendingContext = new ResolvablePromise<RemoteProxy<O2oCallContext>>({
                uncaught: 'default',
            });
            const contextRequested = new ResolvablePromise<void>({uncaught: 'default'});
            const close = stub().resolves(undefined);
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => {
                    contextRequested.resolve(undefined);
                    return await pendingContext;
                },
            });
            const schedule = stub(services.taskManager, 'schedule').callsFake(
                // eslint-disable-next-line @typescript-eslint/require-await
                async () => 'discarded',
            );

            const outgoing = services.model.call.o2o.call(contact);
            await contextRequested;
            const incomingTask = new IncomingCallOfferTask(
                services,
                ensureMessageId(1n),
                peer.identity.string,
                {
                    callId: ensureCallId(43),
                    offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
                },
            );
            const incomingRun = incomingTask.run(new TestHandle(services, []));

            services.volatileProtocolState.setCspOriginator(false);
            services.model.call.o2o.handleCspOriginationAuthorityChange(false);
            pendingContext.resolve({close} as unknown as RemoteProxy<O2oCallContext>);

            await outgoing;
            await incomingRun;

            expect(close.calledOnce).to.be.true;
            expect(services.model.call.ongoing.get()).to.be.undefined;
            expect(
                schedule.callCount,
                'the demoted incoming offer must not schedule ringing',
            ).to.eq(0);
        });

        it('ends an established call and closes its context on demotion', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            let connectionHandle: O2oCallConnectionHandle | undefined;
            installNoopConnectionHandleEndpoint((handle) => {
                connectionHandle = handle;
            });

            const close = stub().resolves(undefined);
            const context = {
                createOffer: stub().resolves('v=0\r\n'),
                setRemoteDescription: stub().resolves(undefined),
                close,
            } as unknown as RemoteProxy<O2oCallContext>;
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => await Promise.resolve(context),
            });
            const schedule = stub(services.taskManager, 'schedule').callsFake(
                // eslint-disable-next-line @typescript-eslint/require-await
                async (task: unknown) => {
                    expect(task).to.be.instanceOf(OutgoingCallOfferTask);
                    return 'sent';
                },
            );

            const ongoing = await services.model.call.o2o.call(contact);
            await services.model.call.o2o.handleIncomingAnswer(peer.identity.string, {
                callId: ongoing.ctx.callId,
                action: O2oCallAnswerAction.ACCEPT,
                answer: {sdpType: 'answer', sdp: 'v=0\r\n'},
            });
            assert(connectionHandle !== undefined);
            connectionHandle.handleConnectionState('connected');
            expect(ongoing.get().view.status).to.equal('connected');

            services.volatileProtocolState.setCspOriginator(false);
            services.model.call.o2o.handleCspOriginationAuthorityChange(false);

            expect(ongoing.get().view).to.include({
                status: 'ended',
                reason: 'unexpected-error',
            });
            expect(services.model.call.ongoing.get()).to.be.undefined;
            expect(close.calledOnce).to.be.true;
            expect(schedule.calledOnce).to.be.true;
        });

        it('suppresses a ringing write when authority is lost after reflection', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(() => {
                    services.volatileProtocolState.setCspOriginator(false);
                }),
            ]);
            const task = new OutgoingCallRingingTask(services, contact.get(), {callId});

            await task.run(handle);
            handle.finish();
        });

        it('suppresses an ICE write when authority is lost at the message boundary', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            // ICE messages are not reflected, so lose authority between the task's initial check
            // and the generic outgoing-message precondition immediately before CSP processing.
            const hasAuthority = stub(services.volatileProtocolState, 'isCspOriginator');
            hasAuthority.onFirstCall().returns(true);
            hasAuthority.returns(false);
            const handle = new TestHandle(services, []);
            const candidate: O2oCallIceCandidate = {
                candidate: 'candidate:1 1 UDP 1 192.0.2.1 12345 typ host',
                sdpMid: '0',
                // eslint-disable-next-line @typescript-eslint/naming-convention -- WebRTC API field name
                sdpMLineIndex: 0,
                ufrag: 'test',
            };
            const task = new OutgoingCallIceCandidateTask(services, contact.get(), {
                callId,
                removed: false,
                candidates: [candidate],
            });

            expect(await task.run(handle)).to.equal('discarded');
            expect(hasAuthority.callCount).to.be.greaterThan(1);
            handle.finish();
        });

        it('suppresses a hangup write when authority is lost after reflection', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(() => {
                    services.volatileProtocolState.setCspOriginator(false);
                }),
            ]);
            const task = new OutgoingCallHangupTask(services, contact.get(), {callId});

            expect(await task.run(handle)).to.equal('follower-mode');
            handle.finish();
        });

        it('maps a denied offer to follower-mode, cleans up, and keeps the protocol loop alive', async function () {
            const contact = addTestUserAsContact(services.model, peer);
            const taskHandle = new TestHandle(services, [], {promotedToLeader: false});
            const connected = services.taskManager.replace(ConnectionState.CONNECTING);
            assert(connected !== undefined);

            installNoopConnectionHandleEndpoint();

            let contextClosed = false;
            const context = {
                createOffer: async () => await Promise.resolve('v=0\r\n'),
                close: async () => {
                    contextClosed = true;
                    await Promise.resolve();
                },
            } as unknown as RemoteProxy<O2oCallContext>;
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => await Promise.resolve(context),
            });

            const protocolAbort = new AbortRaiser<CloseInfo>();
            const protocolLoop = connected
                .run(services, taskHandle.controller, protocolAbort)
                .catch(() => undefined);

            try {
                let callError: unknown;
                try {
                    await services.model.call.o2o.call(contact);
                } catch (error) {
                    callError = error;
                }

                expect(callError).to.be.instanceOf(O2oCallError);
                assert(callError instanceof O2oCallError);
                expect(callError.type).to.equal('follower-mode');
                expect(services.model.call.ongoing.get()).to.be.undefined;
                expect(contextClosed).to.be.true;

                const followupTask: ActiveTask<'completed', 'volatile'> = {
                    type: ACTIVE_TASK,
                    persist: false,
                    transaction: undefined,
                    run: async () => await Promise.resolve('completed'),
                };
                expect(await services.taskManager.schedule(followupTask)).to.equal('completed');
            } finally {
                protocolAbort.raise({
                    code: CloseCode.NORMAL,
                    origin: 'local',
                    reason: 'Test complete',
                });
                await protocolLoop;
            }
        });

        it('cleans up connecting state when an ACCEPT answer is denied', async function () {
            addTestUserAsContact(services.model, peer);
            installNoopConnectionHandleEndpoint();

            let contextClosed = false;
            const context = {
                setRemoteDescription: async () => await Promise.resolve(),
                createAnswer: async () => await Promise.resolve('v=0\r\n'),
                close: async () => {
                    contextClosed = true;
                    await Promise.resolve();
                },
            } as unknown as RemoteProxy<O2oCallContext>;
            Object.assign(services.webrtc, {
                createO2oCallContext: async () => await Promise.resolve(context),
            });

            // Register the incoming call while disconnected. Its fire-and-forget ringing task is
            // expected to fail immediately, leaving no task ahead of the ACCEPT in the connected
            // protocol loop started below.
            await services.model.call.o2o.handleIncomingOffer(peer.identity.string, {
                callId,
                offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
            });
            const incomingCall = services.model.call.ongoing.get();
            expect(incomingCall).to.be.instanceOf(OngoingO2oCall);
            assert(incomingCall instanceof OngoingO2oCall);
            expect(incomingCall.get().view.status).to.equal('ringing-in');

            const taskHandle = new TestHandle(services, [], {promotedToLeader: false});
            const connected = services.taskManager.replace(ConnectionState.CONNECTING);
            assert(connected !== undefined);
            const protocolAbort = new AbortRaiser<CloseInfo>();
            const protocolLoop = connected
                .run(services, taskHandle.controller, protocolAbort)
                .catch(() => undefined);

            try {
                await incomingCall.get().controller.accept();

                expect(services.model.call.ongoing.get()).to.be.undefined;
                expect(contextClosed).to.be.true;

                const followupTask: ActiveTask<'completed', 'volatile'> = {
                    type: ACTIVE_TASK,
                    persist: false,
                    transaction: undefined,
                    run: async () => await Promise.resolve('completed'),
                };
                expect(await services.taskManager.schedule(followupTask)).to.equal('completed');
            } finally {
                protocolAbort.raise({
                    code: CloseCode.NORMAL,
                    origin: 'local',
                    reason: 'Test complete',
                });
                await protocolLoop;
            }
        });
    });
}
