import type {f64} from '@threema/ts-utils/float/f64';
import type {u53} from '@threema/ts-utils/integer/u53';
import {assert} from '@threema/ts-utils/meta/assert';
import {createRawSnippet} from 'svelte';
import {describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import {render} from 'vitest-browser-svelte';

import {captureElementScreenshot} from '../../utils/test/capture-element-screenshot';
import {createRawTextSnippet} from '../../utils/test/create-raw-text-snippet';

import RadialExclusionMaskProvider from './RadialExclusionMaskProvider.svelte';

/**
 * Shape of the component's `cutouts` prop.
 */
type Cutouts = {
    readonly diameter: u53;
    readonly offsetPx?: {readonly x: f64; readonly y: f64};
    readonly position: {readonly x: f64; readonly y: f64};
}[];

/** Edge length of the opaque content rendered into the masked container, in pixels. */
const CONTENT_SIZE = 200;

/**
 * Width of the band a cutout fades out over, in pixels. Because of it, a cutout's measured edge
 * lies somewhere between its radius and one pixel beyond it.
 */
const FEATHER_PX = 1;

/** An opaque, solid red square of {@link CONTENT_SIZE}, to be masked. */
const contentSnippet = createRawSnippet(() => ({
    render: () =>
        `<div style="width: ${CONTENT_SIZE}px; height: ${CONTENT_SIZE}px; background: #ff0000"></div>`,
}));

interface MaskMeasurement {
    /** Area cut out of the container, in square pixels. */
    readonly cutoutArea: f64;
    /**
     * Radius a single circular cutout of {@link cutoutArea} would have, in pixels. Only meaningful
     * if the cutouts of the measured container do in fact form a single circle.
     */
    readonly cutoutRadius: f64;
    /** Whether the container is opaque at the given position, in pixels. */
    readonly isOpaqueAt: (position: {readonly x: f64; readonly y: f64}) => boolean;
}

/**
 * Render the component with {@link contentSnippet} as its only child, and constrain it to the
 * content's size, so that positions in percent map to {@link CONTENT_SIZE}.
 *
 * @param cutouts The cutouts to apply initially.
 * @returns The masked container, and a way to change the cutouts applied to it.
 */
function renderWithOpaqueContent(cutouts: Cutouts): {
    readonly element: HTMLElement;
    readonly rerenderCutouts: (cutouts: Cutouts) => Promise<void>;
} {
    const {container, rerender} = render(RadialExclusionMaskProvider, {
        children: contentSnippet,
        cutouts,
    });
    container.style.width = `${CONTENT_SIZE}px`;

    const element = container.firstElementChild;
    assert(element instanceof HTMLElement, 'Expected the component to render a container element');

    return {
        element,
        rerenderCutouts: async (updated) => {
            await rerender({children: contentSnippet, cutouts: updated});
        },
    };
}

/**
 * Measure which parts of the given container the browser actually paints, by capturing it on a
 * transparent background and inspecting the alpha channel: whatever is not painted was cut out.
 *
 * @param element The masked container to measure.
 */
async function measureMask(element: HTMLElement): Promise<MaskMeasurement> {
    const {data, height, width} = await captureElementScreenshot(element);

    // Sum up how much of each pixel is cut out, so that the partially transparent pixels along a
    // cutout's edge contribute proportionally.
    let cutoutArea = 0;
    for (let index = 3; index < data.byteLength; index += 4) {
        cutoutArea += 1 - (data[index] ?? 0) / 255;
    }

    return {
        cutoutArea,
        cutoutRadius: Math.sqrt(cutoutArea / Math.PI),
        isOpaqueAt: ({x, y}) => {
            const column = Math.round(x);
            const row = Math.round(y);
            assert(
                column >= 0 && column < width && row >= 0 && row < height,
                `Expected the position (${x}, ${y}) to lie within the container (${width}x${height})`,
            );
            return (data[(row * width + column) * 4 + 3] ?? 0) > 127;
        },
    };
}

/** Convert a position in percent of the container to one in pixels. */
function percent(x: f64, y: f64): {readonly x: f64; readonly y: f64} {
    return {x: (CONTENT_SIZE * x) / 100, y: (CONTENT_SIZE * y) / 100};
}

/** Expect the given measured radius to lie within the feather band around the expected radius. */
function expectRadius(measured: f64, expected: f64): void {
    expect(measured).toBeGreaterThanOrEqual(expected);
    expect(measured).toBeLessThanOrEqual(expected + FEATHER_PX);
}

describe('RadialExclusionMaskProvider.svelte', () => {
    describe('content', () => {
        it('renders its children inside the masked container', async () => {
            // Act
            const {container} = render(RadialExclusionMaskProvider, {
                children: createRawTextSnippet('content'),
                cutouts: [{diameter: 12, position: {x: 20, y: 30}}],
            });

            // Assert
            await expect.element(page.getByText('content')).toBeInTheDocument();
            expect(container.firstElementChild).toHaveTextContent('content');
        });

        it('renders nothing but an empty container if no children are given', () => {
            // Act
            const {container} = render(RadialExclusionMaskProvider, {cutouts: []});

            // Assert
            expect(container.firstElementChild?.children.length).toBe(0);
        });
    });

    describe('cutouts', () => {
        it('leaves the content fully visible if there are no cutouts', async () => {
            // Act
            const {element} = renderWithOpaqueContent([]);

            // Assert
            const mask = await measureMask(element);
            expect(mask.cutoutArea).toBe(0);
            expect(mask.isOpaqueAt(percent(50, 50))).toBe(true);
        });

        it('cuts out a circle of the given diameter', async () => {
            // Act
            const {element} = renderWithOpaqueContent([{diameter: 40, position: {x: 50, y: 50}}]);

            // Assert
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 20);
            expect(mask.isOpaqueAt(percent(50, 50))).toBe(false);
        });

        it('scales the cutout with the given diameter', async () => {
            // Act
            const {element} = renderWithOpaqueContent([{diameter: 100, position: {x: 50, y: 50}}]);

            // Assert
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 50);
        });

        it('supports fractional diameters and positions', async () => {
            // Act: A diameter of 15px amounts to a radius of 7.5px.
            const {element} = renderWithOpaqueContent([
                {diameter: 15, position: {x: 12.5, y: 87.5}},
            ]);

            // Assert
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 7.5);
            expect(mask.isOpaqueAt(percent(12.5, 87.5))).toBe(false);
        });

        it('cuts out the circle at the given position', async () => {
            // Act
            const {element} = renderWithOpaqueContent([{diameter: 40, position: {x: 25, y: 75}}]);

            // Assert: Cut out at 25% from the left and 75% from the top, and nowhere else.
            const mask = await measureMask(element);
            expect(mask.isOpaqueAt(percent(25, 75))).toBe(false);
            expect(mask.isOpaqueAt(percent(75, 25))).toBe(true);
            expectRadius(mask.cutoutRadius, 20);
        });

        it('cuts out only the part of a circle which lies within the container', async () => {
            // Act: Center the cutout on the container's top right corner.
            const {element} = renderWithOpaqueContent([{diameter: 40, position: {x: 100, y: 0}}]);

            // Assert: Only the corner is cut out, i.e. a quarter of the circle.
            const mask = await measureMask(element);
            expect(mask.cutoutArea).toBeGreaterThanOrEqual((Math.PI * 20 ** 2) / 4);
            expect(mask.cutoutArea).toBeLessThanOrEqual((Math.PI * (20 + FEATHER_PX) ** 2) / 4);
            expect(mask.isOpaqueAt(percent(99, 1))).toBe(false);
            expect(mask.isOpaqueAt(percent(1, 99))).toBe(true);
        });

        it('cuts out one circle per cutout', async () => {
            // Act
            const {element} = renderWithOpaqueContent([
                {diameter: 40, position: {x: 25, y: 25}},
                {diameter: 60, position: {x: 75, y: 75}},
            ]);

            // Assert: Both circles are cut out, and the content between them is untouched.
            const mask = await measureMask(element);
            expect(mask.isOpaqueAt(percent(25, 25))).toBe(false);
            expect(mask.isOpaqueAt(percent(75, 75))).toBe(false);
            expect(mask.isOpaqueAt(percent(50, 50))).toBe(true);
            expect(mask.cutoutArea).toBeGreaterThanOrEqual(Math.PI * (20 ** 2 + 30 ** 2));
            expect(mask.cutoutArea).toBeLessThanOrEqual(
                Math.PI * ((20 + FEATHER_PX) ** 2 + (30 + FEATHER_PX) ** 2),
            );
        });

        it('moves the cutout by the given offset in pixels', async () => {
            // Act: Center the cutout, then nudge it by 40px to the right and 20px up.
            const {element} = renderWithOpaqueContent([
                {diameter: 40, offsetPx: {x: 40, y: -20}, position: {x: 50, y: 50}},
            ]);

            // Assert: Cut out around (140, 80) instead of the center, and unchanged in size.
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 20);
            expect(mask.isOpaqueAt({x: 140, y: 80})).toBe(false);
            expect(mask.isOpaqueAt(percent(50, 50))).toBe(true);
        });

        it('cuts out overlapping cutouts only once', async () => {
            // Act: Two concentric cutouts, i.e. the smaller one lies within the larger one.
            const {element} = renderWithOpaqueContent([
                {diameter: 40, position: {x: 50, y: 50}},
                {diameter: 55, position: {x: 50, y: 50}},
            ]);

            // Assert: Only the larger circle is cut out, instead of the sum of both.
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 27.5);
        });
    });

    describe('reactivity', () => {
        it('moves the cutout when its position changes', async () => {
            // Arrange
            const {element, rerenderCutouts} = renderWithOpaqueContent([
                {diameter: 40, position: {x: 25, y: 25}},
            ]);

            // Act
            await rerenderCutouts([{diameter: 40, position: {x: 75, y: 75}}]);

            // Assert
            const mask = await measureMask(element);
            expect(mask.isOpaqueAt(percent(25, 25))).toBe(true);
            expect(mask.isOpaqueAt(percent(75, 75))).toBe(false);
            expectRadius(mask.cutoutRadius, 20);
        });

        it('resizes the cutout when its diameter changes', async () => {
            // Arrange
            const {element, rerenderCutouts} = renderWithOpaqueContent([
                {diameter: 40, position: {x: 50, y: 50}},
            ]);

            // Act
            await rerenderCutouts([{diameter: 100, position: {x: 50, y: 50}}]);

            // Assert
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 50);
        });

        it('closes the cutouts when they are removed', async () => {
            // Arrange
            const {element, rerenderCutouts} = renderWithOpaqueContent([
                {diameter: 40, position: {x: 50, y: 50}},
            ]);

            // Act
            await rerenderCutouts([]);

            // Assert
            const mask = await measureMask(element);
            expect(mask.cutoutArea).toBe(0);
        });

        it('cuts out the content when cutouts are added', async () => {
            // Arrange
            const {element, rerenderCutouts} = renderWithOpaqueContent([]);

            // Act
            await rerenderCutouts([{diameter: 40, position: {x: 50, y: 50}}]);

            // Assert
            const mask = await measureMask(element);
            expectRadius(mask.cutoutRadius, 20);
            expect(mask.isOpaqueAt(percent(50, 50))).toBe(false);
        });
    });
});
