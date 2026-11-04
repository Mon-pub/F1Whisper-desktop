import {assert} from '@threema/ts-utils/meta/assert';
import {createRawSnippet} from 'svelte';
import type {HTMLImgAttributes} from 'svelte/elements';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {page} from 'vitest/browser';
import {render} from 'vitest-browser-svelte';

import {createRawTextSnippet} from '../../utils/test/create-raw-text-snippet';
import {createTestImageBytes} from '../../utils/test/create-test-image-bytes';
import {createTestImageDataUrl} from '../../utils/test/create-test-image-data-url';

import ImageLoadingProvider from './ImageLoadingProvider.svelte';

/** Bytes that are not a decodable image, used to trigger the `<img>`'s `error` event. */
const CORRUPT_IMAGE_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

const imageSnippet = createRawSnippet<[Pick<HTMLImgAttributes, 'onerror' | 'src'>]>((props) => ({
    render: () => `<img alt="image" data-testid="image" />`,
    setup: (node) => {
        assert(node instanceof HTMLImageElement);

        const {onerror, src} = props();
        if (onerror !== null && onerror !== undefined) {
            node.onerror = onerror as OnErrorEventHandler;
        }
        if (typeof src === 'string') {
            node.src = src;
        }
    },
}));
const fallbackSnippet = createRawTextSnippet('fallback');

afterEach(() => {
    // Restore any `URL.createObjectURL` / `URL.revokeObjectURL` spies installed by a test.
    vi.restoreAllMocks();
});

