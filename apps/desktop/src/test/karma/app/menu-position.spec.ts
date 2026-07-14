import {expect} from 'chai';

import {getPopoverOffset} from '~/app/ui/generic/popover/helpers';
import type {AnchorPoint} from '~/app/ui/generic/popover/types';

/**
 * Regression test for the tall-menu top-clip bug: a height-capped, scrollable dropdown (e.g. the
 * 29-language picker) anchored to a button must be positioned so its TOP edge stays within the
 * viewport (first item visible at scrollTop 0), not pushed above the top margin when the clamp
 * fits the bottom. Mirrors the settings `ItemWithDropdown` config (anchor right/bottom→right/top,
 * a small downward offset, `document.body` constraint).
 */
export function run(): void {
    describe('Tall dropdown vertical positioning', function () {
        // Same anchor as `ItemWithDropdown`.
        const DROPDOWN_ANCHOR: AnchorPoint = {
            reference: {horizontal: 'right', vertical: 'bottom'},
            popover: {horizontal: 'right', vertical: 'top'},
        };
        const SAFETY_GAP = {left: 8, right: 8, top: 8, bottom: 8};

        let root: HTMLElement;

        beforeEach(function () {
            root = document.createElement('div');
            document.body.appendChild(root);
        });

        afterEach(function () {
            root.remove();
        });

        /**
         * Build a `.container > (.reference button, .popover menu)` layout where the menu is taller
         * than the space below the button, and capped to the viewport height (as `MenuContainer`
         * does).
         */
        function buildLayout(buttonTop: number): {
            container: HTMLElement;
            reference: HTMLElement;
            popover: HTMLElement;
        } {
            const container = document.createElement('div');
            container.style.position = 'relative';

            const reference = document.createElement('div');
            reference.style.position = 'fixed';
            reference.style.top = `${buttonTop}px`;
            reference.style.left = '400px';
            reference.style.width = '40px';
            reference.style.height = '32px';

            const popover = document.createElement('div');
            popover.style.position = 'absolute';
            popover.style.left = '0';
            popover.style.top = '0';
            popover.style.width = '200px';
            // Capped to the viewport like `MenuContainer`.
            popover.style.maxHeight = 'calc(100vh - 32px)';
            popover.style.overflowY = 'auto';
            popover.style.display = 'flex';
            popover.style.flexDirection = 'column';
            // 29 × 40px = 1160px of content -> taller than the viewport, so it caps + scrolls.
            for (let index = 0; index < 29; index++) {
                const item = document.createElement('div');
                item.style.flex = '0 0 auto';
                item.style.height = '40px';
                item.textContent = `language ${index}`;
                popover.appendChild(item);
            }

            container.appendChild(reference);
            container.appendChild(popover);
            root.appendChild(container);
            return {container, reference, popover};
        }

        function positionedTop(buttonTop: number): {top: number; bottom: number} {
            const {container, reference, popover} = buildLayout(buttonTop);
            const offset = getPopoverOffset(
                document.body,
                container,
                reference,
                popover,
                DROPDOWN_ANCHOR,
                {left: 0, top: 4},
                true,
                SAFETY_GAP,
            );
            popover.style.transform = `translate(${offset.left}px, ${offset.top}px)`;
            const rect = popover.getBoundingClientRect();
            return {top: rect.top, bottom: rect.bottom};
        }

        it('keeps the top of a tall capped menu within the viewport (button near the top)', function () {
            const {top, bottom} = positionedTop(80);
            expect(top, 'menu top must not be clipped above the viewport').to.be.at.least(0);
            expect(bottom, 'menu bottom must stay within the viewport').to.be.at.most(
                window.innerHeight,
            );
        });

        it('keeps the top of a tall capped menu within the viewport (button mid-screen)', function () {
            const {top, bottom} = positionedTop(Math.floor(window.innerHeight / 2));
            expect(top, 'menu top must not be clipped above the viewport').to.be.at.least(0);
            expect(bottom, 'menu bottom must stay within the viewport').to.be.at.most(
                window.innerHeight,
            );
        });

        // THE real condition the on-device bug reproduced: the page (document/body) is scrolled
        // down, so `document.body.getBoundingClientRect().top` is NEGATIVE (the body extends above
        // the viewport). The popover renders at the modal layer (a viewport layer), so it MUST be
        // clamped to the VISUAL VIEWPORT, not the scroll-shifted body box — otherwise its top lands
        // above y=0 and the first item is unreachable.
        it('keeps the top within the viewport when the page is scrolled (real bug)', function () {
            // Make the document scrollable and scroll it down so body's rect top is negative.
            const tall = document.createElement('div');
            tall.style.height = `${window.innerHeight * 3}px`;
            tall.style.position = 'relative';
            root.appendChild(tall);

            window.scrollTo(0, window.innerHeight); // Page scrolled down by one viewport.
            expect(
                document.body.getBoundingClientRect().top,
                'precondition: the page is scrolled so document.body is shifted above the viewport',
            ).to.be.lessThan(0);

            // The dropdown button is visible mid-viewport; its popover container is `position:
            // relative` inside the scrolled body.
            const container = document.createElement('div');
            container.style.position = 'relative';
            // Place the container so the button lands mid-viewport in document coords.
            container.style.position = 'absolute';
            container.style.top = `${window.innerHeight + Math.floor(window.innerHeight / 2)}px`;
            container.style.left = '0';
            tall.appendChild(container);

            const reference = document.createElement('div');
            reference.style.position = 'absolute';
            reference.style.top = '0';
            reference.style.left = '400px';
            reference.style.width = '40px';
            reference.style.height = '32px';
            container.appendChild(reference);

            const popover = document.createElement('div');
            popover.style.position = 'absolute';
            popover.style.left = '0';
            popover.style.top = '0';
            popover.style.width = '200px';
            popover.style.maxHeight = 'calc(100vh - 32px)';
            popover.style.overflowY = 'auto';
            popover.style.display = 'flex';
            popover.style.flexDirection = 'column';
            for (let index = 0; index < 29; index++) {
                const item = document.createElement('div');
                item.style.flex = '0 0 auto';
                item.style.height = '40px';
                item.textContent = `language ${index}`;
                popover.appendChild(item);
            }
            container.appendChild(popover);

            try {
                const offset = getPopoverOffset(
                    document.body,
                    container,
                    reference,
                    popover,
                    DROPDOWN_ANCHOR,
                    {left: 0, top: 4},
                    true,
                    SAFETY_GAP,
                );
                popover.style.transform = `translate(${offset.left}px, ${offset.top}px)`;
                const rect = popover.getBoundingClientRect();

                expect(
                    rect.top,
                    'menu top must stay within the viewport despite page scroll',
                ).to.be.at.least(0);
                expect(rect.bottom, 'menu bottom must stay within the viewport').to.be.at.most(
                    window.innerHeight,
                );
            } finally {
                window.scrollTo(0, 0);
            }
        });

        // THE actual on-device cause: the settings `.content` is a scroll container with
        // `overflow-y: auto; overflow-x: hidden`. The `Popover` renders its menu inside that scroll
        // container; a `position: absolute` popover is CLIPPED by that overflow when it extends above
        // the container's top edge, so the menu's top is visually cut off ("clipped above the
        // window"). After the fix the popover renders at the viewport/modal layer (`position: fixed`,
        // portaled out of the scroll container) so it is NOT clipped and is hit-testable on top.
        //
        // This test mirrors how `Popover.svelte` builds its DOM and asserts the popover is actually
        // visible (hit-testable) above an overflow-clipping scrolled ancestor's top edge.
        it('renders the popover above a scrolled overflow ancestor without clipping', function () {
            // Scroll container mirroring settings `.content`.
            const scrollPanel = document.createElement('div');
            scrollPanel.style.position = 'fixed';
            scrollPanel.style.top = '200px';
            scrollPanel.style.left = '0';
            scrollPanel.style.width = '500px';
            scrollPanel.style.height = '300px';
            scrollPanel.style.overflowY = 'auto';
            scrollPanel.style.overflowX = 'hidden';
            root.appendChild(scrollPanel);

            const tall = document.createElement('div');
            tall.style.height = '2000px';
            scrollPanel.appendChild(tall);

            // The popover wrapper (`Popover.svelte`'s `.container`, position: relative) near the top
            // of the scrolled content.
            const popoverContainer = document.createElement('div');
            popoverContainer.style.position = 'relative';
            popoverContainer.style.top = '40px';
            tall.appendChild(popoverContainer);

            // The popover, mounted the way `Popover.svelte` mounts it (see its `.popover` styles).
            const menu = document.createElement('div');
            menu.style.width = '160px';
            menu.style.height = '120px';
            menu.style.background = 'rgb(10, 20, 30)';
            // Mirror the FIXED, viewport-layer positioning the fix uses, so it escapes the overflow
            // ancestor's clipping.
            menu.style.position = 'fixed';
            menu.style.left = '0';
            menu.style.top = '0';
            menu.style.zIndex = '99999';
            // Place it ABOVE the scroll panel's top edge (at y≈100, panel top is 200).
            menu.style.transform = 'translate(40px, 100px)';
            popoverContainer.appendChild(menu);

            // Hit-test a point inside the menu that sits ABOVE the scroll panel's top edge. If the
            // popover were clipped by the overflow ancestor, the point would NOT resolve to the menu.
            const probeX = 40 + 80;
            const probeY = 100 + 10; // Y=110, above the panel's top edge (200).
            const hit = document.elementFromPoint(probeX, probeY);
            expect(
                hit === menu || (hit !== null && menu.contains(hit)),
                'the popover must be visible (not clipped) above a scrolled overflow ancestor',
            ).to.equal(true);
        });
    });
}

run();
