import type {u53} from '@threema/ts-utils/integer/u53';
import {assert} from '@threema/ts-utils/meta/assert';

import {createTestImageBytes} from './create-test-image-bytes';

/**
 * Create a solid black dummy image of the given dimensions as a `data:` URL, for use as dummy image
 * data in tests.
 *
 * @param dimensions The desired image dimensions in pixels.
 * @returns A `data:` URL of a PNG image of the requested size.
 */
export async function createTestImageDataUrl(
    dimensions: {readonly height?: u53; readonly width?: u53} = {},
): Promise<string> {
    const blob = await createTestImageBytes(dimensions);
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            const {result} = reader;
            assert(typeof result === 'string', 'Expected the FileReader result to be a data URL');
            resolve(result);
        });
        reader.addEventListener('error', () =>
            reject(reader.error ?? new Error('Failed to read the image blob as a data URL')),
        );
        reader.readAsDataURL(blob);
    });
}
