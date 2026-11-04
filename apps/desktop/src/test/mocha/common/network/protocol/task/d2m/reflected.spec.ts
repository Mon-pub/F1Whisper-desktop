import {expect} from 'chai';
import * as sinon from 'sinon';

import type {PassiveTaskCodecHandle} from '~/common/network/protocol/task';
import {ReflectedTask} from '~/common/network/protocol/task/d2m/reflected';
import type * as structbuf from '~/common/network/structbuf';
import {ensureIdentityString} from '~/common/network/types';
import type {u32} from '~/common/types';
import {makeTestServices, type TestServices} from '~/test/mocha/common/backend-mocks';

/**
 * The handle is never touched because `_processMessage` is stubbed in these tests.
 */
const DUMMY_HANDLE = undefined as unknown as PassiveTaskCodecHandle;

/**
 * Shape exposing the private `_processMessage` method so that it can be stubbed.
 */
interface WithProcessMessage {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors a private method name.
    _processMessage: () => Promise<void>;
}

/**
 * Build a minimal {@link structbuf.d2m.payload.Reflected} message that only carries a
 * `reflectedId`, which is all {@link ReflectedTask} reads outside of `_processMessage`.
 */
function makeReflectedMessage(reflectedId: u32): structbuf.d2m.payload.Reflected {
    return {reflectedId} as unknown as structbuf.d2m.payload.Reflected;
}

export function run(): void {
    describe('ReflectedTask', function () {
        const me = ensureIdentityString('MEMEMEME');
        let services: TestServices;

        this.beforeEach(function () {
            services = makeTestServices(me);
        });

        this.afterEach(function () {
            sinon.restore();
        });

        it('removes the message from the loading info after successful processing', async function () {
            const reflectedId: u32 = 1;
            const task = new ReflectedTask(services, makeReflectedMessage(reflectedId));
            sinon.stub(task as unknown as WithProcessMessage, '_processMessage').resolves();

            services.loadingInfo.add(reflectedId);
            await task.run(DUMMY_HANDLE);

            expect(
                services.loadingInfo.loadedStore.get(),
                'expected the processed message to be removed from the loading info',
            ).to.equal(1);
        });

        it('removes the message from the loading info even when processing throws', async function () {
            const reflectedId: u32 = 2;
            const task = new ReflectedTask(services, makeReflectedMessage(reflectedId));
            const failure = new Error('processing failed');
            sinon.stub(task as unknown as WithProcessMessage, '_processMessage').rejects(failure);

            services.loadingInfo.add(reflectedId);

            // The error must still propagate...
            let thrown: unknown;
            try {
                await task.run(DUMMY_HANDLE);
            } catch (error) {
                thrown = error;
            }
            expect(thrown, 'expected the processing error to propagate').to.be.instanceOf(Error);

            // ...but the message must nevertheless be removed from the loading info, otherwise the
            // loading screen progress counter drifts and the reflection queue never appears dry.
            expect(
                services.loadingInfo.loadedStore.get(),
                'expected the message to be removed from the loading info despite the error',
            ).to.equal(1);
        });
    });
}
