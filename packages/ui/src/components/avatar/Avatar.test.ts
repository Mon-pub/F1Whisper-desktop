import {assert} from '@threema/ts-utils/meta/assert';
import {describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import {render} from 'vitest-browser-svelte';

import {
    PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP,
    PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP,
} from '../../utils/profile-picture-color';
import {createTestImageBytes} from '../../utils/test/create-test-image-bytes';

import {Avatar} from './index';

/** Bytes that are not a decodable image, used to trigger the `<img>`'s `error` event. */
const CORRUPT_IMAGE_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

/**
 * Wait for the `<img>` of an avatar rendered into the given container to be displayed with a
 * decoded image.
 *
 * @param container The parent container the avatar was rendered into.
 * @returns The loaded `<img>` element.
 */
async function waitForImage(container: HTMLElement): Promise<HTMLImageElement> {
    return await vi.waitFor(() => {
        const image = container.querySelector('img');
        assert(image !== null, 'Expected the avatar to render an image');
        expect(image.complete).toBe(true);
        expect(image.naturalWidth).toBeGreaterThan(0);
        return image;
    });
}

describe('Avatar.svelte', () => {
    describe('content', () => {
        it('renders the fallback if no image source is given', async () => {
            // Act
            render(Avatar, {initials: 'JD'});

            // Assert
            await expect.element(page.getByText('JD')).toBeInTheDocument();
        });

        it('renders the image instead of the fallback if an image source is given', async () => {
            // Act
            const {container} = render(Avatar, {
                initials: 'JD',
                image: await createTestImageBytes(),
            });

            // Assert
            await waitForImage(container);
            await expect.element(page.getByText('JD')).not.toBeInTheDocument();
        });

        it('renders the fallback if the image fails to load', async () => {
            // Act: Feed non-image bytes, so the `<img>` fires `error`.
            render(Avatar, {initials: 'JD', image: CORRUPT_IMAGE_BYTES});

            // Assert
            await expect.element(page.getByText('JD')).toBeInTheDocument();
        });
    });

    describe('colors', () => {
        it('uses a neutral grey background for the fallback if no color is given', () => {
            // Act
            render(Avatar, {initials: 'JD'});

            // Assert: `bg-grey-200`.
            const fallback = page.getByText('JD').element();
            expect(getComputedStyle(fallback).backgroundColor).toBe('rgb(229, 231, 235)');
        });

        it('uses the profile color for the fallback if a color is given', () => {
            // Act
            render(Avatar, {initials: 'JD', color: 'blue'});

            // Assert
            const classes = Array.from(page.getByText('JD').element().classList);
            expect(classes).toContain(PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP.blue);
            expect(classes).toContain(PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP.blue);
        });
    });

    describe('sizing', () => {
        it('fallback fills a square parent completely', () => {
            // Act
            const {container} = render(Avatar, {initials: 'JD'});
            container.style.width = '64px';
            container.style.height = '64px';

            // Assert
            const rect = page.getByText('JD').element().getBoundingClientRect();
            expect(rect.width).toBe(64);
            expect(rect.height).toBe(64);
        });

        it('fallback stays square and fits the height in a parent that is wider than tall', () => {
            // Act
            const {container} = render(Avatar, {initials: 'JD'});
            container.style.width = '160px';
            container.style.height = '64px';

            // Assert: Contained in both directions, i.e. limited by the parent's height.
            const rect = page.getByText('JD').element().getBoundingClientRect();
            expect(rect.width).toBe(64);
            expect(rect.height).toBe(64);
        });

        it('fallback stays square and fits the width in a parent that is taller than wide', () => {
            // Act
            const {container} = render(Avatar, {initials: 'JD'});
            container.style.width = '64px';
            container.style.height = '160px';

            // Assert: Contained in both directions, i.e. limited by the parent's width.
            const rect = page.getByText('JD').element().getBoundingClientRect();
            expect(rect.width).toBe(64);
            expect(rect.height).toBe(64);
        });

        it('image fills a square parent completely', async () => {
            // Act
            const {container} = render(Avatar, {
                initials: 'JD',
                image: await createTestImageBytes({width: 480, height: 240}),
            });
            container.style.width = '64px';
            container.style.height = '64px';
            const image = await waitForImage(container);

            // Assert: A non-square image is displayed in a square box, matching the size of the
            // container.
            const rect = image.getBoundingClientRect();
            expect(rect.width).toBe(64);
            expect(rect.height).toBe(64);
            expect(getComputedStyle(image).objectFit).toBe('cover');
        });

        it('image stays square and fits the height in a parent that is wider than tall', async () => {
            // Act
            const {container} = render(Avatar, {
                initials: 'JD',
                image: await createTestImageBytes({width: 480, height: 240}),
            });
            container.style.width = '160px';
            container.style.height = '64px';
            const image = await waitForImage(container);

            // Assert: A non-square image is contained in both directions, i.e. limited by the
            // parent's height.
            const rect = image.getBoundingClientRect();
            expect(rect.width).toBe(64);
            expect(rect.height).toBe(64);
            expect(getComputedStyle(image).objectFit).toBe('cover');
        });

        it('image stays square and fits the width in a parent that is taller than wide', async () => {
            // Act
            const {container} = render(Avatar, {
                initials: 'JD',
                image: await createTestImageBytes({width: 480, height: 240}),
            });
            container.style.width = '64px';
            container.style.height = '160px';
            const image = await waitForImage(container);

            // Assert: A non-square image is contained in both directions, i.e. limited by the
            // parent's width.
            const rect = image.getBoundingClientRect();
            expect(rect.width).toBe(64);
            expect(rect.height).toBe(64);
            expect(getComputedStyle(image).objectFit).toBe('cover');
        });

        it('can be sized arbitrarily via the class prop', () => {
            // Act
            const {container} = render(Avatar, {initials: 'JD', class: 'size-6'});
            container.style.width = '64px';
            container.style.height = '64px';

            // Assert: `size-6` (24px at the default 16px root font size).
            const rect = page.getByText('JD').element().getBoundingClientRect();
            expect(rect.width).toBe(24);
            expect(rect.height).toBe(24);
        });
    });
});
