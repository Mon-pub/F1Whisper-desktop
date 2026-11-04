import type {f64} from '@threema/ts-utils/float/f64';
import {unreachable} from '@threema/ts-utils/meta/unreachable';

interface CommonCharmPosition {
    /**
     * Extra offset of the charm from its default calculated position, in pixels. Defaults to no
     * offset.
     */
    readonly offsetPx?: {
        readonly x: f64;
        readonly y: f64;
    };
}

interface RadialCharmPosition extends CommonCharmPosition {
    /**
     * Place the charm centered on the circular outline of the container at a given position in
     * degrees.
     */
    readonly type: 'radial';
    /**
     * Position on the container's circular outline, in degrees (`0` to `360`), starting at the top
     * center.
     */
    readonly degrees: f64;
}

interface RelativeCharmPosition extends CommonCharmPosition {
    /**
     * Place the charm relative to the container's top left corner.
     */
    readonly type: 'relative';
    /**
     * Position of the charm's center relative to the left edge of the container, in percent (e.g.,
     * `20`).
     */
    readonly x: f64;
    /**
     * Position of the charm's center relative to the top edge of the container, in percent (e.g.,
     * `20`).
     */
    readonly y: f64;
}

/**
 * Position of a charm in its container.
 */
export type CharmPosition = RadialCharmPosition | RelativeCharmPosition;

/**
 * Normalize any type of {@link CharmPosition} to a {@link RelativeCharmPosition}.
 */
export function getRelativeCharmPosition(position: CharmPosition): Required<RelativeCharmPosition> {
    const offsetPx = position.offsetPx ?? {x: 0, y: 0};

    switch (position.type) {
        case 'radial': {
            // Convert to radian and adjust by `-90` degrees to start from the top center.
            const radian = ((position.degrees - 90) * Math.PI) / 180;

            // Half of the container (`50`) in the charm's direction, starting from its center
            // (`50`), traces the inscribed ellipse.
            return {
                offsetPx,
                type: 'relative',
                x: 50 + Math.cos(radian) * 50,
                y: 50 + Math.sin(radian) * 50,
            };
        }

        case 'relative':
            return {...position, offsetPx};

        default:
            return unreachable(position);
    }
}
