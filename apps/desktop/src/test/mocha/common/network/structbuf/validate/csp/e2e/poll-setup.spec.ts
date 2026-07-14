import {expect} from 'chai';

import {PollDisplayMode} from '~/common/enum';
import {PollSetup} from '~/common/network/structbuf/validate/csp/e2e';
import {UTF8} from '~/common/utils/codec';

/**
 * Build a minimal-but-valid raw poll JSON object with the given display-mode (`u`) value.
 */
function rawPollJsonWithDisplayMode(u: number): string {
    return JSON.stringify({
        d: 'Test poll',
        s: 0,
        a: 0,
        t: 0,
        u,
        o: 0,
        c: [{i: 0, n: 'Choice A', o: 0}],
    });
}

/**
 * PollSetup validation tests.
 *
 * Regression: an Android checklist sends `u: 2` (`PollDisplayMode.CHECKLIST`). The decode used to
 * throw on any value other than `0`/`1` and the whole poll message was dropped. The decode must now
 * be tolerant: map known values and fall back to `LIST` for any unknown value, never throwing.
 */
export function run(): void {
    describe('validate poll-setup', function () {
        const cases: readonly {
            readonly name: string;
            readonly u: number;
            readonly expected: PollDisplayMode;
        }[] = [
            {name: 'u=0 -> LIST', u: 0, expected: PollDisplayMode.LIST},
            {name: 'u=1 -> SUMMARY', u: 1, expected: PollDisplayMode.SUMMARY},
            {
                name: 'u=2 -> CHECKLIST (android checklist)',
                u: 2,
                expected: PollDisplayMode.CHECKLIST,
            },
            {name: 'u=99 (unknown) -> LIST fallback', u: 99, expected: PollDisplayMode.LIST},
        ];

        for (const {name, u, expected} of cases) {
            it(`decodes display mode without throwing (${name})`, function () {
                function parse(): PollDisplayMode {
                    return PollSetup.SCHEMA.parse({
                        id: 1n,
                        poll: UTF8.encode(rawPollJsonWithDisplayMode(u)),
                    }).poll.displayMode;
                }
                expect(parse).not.to.throw();
                expect(parse()).to.equal(expected);
            });
        }
    });
}
