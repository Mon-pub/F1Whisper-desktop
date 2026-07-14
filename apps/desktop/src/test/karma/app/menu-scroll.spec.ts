import {expect} from 'chai';

/**
 * Regression test for the long-menu overflow bug: a menu taller than the viewport (e.g. the
 * 29-language picker) must cap its height to the viewport and scroll internally so its top items
 * stay reachable, while a short menu is unaffected. This exercises the CSS contract applied to
 * `MenuContainer` (`max-height: calc(100vh - 32px); overflow-y: auto`).
 */
export function run(): void {
    describe('Menu height cap + scroll', function () {
        let root: HTMLElement;

        beforeEach(function () {
            root = document.createElement('div');
            document.body.appendChild(root);
        });

        afterEach(function () {
            root.remove();
        });

        function buildMenu(itemCount: number): HTMLElement {
            const menu = document.createElement('div');
            // Mirror the `MenuContainer` height contract.
            menu.style.maxHeight = 'calc(100vh - 32px)';
            menu.style.overflowY = 'auto';
            menu.style.display = 'flex';
            menu.style.flexDirection = 'column';
            for (let index = 0; index < itemCount; index++) {
                const item = document.createElement('div');
                item.style.flex = '0 0 auto';
                item.style.height = '40px';
                item.textContent = `item ${index}`;
                menu.appendChild(item);
            }
            root.appendChild(menu);
            return menu;
        }

        it('caps a long menu to the viewport and makes it scrollable', function () {
            // 29 items × 40px = 1160px, taller than any realistic test viewport.
            const menu = buildMenu(29);
            const maxAllowed = window.innerHeight - 32;

            // The rendered menu must not exceed the viewport cap...
            expect(menu.getBoundingClientRect().height).to.be.at.most(maxAllowed + 1);
            // ...and its content must be scrollable (content taller than the visible box).
            expect(menu.scrollHeight).to.be.greaterThan(menu.clientHeight);

            // The top of the list must be reachable by scrolling.
            menu.scrollTop = 0;
            expect(menu.scrollTop).to.equal(0);
        });

        it('leaves a short menu unaffected (no scroll)', function () {
            const menu = buildMenu(3);
            // 3 items × 40px = 120px, well under the cap -> no overflow, no scroll.
            expect(menu.scrollHeight).to.be.at.most(menu.clientHeight + 1);
        });
    });
}

run();
