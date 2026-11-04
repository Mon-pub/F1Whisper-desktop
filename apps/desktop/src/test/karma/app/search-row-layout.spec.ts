import {expect} from 'chai';
import {flushSync, mount, unmount} from 'svelte';

import SearchBar from '~/app/ui/components/molecules/search-bar/SearchBar.svelte';

/**
 * Layout regression test for the conversation nav search row (F1Whisper fork): the "Manage Folders"
 * button next to the search bar was pushed out of the row at the narrowest nav width, in RTL, and
 * once a search term was entered, because the bar and its input kept their intrinsic width.
 *
 * This mounts the REAL `SearchBar` in a real browser inside a row that carries the same grid rules
 * as the `.search` row of `ConversationNav.svelte` (a mocha source pin keeps the two in sync) and
 * measures the computed layout.
 */
export function run(): void {
    describe('Conversation nav search row layout', function () {
        /** Narrowest nav width (px) minus the row's horizontal padding (2 x 16 px). */
        const ROW_WIDTH = 308 - 32;
        const BUTTON_WIDTH = 40;
        const TOLERANCE = 0.5;

        let host: HTMLElement;
        let originalDir: string;

        beforeEach(function () {
            originalDir = document.documentElement.getAttribute('dir') ?? '';
            host = document.createElement('div');
            document.body.appendChild(host);
        });

        afterEach(function () {
            host.remove();
            if (originalDir === '') {
                document.documentElement.removeAttribute('dir');
            } else {
                document.documentElement.setAttribute('dir', originalDir);
            }
        });

        function mountRow(term: string): {
            row: HTMLElement;
            bar: HTMLElement;
            button: HTMLElement;
            unmountBar: () => void;
        } {
            const row = document.createElement('div');
            // Same rules as `.search` in ConversationNav.svelte.
            row.style.cssText = [
                'display: grid',
                'grid-template-columns: minmax(0, 1fr) auto',
                'align-items: center',
                'gap: 4px',
                'padding: 0',
                `width: ${ROW_WIDTH}px`,
            ].join(';');
            const barHost = document.createElement('div');
            row.appendChild(barHost);
            const button = document.createElement('button');
            button.style.width = `${BUTTON_WIDTH}px`;
            button.style.height = '40px';
            row.appendChild(button);
            host.appendChild(row);

            const component = mount(SearchBar, {
                target: barHost,
                props: {term, placeholder: 'Search...'},
            });
            flushSync();
            const bar = barHost.firstElementChild as HTMLElement;
            return {
                row,
                bar,
                button,
                unmountBar: () => {
                    unmount(component).catch(() => undefined);
                },
            };
        }

        function expectButtonInsideRow(
            row: HTMLElement,
            bar: HTMLElement,
            button: HTMLElement,
        ): void {
            const rowBox = row.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            const barBox = bar.getBoundingClientRect();
            expect(buttonBox.width, 'the button keeps its width').to.be.closeTo(
                BUTTON_WIDTH,
                TOLERANCE,
            );
            expect(buttonBox.left, 'button not pushed out on the left').to.be.at.least(
                rowBox.left - TOLERANCE,
            );
            expect(buttonBox.right, 'button not pushed out on the right').to.be.at.most(
                rowBox.right + TOLERANCE,
            );
            expect(barBox.width, 'the bar shrinks to fit').to.be.at.most(
                ROW_WIDTH - BUTTON_WIDTH + TOLERANCE,
            );
            // The bar and the button do not overlap.
            const overlap =
                Math.min(barBox.right, buttonBox.right) - Math.max(barBox.left, buttonBox.left);
            expect(overlap, 'bar and button do not overlap').to.be.at.most(TOLERANCE);
        }

        for (const dir of ['ltr', 'rtl'] as const) {
            for (const [name, term] of [
                ['empty', ''],
                ['a short term', 'abc'],
                ['a very long term', 'a very long search term that does not fit '.repeat(5)],
            ] as const) {
                it(`keeps the folder button in the row (${dir}, ${name})`, function () {
                    document.documentElement.setAttribute('dir', dir);
                    const {row, bar, button, unmountBar} = mountRow(term);

                    expectButtonInsideRow(row, bar, button);

                    unmountBar();
                });
            }
        }
    });
}

run();
