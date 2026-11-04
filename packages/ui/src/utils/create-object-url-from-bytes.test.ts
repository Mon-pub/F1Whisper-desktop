import {afterEach, describe, expect, it, vi} from 'vitest';

import {createObjectUrlFromBytes} from './create-object-url-from-bytes';
import {createTestImageBytes} from './test/create-test-image-bytes';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('createObjectUrlFromBytes', () => {
    it('creates an object URL for a Blob source', async () => {
        // Arrange
        const blob = await createTestImageBytes();
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

        // Act
        const {url, dispose} = createObjectUrlFromBytes(blob);

        // Assert
        expect(url).toMatch(/^blob:/u);
        expect(createObjectUrl).toHaveBeenCalledWith(blob);

        // Clean up
        dispose();
    });

    it('creates an object URL for a raw byte source', async () => {
        // Arrange
        const bytes = new Uint8Array(await (await createTestImageBytes()).arrayBuffer());

        // Act
        const {url, dispose} = createObjectUrlFromBytes(bytes);

        // Assert
        expect(url).toMatch(/^blob:/u);

        // Clean up
        dispose();
    });

    it('creates an object URL for a MediaSource source', () => {
        // Arrange
        const mediaSource = new MediaSource();
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL');

        // Act
        const {url, dispose} = createObjectUrlFromBytes(mediaSource);

        // Assert
        expect(url).toMatch(/^blob:/u);
        expect(createObjectUrl).toHaveBeenCalledWith(mediaSource);

        // Clean up
        dispose();
    });

    it('revokes the created object URL when dispose() is called', async () => {
        // Arrange
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
        const {url, dispose} = createObjectUrlFromBytes(await createTestImageBytes());

        // Act
        dispose();

        // Assert
        expect(revokeObjectUrl).toHaveBeenCalledWith(url);
    });
});
