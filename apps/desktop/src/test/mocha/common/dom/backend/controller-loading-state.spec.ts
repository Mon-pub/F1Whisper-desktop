import {expect} from 'chai';

import type {LoadingState} from '~/common/dom/backend';
import {BackendController} from '~/common/dom/backend/controller';
import {WritableStore} from '~/common/utils/store';

/** Regression guard for the standalone create/restore -> same-run key-storage reopen. */
export function run(): void {
    describe('standalone same-run backend reopen loading state', function () {
        const createStandaloneReopenLoadingStateStore = (
            BackendController as unknown as {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                readonly _createStandaloneReopenLoadingStateStore: () => WritableStore<LoadingState>;
            }
        )._createStandaloneReopenLoadingStateStore;

        it('isolates worker loading transitions so the global store stays pending for success confirmation', function () {
            const globalLoadingState = new WritableStore<LoadingState>({state: 'pending'});
            const reopenLoadingState = createStandaloneReopenLoadingStateStore();

            expect(reopenLoadingState).to.not.equal(globalLoadingState);
            reopenLoadingState.set({state: 'initializing'});
            reopenLoadingState.set({state: 'ready'});

            expect(globalLoadingState.get()).to.deep.equal({state: 'pending'});
            expect(reopenLoadingState.get()).to.deep.equal({state: 'ready'});
        });
    });
}
