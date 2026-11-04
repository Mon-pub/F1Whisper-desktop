import {expect} from 'chai';

import {stripComments} from '~/test/mocha/common/strip-comments';

/**
 * Pins for the conversation nav search row (F1Whisper fork): the folder button must stay inside
 * the row at the narrowest nav width, in RTL and with a long search term. The measured layout is
 * checked by the karma spec `search-row-layout.spec.ts`, which replicates the row rule below; these
 * pins keep that replica and the real stylesheets in sync.
 *
 * Sources are bundled at build time; `//` comments of the SCSS are stripped before matching.
 */
const sources = import.meta.glob<string>(
    [
        '../../../../../app/ui/components/partials/conversation-nav/ConversationNav.svelte',
        '../../../../../app/ui/components/molecules/search-bar/SearchBar.svelte',
    ],
    {eager: true, query: '?raw', import: 'default'},
);

function sourceEndingWith(suffix: string): string {
    const entry = Object.entries(sources).find(([path]) => path.endsWith(suffix));
    expect(entry, `source ${suffix} bundled`).to.not.equal(undefined);
    const stripped = stripComments(entry?.[1] ?? '');
    expect(stripped).to.have.length.greaterThan(500);
    return stripped;
}

/** The declarations of the first rule whose selector is `selector`, up to its closing brace. */
function ruleBody(source: string, selector: string): string {
    const start = source.indexOf(`${selector} {`);
    expect(start, `rule ${selector} found`).to.be.greaterThan(-1);
    return source.slice(start, source.indexOf('}', start));
}

export function run(): void {
    describe('app::ui::search-row-css', function () {
        describe('ConversationNav .search row', function () {
            const row = ruleBody(sourceEndingWith('ConversationNav.svelte'), '.search');

            it('is a two-column grid whose search column can shrink to zero', function () {
                expect(row).to.match(/display:\s*grid/u);
                expect(row).to.match(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/u);
            });

            it('the pin detects the old flex row (red probe fixture)', function () {
                const old = '.search {\n display: flex;\n justify-content: stretch;\n}';
                expect(ruleBody(old, '.search')).to.not.match(
                    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/u,
                );
            });
        });

        describe('SearchBar', function () {
            const source = sourceEndingWith('SearchBar.svelte');

            it('the bar and its input may shrink below their intrinsic width', function () {
                const container = ruleBody(source, '.container');
                expect(container).to.match(/min-width:\s*0/u);
                expect(container).to.match(/\/\s*auto\s+minmax\(0,\s*1fr\)/u);
                expect(source).to.match(/\/\s*auto\s+minmax\(0,\s*1fr\)\s+auto/u);
                expect(ruleBody(source, 'input')).to.match(/min-width:\s*0/u);
            });

            it('the fork edits are marked', function () {
                const raw = Object.entries(sources).find(([path]) =>
                    path.endsWith('SearchBar.svelte'),
                )?.[1];
                expect(raw).to.match(/F1Whisper fork:/u);
            });
        });
    });
}
