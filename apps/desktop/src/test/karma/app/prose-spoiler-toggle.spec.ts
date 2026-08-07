import {expect} from 'chai';
import {flushSync, mount, unmount} from 'svelte';

import Prose from '~/app/ui/components/atoms/prose/Prose.svelte';
import {sanitizeAndParseTextToHtml} from '~/app/ui/utils/text';

// NOTE (FU-H08, builder-ui): this spec is NOT confirmed to execute in the current sandbox.
// `env NODE_OPTIONS=--max-old-space-size=6144 TURBO_BUILD_ENVIRONMENT=onprem
// TURBO_BUILD_VARIANT=work node tools/run-tests.cjs karma` gets past the earlier heap-OOM with the
// bumped heap, but the whole suite then fails to bootstrap (0 tests run, both Chromium and Firefox)
// on an UNRELATED, pre-existing, unmodified spec: `common/dom/network/protocol/fetch-directory.
// spec.ts` constructs `FetchDirectoryBackend` without work credentials, which trips the real
// production assertion in `fetch-directory.ts:124` ("Work credentials not passed to
// FetchDirectoryBackend in OnPrem build") for the onprem+work flavor this whole remediation effort
// runs under. That is a suite-wide bootstrap failure independent of this file's content -- mocha
// (a real DOM is not required for a pure-logic check) already carries the load-bearing, EXECUTED,
// guard-killed proof for the markup-generation half in `test/mocha/app/ui/generic/form/
// parse-text.spec.ts`. This file covers the remaining DOM-APPLICATION half specifically (that
// `Prose.svelte`'s click handler correctly applies `computeSpoilerAriaState`'s pure decision to the
// real DOM nodes), kept here as best-effort per team-lead's direction for an opportunistic,
// non-gating Karma attempt once the onprem/work fixture gap in fetch-directory.spec.ts is
// separately fixed (not in FU-H08's file scope: text.ts / Prose.svelte / Quote.svelte only).
function mockedT(key: string, defaultValue: string): string {
    return defaultValue;
}

export function run(): void {
    describe('Prose spoiler reveal activation (DOM application, FU-H08)', function () {
        let target: HTMLElement;

        beforeEach(function () {
            target = document.createElement('div');
            document.body.appendChild(target);
        });

        afterEach(function () {
            target.remove();
        });

        function mountInteractiveSpoiler(): {
            component: ReturnType<typeof mount>;
            control: HTMLElement;
            content: HTMLElement;
        } {
            const sanitizedHtml = sanitizeAndParseTextToHtml('secret: ||the answer||', mockedT, {
                shouldParseMarkup: true,
            });
            const component = mount(Prose, {
                target,
                props: {content: {sanitizedHtml}},
            });
            flushSync();

            const control = target.querySelector<HTMLElement>('.md-spoiler');
            const content = target.querySelector<HTMLElement>('.md-spoiler-content');
            if (control === null || content === null) {
                throw new Error('spoiler markup did not render as expected');
            }
            return {component, control, content};
        }

        it('reveals and consumes the first click, then lets the second click proceed', async function () {
            const {component, control, content} = mountInteractiveSpoiler();
            let parentClicks = 0;
            target.addEventListener('click', () => {
                parentClicks += 1;
            });

            const firstClick = new MouseEvent('click', {bubbles: true, cancelable: true});
            control.dispatchEvent(firstClick);
            flushSync();

            expect(firstClick.defaultPrevented).to.equal(true);
            expect(parentClicks).to.equal(0);
            expect(content.getAttribute('aria-hidden')).to.equal('false');
            expect(control.getAttribute('aria-expanded')).to.equal('true');
            expect(control.hasAttribute('aria-label')).to.equal(false);
            expect(control.classList.contains('revealed')).to.equal(true);

            const secondClick = new MouseEvent('click', {bubbles: true, cancelable: true});
            control.dispatchEvent(secondClick);
            flushSync();

            expect(secondClick.defaultPrevented).to.equal(false);
            expect(parentClicks).to.equal(1);
            expect(content.getAttribute('aria-hidden')).to.equal('false');
            expect(control.getAttribute('aria-expanded')).to.equal('true');
            expect(control.classList.contains('revealed')).to.equal(true);

            await unmount(component);
        });

        it('reveals and consumes the first keyboard activation, then lets the second proceed', async function () {
            const {component, control, content} = mountInteractiveSpoiler();
            let parentKeydowns = 0;
            target.addEventListener('keydown', () => {
                parentKeydowns += 1;
            });

            const firstKeydown = new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
            });
            control.dispatchEvent(firstKeydown);
            flushSync();

            expect(firstKeydown.defaultPrevented).to.equal(true);
            expect(parentKeydowns).to.equal(0);
            expect(content.getAttribute('aria-hidden')).to.equal('false');
            expect(control.getAttribute('aria-expanded')).to.equal('true');
            expect(control.classList.contains('revealed')).to.equal(true);

            const secondKeydown = new KeyboardEvent('keydown', {
                key: ' ',
                bubbles: true,
                cancelable: true,
            });
            control.dispatchEvent(secondKeydown);
            flushSync();

            expect(secondKeydown.defaultPrevented).to.equal(false);
            expect(parentKeydowns).to.equal(1);
            expect(content.getAttribute('aria-hidden')).to.equal('false');
            expect(control.getAttribute('aria-expanded')).to.equal('true');
            expect(control.classList.contains('revealed')).to.equal(true);

            await unmount(component);
        });
    });
}

run();
