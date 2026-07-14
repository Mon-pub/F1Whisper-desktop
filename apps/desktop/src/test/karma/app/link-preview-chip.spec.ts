import {expect} from 'chai';
import {flushSync, mount, unmount} from 'svelte';

import {globals} from '~/app/globals';
import LinkPreviewChip from '~/app/ui/components/partials/conversation/internal/link-preview-chip/LinkPreviewChip.svelte';
import type {LinkPreviewResult} from '~/common/dom/network/link-preview/types';
import {NOOP_LOGGER} from '~/common/logging';

/** Minimal app globals so deeply-nested UI components (e.g. IconButton's logger) can mount in tests. */
function ensureGlobals(): void {
    try {
        globals.set({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            uiLogging: {logger: () => NOOP_LOGGER} as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hotkeyManager: {} as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            systemTime: {} as any,
        });
    } catch {
        // Already set by an earlier test — `Delayed` may only be set once.
    }
}

/**
 * Regression test for the compose link-preview chip crash: when a preview finally arrived, the chip
 * mounted and immediately crashed the whole renderer with `effect_update_depth_exceeded` because its
 * `$effect` READ the `imageUrl` state it also WROTE (to revoke the previous object URL), so every
 * write re-ran the effect forever. This mounts the REAL component in a real browser and flushes
 * effects synchronously — the infinite loop throws on `flushSync()`, so a clean mount proves the fix.
 *
 * This is the kind of test that was missing: the headless boot smoke only reaches the wizard and never
 * renders the chip, so it could not catch a crash that only happens once a preview is shown.
 */
export function run(): void {
    describe('LinkPreviewChip', function () {
        let target: HTMLElement;

        beforeEach(function () {
            ensureGlobals();
            target = document.createElement('div');
            document.body.appendChild(target);
        });

        afterEach(function () {
            target.remove();
        });

        function makePreview(): LinkPreviewResult {
            return {
                url: 'https://example.org/article',
                title: 'A title',
                description: 'A description',
                image: {
                    // A tiny JPEG SOI/EOI — enough for `URL.createObjectURL`; decode is irrelevant.
                    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
                    mediaType: 'image/jpeg',
                    width: 40,
                    height: 40,
                    isPlaceholder: false,
                },
            };
        }

        it('mounts with a preview image without an effect_update_depth loop', function () {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let component: any;
            expect(() => {
                component = mount(LinkPreviewChip, {
                    target,
                    props: {preview: makePreview(), ondismiss: () => {}},
                });
                // Force the $effect to run synchronously; an infinite loop throws here.
                flushSync();
            }, 'mounting the chip must not throw effect_update_depth_exceeded').to.not.throw();

            expect(target.querySelector('img.image'), 'the preview image renders').to.not.equal(
                null,
            );

            if (component !== undefined) {
                unmount(component);
            }
        });
    });
}

run();
