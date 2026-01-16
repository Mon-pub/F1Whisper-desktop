import {expect} from 'chai';

import {STATIC_CONFIG} from '~/common/config';

/**
 * Config tests.
 */
export function run(): void {
    describe('Static config', function () {
        it('Key storage path to be available', function () {
            // Doesn't need to be whitelisted for `turbo`, as it's set by Vite.
            //
            // eslint-disable-next-line turbo/no-undeclared-env-vars
            expect(STATIC_CONFIG.KEY_STORAGE_PATH).to.deep.equal(import.meta.env.KEY_STORAGE_PATH);
        });
    });
}

run();
