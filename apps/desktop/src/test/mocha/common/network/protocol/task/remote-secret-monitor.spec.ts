import {expect} from 'chai';
import {restore, type SinonStub, stub, useFakeTimers} from 'sinon';

import type {KeyStorageInitOverrides} from '~/common/key-storage';
import {NOOP_LOGGER} from '~/common/logging';
import {
    RemoteSecretApplicationStartMonitorTask,
    RemoteSecretRetrievalError,
} from '~/common/network/protocol/task/libthreema/remote-secret-monitor';

type Retrieval = NonNullable<KeyStorageInitOverrides['remoteSecretRetrieval']>;

export function run(): void {
    describe('archived Remote Secret retrieval', function () {
        this.afterEach(function () {
            restore();
        });

        function makeTask(
            poll: SinonStub<[], unknown>,
            retrieval: Retrieval,
        ): {
            readonly task: RemoteSecretApplicationStartMonitorTask;
            readonly beforeRestart: SinonStub<[], Promise<void>>;
            readonly restartApp: SinonStub<[], Promise<void>>;
        } {
            // Build a test-only instance whose private collaborators are installed below without
            // invoking the native WASM factory.
            const task = Object.create(
                RemoteSecretApplicationStartMonitorTask.prototype,
            ) as RemoteSecretApplicationStartMonitorTask;
            const beforeRestart = stub<[], Promise<void>>().resolves(undefined);
            const restartApp = stub<[], Promise<void>>().resolves(undefined);
            Reflect.set(task, '_services', {
                electron: {beforeRestart, remoteSecretErrorRestartApp: restartApp},
            });
            Reflect.set(task, '_log', NOOP_LOGGER);
            Reflect.set(task, '_retrieval', retrieval);
            Reflect.set(task, '_remoteSecretMonitorProtocol', {
                poll,
                response: stub(),
            });
            return {task, beforeRestart, restartApp};
        }

        it('throws a typed error instead of invoking the global restart path', async function () {
            const {task, beforeRestart, restartApp} = makeTask(
                stub<[], unknown>().returns({
                    type: 'error',
                    result: {type: 'invalid-response'},
                }),
                {mode: 'bounded-non-restarting', deadlineMs: Date.now() + 1_000},
            );
            let caught: unknown;

            try {
                await task.run();
            } catch (error) {
                caught = error;
            }

            expect(caught).to.be.instanceOf(RemoteSecretRetrievalError);
            expect((caught as RemoteSecretRetrievalError).type).to.equal('protocol-error');
            expect(beforeRestart.called).to.be.false;
            expect(restartApp.called).to.be.false;
        });

        it('bounds a server-requested sleep by the absolute deadline', async function () {
            const clock = useFakeTimers({now: 1_000});
            const poll = stub<[], unknown>().returns({
                type: 'instruction',
                result: {
                    type: 'schedule',
                    value: {remoteSecret: undefined, timeoutMs: 10_000},
                },
            });
            const {task, beforeRestart, restartApp} = makeTask(poll, {
                mode: 'bounded-non-restarting',
                deadlineMs: 1_100,
            });
            const result = task.run();

            await clock.tickAsync(100);

            let caught: unknown;
            try {
                await result;
            } catch (error) {
                caught = error;
            }
            expect(caught).to.be.instanceOf(RemoteSecretRetrievalError);
            expect((caught as RemoteSecretRetrievalError).type).to.equal('deadline-exceeded');
            expect(poll.calledOnce).to.be.true;
            expect(beforeRestart.called).to.be.false;
            expect(restartApp.called).to.be.false;
        });
    });
}
