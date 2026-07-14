import {expect} from 'chai';

import {getPopoverOffset} from '~/app/ui/generic/popover/helpers';
import type {AnchorPoint} from '~/app/ui/generic/popover/types';

/**
 * Reproduction + regression test for the RTL menu/popover clipping bug: a popover anchored to a
 * reference near the RIGHT edge of the viewport must stay fully on-screen (clamped inward), in both
 * `ltr` and `rtl` document directions.
 */
export function run(): void {
    describe('Popover positioning (RTL)', function () {
        const DEFAULT_ANCHOR: AnchorPoint = {
            reference: {horizontal: 'left', vertical: 'bottom'},
            popover: {horizontal: 'left', vertical: 'top'},
        };
        const SAFETY_GAP = {left: 8, right: 8, top: 8, bottom: 8};

        let root: HTMLElement;
        let originalDir: string;

        beforeEach(function () {
            originalDir = document.documentElement.getAttribute('dir') ?? '';
            root = document.createElement('div');
            document.body.appendChild(root);
        });

        afterEach(function () {
            root.remove();
            if (originalDir === '') {
                document.documentElement.removeAttribute('dir');
            } else {
                document.documentElement.setAttribute('dir', originalDir);
            }
        });

        /**
         * Build a `.container > (.reference, .popover)` layout where the reference sits near the
         * right edge of the viewport, mirroring the compose-bar attach menu in RTL.
         */
        function buildLayout(): {
            container: HTMLElement;
            reference: HTMLElement;
            popover: HTMLElement;
        } {
            const container = document.createElement('div');
            container.style.position = 'relative';

            // Reference near the right edge.
            const reference = document.createElement('div');
            reference.style.position = 'fixed';
            reference.style.top = '600px';
            reference.style.left = `${window.innerWidth - 40}px`;
            reference.style.width = '32px';
            reference.style.height = '32px';

            // Popover: a 180px-wide menu, positioned absolutely at the container's start.
            const popover = document.createElement('div');
            popover.style.position = 'absolute';
            popover.style.left = '0';
            popover.style.top = '0';
            popover.style.width = '180px';
            popover.style.height = '120px';

            container.appendChild(reference);
            container.appendChild(popover);
            root.appendChild(container);
            return {container, reference, popover};
        }

        function assertOnScreen(direction: 'ltr' | 'rtl'): void {
            document.documentElement.setAttribute('dir', direction);
            const {container, reference, popover} = buildLayout();

            const offset = getPopoverOffset(
                document.body,
                container,
                reference,
                popover,
                DEFAULT_ANCHOR,
                {left: 0, top: 0},
                true,
                SAFETY_GAP,
            );

            // Apply the offset exactly as `Popover.svelte` does.
            popover.style.transform = `translate(${offset.left}px, ${offset.top}px)`;

            const rect = popover.getBoundingClientRect();
            expect(
                rect.right,
                `${direction}: popover right edge must be within the viewport`,
            ).to.be.at.most(window.innerWidth);
            expect(
                rect.left,
                `${direction}: popover left edge must be within the viewport`,
            ).to.be.at.least(0);
        }

        it('keeps a right-edge popover on-screen in LTR', function () {
            assertOnScreen('ltr');
        });

        it('keeps a right-edge popover on-screen in RTL', function () {
            assertOnScreen('rtl');
        });
    });
}

run();
