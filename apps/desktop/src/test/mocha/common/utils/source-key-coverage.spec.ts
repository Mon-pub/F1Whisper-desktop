import * as chai from 'chai';

import {findUncoveredKeys, placeholderNames} from '../../../../../config/i18n-source-keys.mjs';

const {expect} = chai;

/**
 * Regression test for the source-key coverage gate (FU-M11). The gate must FAIL when a key used in
 * source is absent from the catalog, and must detect dropped interpolation placeholders.
 */
export function run(): void {
    describe('i18n::source-key-coverage', function () {
        it('flags a source key missing from the catalog (source-only fixture must fail)', function () {
            const catalogKeys = new Set(['a.covered', 'b.covered']);
            expect(findUncoveredKeys(['a.covered', 'z.missing'], catalogKeys)).to.deep.equal([
                'z.missing',
            ]);
        });

        it('passes when every source key exists in the catalog', function () {
            const catalogKeys = new Set(['a.covered', 'b.covered']);
            expect(findUncoveredKeys(['a.covered', 'b.covered'], catalogKeys)).to.deep.equal([]);
        });

        it('extracts single-brace interpolation variable names', function () {
            expect([...placeholderNames('Use {shortAppName} on {device}.')].sort()).to.deep.equal([
                'device',
                'shortAppName',
            ]);
        });

        it('returns no placeholders for a plain or non-string value', function () {
            expect(placeholderNames('no variables here').size).to.equal(0);
            expect(placeholderNames(undefined).size).to.equal(0);
        });
    });
}
