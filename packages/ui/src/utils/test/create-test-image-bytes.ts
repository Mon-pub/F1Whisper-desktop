import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * Create a solid black dummy image of the given dimensions as a PNG {@link Blob}, for use as dummy
 * image data in tests.
 *
 * @param dimensions The desired image dimensions in pixels.
 * @returns A PNG-encoded {@link Blob} of the requested size.
 */
export async function createTestImageBytes(
    dimensions: {readonly height?: u53; readonly width?: u53} = {},
): Promise<Blob> {
    const {height = 1, width = 1} = dimensions;
    const canvas = new OffscreenCanvas(width, height);

    const context = canvas.getContext('2d');
    if (context === null) {
        throw new Error('Could not acquire a 2d rendering context from the OffscreenCanvas');
    }
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);

    return await canvas.convertToBlob({type: 'image/png'});
}