describe('ImageLoadingProvider.svelte', () => {
    describe('source types', () => {
        it('forwards a valid string URL to the success snippet without creating an object URL', async () => {
            // Arrange
            const dataUrl = await createTestImageDataUrl();
            const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

            // Act
            render(ImageLoadingProvider, {
                source: dataUrl,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByTestId('image')).toHaveAttribute('src', dataUrl);
            expect(createObjectUrl).not.toHaveBeenCalled();
        });

        it('forwards a URL instance as its string representation', async () => {
            // Arrange
            const url = new URL(await createTestImageDataUrl());
            const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

            // Act
            render(ImageLoadingProvider, {
                source: url,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByTestId('image')).toHaveAttribute('src', url.toString());
            expect(createObjectUrl).not.toHaveBeenCalled();
        });

        it('creates an object URL for a Blob source', async () => {
            // Arrange
            const blob = await createTestImageBytes();
            const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

            // Act
            render(ImageLoadingProvider, {
                source: blob,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            const img = page.getByTestId('image').element() as HTMLImageElement;
            await vi.waitFor(() => expect(img.src).toMatch(/^blob:/u));
            expect(createObjectUrl).toHaveBeenCalledWith(blob);
        });

        it('creates an object URL from raw image bytes and decodes to a valid image', async () => {
            // Arrange: Obtain the raw bytes (`ReadonlyUint8Array` branch) of a 2x3 image.
            const bytes = new Uint8Array(
                await (await createTestImageBytes({width: 2, height: 3})).arrayBuffer(),
            );

            // Act
            render(ImageLoadingProvider, {
                source: bytes,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert: The bytes are wrapped in a Blob, turned into an object URL and decoded by the
            // browser as a 2x3 image, proving the round-trip works.
            const img = page.getByTestId('image').element() as HTMLImageElement;
            await vi.waitFor(() => expect(img.src).toMatch(/^blob:/u));
            await vi.waitFor(() => {
                expect(img.complete).toBe(true);
                expect(img.naturalWidth).toBe(2);
                expect(img.naturalHeight).toBe(3);
            });
        });

        it('creates an object URL for a MediaSource source', async () => {
            // Arrange
            const mediaSource = new MediaSource();
            const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

            // Act
            render(ImageLoadingProvider, {
                source: mediaSource,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert: A `MediaSource` cannot be rendered by an `<img>`, so we only assert that the
            // object URL was created for it (the subsequent load failure is covered elsewhere).
            await vi.waitFor(() => expect(createObjectUrl).toHaveBeenCalledWith(mediaSource));
        });
    });

    describe('failed snippet', () => {
        it('renders the failed snippet when the source is undefined', async () => {
            // Act
            render(ImageLoadingProvider, {
                source: undefined,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByText('fallback')).toBeInTheDocument();
        });

        it('renders the failed snippet when the source is an empty string', async () => {
            // Act
            render(ImageLoadingProvider, {
                source: '',
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByText('fallback')).toBeInTheDocument();
        });

        it('renders the failed snippet when the source is a whitespace-only string', async () => {
            // Act
            render(ImageLoadingProvider, {
                source: '   ',
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByText('fallback')).toBeInTheDocument();
        });

        it('renders the failed snippet when the source is an unparseable string', async () => {
            // Act
            render(ImageLoadingProvider, {
                source: 'https://host:port',
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByText('fallback')).toBeInTheDocument();
        });

        it('renders the failed snippet when creating the object URL fails', async () => {
            // Arrange: Force object URL creation to fail.
            vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
                throw new Error('createObjectURL failed');
            });

            // Act
            render(ImageLoadingProvider, {
                source: await createTestImageBytes(),
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByText('fallback')).toBeInTheDocument();
        });

        it('renders the failed snippet when the image fails to load', async () => {
            // Act: Feed non-image bytes so the `<img>` created from the object URL fires `error`.
            render(ImageLoadingProvider, {
                source: CORRUPT_IMAGE_BYTES,
                imageSnippet,
                fallbackSnippet,
            });

            // Assert
            await expect.element(page.getByText('fallback')).toBeInTheDocument();
        });

        it('recovers to the success snippet when a valid source follows a failed one', async () => {
            // Arrange: Start with a source that fails to load.
            const {rerender} = render(ImageLoadingProvider, {
                source: CORRUPT_IMAGE_BYTES,
                imageSnippet,
                fallbackSnippet,
            });
            await expect.element(page.getByText('fallback')).toBeInTheDocument();

            // Act: Swap in a valid source.
            await rerender({
                source: await createTestImageBytes(),
                imageSnippet,
                fallbackSnippet,
            });

            // Assert: The failure state is reset and the success snippet is shown again.
            await expect.element(page.getByTestId('image')).toBeInTheDocument();
            await expect.element(page.getByText('fallback')).not.toBeInTheDocument();
        });
    });

    describe('object URL lifecycle', () => {
        it('revokes the created object URL when the component unmounts', async () => {
            // Arrange
            const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
            const {unmount} = render(ImageLoadingProvider, {
                source: await createTestImageBytes(),
                imageSnippet,
                fallbackSnippet,
            });

            // Act: Wait for the effect to create the object URL, capture it, then unmount.
            const img = page.getByTestId('image').element() as HTMLImageElement;
            await vi.waitFor(() => expect(img.src).toMatch(/^blob:/u));
            const createdUrl = img.src;
            unmount();

            // Assert: The captured URL is revoked on teardown.
            expect(revokeObjectUrl).toHaveBeenCalledWith(createdUrl);
        });

        it('revokes the previous object URL and creates a new one when the source changes', async () => {
            // Arrange
            const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
            const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
            const {rerender} = render(ImageLoadingProvider, {
                source: await createTestImageBytes(),
                imageSnippet,
                fallbackSnippet,
            });

            // Act: Capture the first object URL, then swap the source for a new Blob.
            const img = page.getByTestId('image').element() as HTMLImageElement;
            await vi.waitFor(() => expect(img.src).toMatch(/^blob:/u));
            const firstUrl = img.src;
            await rerender({
                source: await createTestImageBytes(),
                imageSnippet,
                fallbackSnippet,
            });

            // Assert: The first URL is revoked and a second URL is created.
            await vi.waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith(firstUrl));
            expect(createObjectUrl).toHaveBeenCalledTimes(2);
        });
    });
});
