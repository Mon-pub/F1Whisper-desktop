import type {
    AnchorPoint,
    Flip,
    Offset,
    Padding,
    PartialDOMRect,
    PopoverCloseFunction,
    RectPoint,
    VirtualRect,
} from '~/app/ui/generic/popover/types';
import type {i53} from '~/common/types';
import {clamp} from '~/common/utils/number';
import {WritableStore} from '~/common/utils/store';

/**
 * A store that stores a {@link PopoverCloseFunction}.
 *
 * If the store contains `undefined`, then no menu is currently visible.
 */
export const popoverStore = new WritableStore<PopoverCloseFunction | undefined>(undefined);

/**
 * Resolve an element-or-rect into a {@link PartialDOMRect} (in viewport coordinates).
 */
function resolveRect(elementOrRect: HTMLElement | PartialDOMRect): PartialDOMRect {
    return elementOrRect instanceof HTMLElement
        ? elementOrRect.getBoundingClientRect()
        : elementOrRect;
}

/**
 * Calculates and returns the {@link Offset} that can be used to move/translate the popover to the
 * desired position.
 *
 * @param constraintContainer The container element that constrains the positioning of this popover.
 * @param positioningContainer The container element that is used as the origin to calculate
 *   relative positioning.
 * @param reference Element or virtual element that the popover will be anchored to.
 * @param popover The popover element.
 * @param anchorPoints Configuration of where the popover should attach to the anchor.
 * @param offset An optional offset to move the popover relative to the anchor.
 * @param flip Whether the popover should flip so that it doesn't overflow the
 *   `constraintContainer`.
 * @param safetyGap An additional gap relative to the `constraintContainer`.
 * @returns The {@link Offset} the popover should move to be at the desired position.
 */
export function getPopoverOffset(
    constraintContainer: HTMLElement | PartialDOMRect,
    positioningContainer: HTMLElement | PartialDOMRect,
    reference: HTMLElement | VirtualRect,
    popover: HTMLElement,
    anchorPoints: AnchorPoint,
    offset: Offset = {left: 0, top: 0},
    flip = true,
    safetyGap: Padding = {left: 0, right: 0, top: 0, bottom: 0},
): Offset {
    // 1. Get the `DOMRect` of the popover, but disregard any previously applied transforms (e.g.,
    //    if the popover has already been positioned previously).
    const popoverRect = getBoundingClientRectWithoutTransforms(popover);

    // 2. Calculate the preferred offset of the popover without considering any constraints.
    const preferredPopoverOffset = getUnconstrainedPopoverOffset(
        positioningContainer,
        reference,
        popover,
        anchorPoints,
        offset,
    );
    const popoverRectWithOffset = getRectPlusOffset(popoverRect, preferredPopoverOffset);

    // 3. Calculate whether (and in which direction) the popover needs to be flipped to be fully
    //    visible.
    const suggestedPopoverFlip = flip
        ? getSuggestedPopoverFlip(popoverRectWithOffset, constraintContainer, safetyGap)
        : 'none';

    // 4. Calculate and return the final offset of the popover, and account for a possible flip.
    const popoverOffsetAfterFlip =
        suggestedPopoverFlip === 'none'
            ? preferredPopoverOffset
            : getUnconstrainedPopoverOffset(
                  positioningContainer,
                  reference,
                  popover,
                  getFlippedAnchorPoint(anchorPoints, suggestedPopoverFlip),
                  getFlippedOffset(offset, suggestedPopoverFlip),
              );
    const popoverRectAfterFlip = getRectPlusOffset(popoverRect, popoverOffsetAfterFlip);

    // 5. If the popover is still not fully visible, even after flipping it, just move it until it
    //    is (best-effort).
    const popoverOffsetCorrection = getSuggestedOffsetCorrection(
        popoverRectAfterFlip,
        constraintContainer,
        safetyGap,
    );

    // Return the suggested offset the popover should be translated by, relative to its original
    // position.
    return {
        left: popoverOffsetAfterFlip.left + popoverOffsetCorrection.left,
        top: popoverOffsetAfterFlip.top + popoverOffsetCorrection.top,
    };
}

/**
 * Calculates and returns the {@link Offset} that can be used to move/translate the popover to the
 * desired position without considering any constraints.
 *
 * @param positioningContainer The container element that is used as the origin to calculate
 *   relative positioning.
 * @param reference Element or virtual element that the popover will be anchored to.
 * @param popover The popover element.
 * @param anchorPoints Configuration of where the popover should attach to the anchor.
 * @param offset An optional offset to move the popover relative to the anchor.
 * @returns The {@link Offset} the popover should move to be at the desired position.
 */
function getUnconstrainedPopoverOffset(
    positioningContainer: HTMLElement | PartialDOMRect,
    reference: HTMLElement | VirtualRect,
    popover: HTMLElement,
    anchorPoints: AnchorPoint,
    offset: Offset = {left: 0, top: 0},
): Offset {
    // Get `DOMRect`s.
    const positioningContainerRect: PartialDOMRect = resolveRect(positioningContainer);
    const referenceRect: PartialDOMRect =
        reference instanceof HTMLElement ? reference.getBoundingClientRect() : reference;
    const popoverRect: PartialDOMRect = getBoundingClientRectWithoutTransforms(popover);

    // Calculate `AnchorPoint` offsets.
    const referenceAnchorPointOffset = getRectPointOffset(referenceRect, anchorPoints.reference);
    const popoverAnchorPointOffset = getRectPointOffset(popoverRect, anchorPoints.popover);

    // Calculate Deltas.
    const popoverToContainerOffset = getRelativeRectOffset(popoverRect, positioningContainerRect);
    const referenceToContainerOffset = getRelativeRectOffset(
        referenceRect,
        positioningContainerRect,
    );

    // Calculate and return translation.
    return {
        left:
            popoverToContainerOffset.left +
            referenceToContainerOffset.left +
            (referenceAnchorPointOffset.left - popoverAnchorPointOffset.left) +
            offset.left,
        top:
            popoverToContainerOffset.top +
            referenceToContainerOffset.top +
            (referenceAnchorPointOffset.top - popoverAnchorPointOffset.top) +
            offset.top,
    };
}

/**
 * Calculates and returns the relative distance between two {@link PartialDOMRect}s.
 *
 * @param rect The {@link PartialDOMRect} to calculate the distance from.
 * @param toRect The {@link PartialDOMRect} to calculate the distance to.
 * @returns The relative distance between the two {@link PartialDOMRect}s as an {@link Offset}.
 */
function getRelativeRectOffset(rect: PartialDOMRect, toRect: PartialDOMRect): Offset {
    return {
        left: rect.left - toRect.left,
        top: rect.top - toRect.top,
    };
}

/**
 * Calculates and returns the {@link PartialDOMRect} that describes the spatial properties of an
 * {@link HTMLElement} without considering any transforms that have been applied to it.
 *
 * @param element The {@link HTMLElement} to get the {@link PartialDOMRect} from.
 * @returns The calculated {@link PartialDOMRect}.
 */
function getBoundingClientRectWithoutTransforms(element: HTMLElement): PartialDOMRect {
    const rect = element.getBoundingClientRect();
    const computedStyle = getComputedStyle(element);
    const transform = computedStyle.transform;

    if (transform === 'none') {
        return rect;
    }

    const transformMatrix = new DOMMatrix(transform);
    const inverseTransformMatrix = transformMatrix.invertSelf();
    const offsetWithTransform = new DOMPoint(rect.left, rect.top);
    const offsetWithoutTransform = offsetWithTransform.matrixTransform(inverseTransformMatrix);

    return getRectWithOffset(rect, {left: offsetWithoutTransform.x, top: offsetWithoutTransform.y});
}

/**
 * Calculates and returns the distance of a {@link RectPoint} from a {@link PartialDOMRect} as an
 * {@link Offset}.
 *
 * @param rect The {@link PartialDOMRect} that the `rectPoint` belongs to.
 * @param rectPoint The {@link RectPoint} to calculate its {@link Offset} from (relative to the
 *   `rect`).
 * @returns The distance of the `rectPoint` relative to the `rect`.
 */
function getRectPointOffset(rect: PartialDOMRect, rectPoint: RectPoint): Offset {
    const horizontalOffsetMap = {
        left: 0,
        center: rect.width / 2,
        right: rect.width,
    };

    const verticalOffsetMap = {
        top: 0,
        center: rect.height / 2,
        bottom: rect.height,
    };

    return {
        left: horizontalOffsetMap[rectPoint.horizontal],
        top: verticalOffsetMap[rectPoint.vertical],
    };
}

/**
 * Calculates and returns the required {@link Flip} so that the popover doesn't overflow the
 * `constraintContainer`.
 *
 * @param popoverRect The {@link PartialDOMRect} of the popover.
 * @param constraintContainer The container that constrains the positioning of the popover.
 * @param safetyGap Minimum distance from the `constraintContainer`'s bounds which is considered
 *   safe for positioning without needing a flip.
 * @returns A proposed {@link Flip} to apply to the popover.
 */
function getSuggestedPopoverFlip(
    popoverRect: PartialDOMRect,
    constraintContainer: HTMLElement | PartialDOMRect,
    safetyGap: Padding = {left: 0, right: 0, top: 0, bottom: 0},
): Flip {
    const {horizontal, vertical} = getIsRectInVisibleAreaOfContainer(
        popoverRect,
        constraintContainer,
        safetyGap,
    );

    if (horizontal && vertical) {
        return 'none';
    }

    if (!horizontal && !vertical) {
        return 'both';
    }

    if (horizontal) {
        return 'vertical';
    }

    if (vertical) {
        return 'horizontal';
    }

    // Should be unreachable, but just in case, don't transform at all.
    return 'none';
}

/**
 * Calculates the suggested {@link Offset} by which the `popoverRect` should be moved to be fully
 * (or optimally) visible inside the container.
 *
 * @param popoverRect The {@link PartialDOMRect} of the popover.
 * @param constraintContainer The container that should constrain the popover.
 * @param safetyGap Minimum distance to try to ensure between `popoverRect` and `constraintContainer`.
 * @returns The suggested offset to move the popover by.
 */
function getSuggestedOffsetCorrection(
    popoverRect: PartialDOMRect,
    constraintContainer: HTMLElement | PartialDOMRect,
    safetyGap: Padding = {left: 0, right: 0, top: 0, bottom: 0},
): Offset {
    const containerRect = resolveRect(constraintContainer);
    const visibleArea = {
        ...containerRect,
        top: Math.max(containerRect.top, 0) + safetyGap.top,
        left: Math.max(containerRect.left, 0) + safetyGap.left,
        bottom: Math.min(containerRect.bottom, window.innerHeight) - safetyGap.bottom,
        right: Math.min(containerRect.right, window.innerWidth) - safetyGap.right,
    };
    const relativeOffset = getBoundingRectRelativeToContainer(popoverRect, visibleArea);

    // Return early if there is no overflow.
    if (
        relativeOffset.top >= 0 &&
        relativeOffset.left >= 0 &&
        relativeOffset.bottom >= 0 &&
        relativeOffset.right >= 0
    ) {
        return {
            left: 0,
            top: 0,
        };
    }

    // The amount by which the popover overflows its container, per edge.
    const overflow = {
        top: Math.abs(Math.min(relativeOffset.top, 0)),
        left: Math.abs(Math.min(relativeOffset.left, 0)),
        bottom: Math.abs(Math.min(relativeOffset.bottom, 0)),
        right: Math.abs(Math.min(relativeOffset.right, 0)),
    };

    // The available room to move toward each edge before adding overflow there (never negative —
    // when the popover already overflows that edge there is no room and `clamp`'s `max` must stay
    // `>= min`).
    const room = {
        top: Math.max(relativeOffset.top, 0),
        left: Math.max(relativeOffset.left, 0),
        bottom: Math.max(relativeOffset.bottom, 0),
        right: Math.max(relativeOffset.right, 0),
    };

    const offsetCorrectionLeft = getAxisOffsetCorrection({
        overflowStart: overflow.left,
        overflowEnd: overflow.right,
        roomStart: room.left,
        roomEnd: room.right,
    });

    const offsetCorrectionTop = getAxisOffsetCorrection({
        overflowStart: overflow.top,
        overflowEnd: overflow.bottom,
        roomStart: room.top,
        roomEnd: room.bottom,
    });

    return {
        left: offsetCorrectionLeft,
        top: offsetCorrectionTop,
    };
}

/**
 * Computes the correction offset along a single axis so the popover stays within the visible area.
 *
 * Positive = move toward the END edge (right/bottom); negative = move toward the START edge
 * (left/top). When the popover overflows BOTH edges (it is larger than the visible area along this
 * axis), it cannot fit by shifting, so it is pinned to the START edge (top/left) — keeping the near
 * edge (and the popover's first content) on-screen while the popover scrolls internally for the
 * remainder.
 *
 * @param overflowStart Overflow past the start (top/left) edge (>= 0).
 * @param overflowEnd Overflow past the end (bottom/right) edge (>= 0).
 * @param roomStart Available room toward the start edge before overflowing it (>= 0).
 * @param roomEnd Available room toward the end edge before overflowing it (>= 0).
 */
function getAxisOffsetCorrection({
    overflowStart,
    overflowEnd,
    roomStart,
    roomEnd,
}: {
    overflowStart: i53;
    overflowEnd: i53;
    roomStart: i53;
    roomEnd: i53;
}): i53 {
    // Overflows both edges (larger than the visible area): pin the START edge to the margin so the
    // popover's first content stays visible; the rest is reachable by scrolling its capped body.
    if (overflowStart > 0 && overflowEnd > 0) {
        return clamp(overflowStart, {min: 0});
    }

    // Overflows only the end edge: move toward the start, but only as far as the room there allows.
    if (overflowEnd > 0) {
        return -clamp(overflowEnd, {min: 0, max: roomStart});
    }

    // Overflows only the start edge: move toward the end, but only as far as the room there allows.
    if (overflowStart > 0) {
        return clamp(overflowStart, {min: 0, max: roomEnd});
    }

    // No overflow on this axis.
    return 0;
}

/**
 * Calculates and returns the inverse {@link AnchorPoint} definition based on an existing
 * {@link AnchorPoint} and a {@link Flip}.
 *
 * @param anchorPoint The {@link AnchorPoint} to flip.
 * @param flip The {@link Flip} to use to invert the `anchorPoint` by.
 * @returns A new {@link AnchorPoint} inverted by the supplied {@link Flip}.
 */
function getFlippedAnchorPoint(anchorPoint: AnchorPoint, flip: Flip): AnchorPoint {
    if (flip === 'none') {
        return anchorPoint;
    }

    const horizontalInverseMap: Record<RectPoint['horizontal'], RectPoint['horizontal']> = {
        left: 'right',
        center: 'center',
        right: 'left',
    };

    const verticalInverseMap: Record<RectPoint['vertical'], RectPoint['vertical']> = {
        top: 'bottom',
        center: 'center',
        bottom: 'top',
    };

    const isFlipHorizontal = flip === 'horizontal' || flip === 'both';
    const isFlipVertical = flip === 'vertical' || flip === 'both';

    const {
        reference: {horizontal: rh, vertical: rv},
        popover: {horizontal: ph, vertical: pv},
    } = anchorPoint;

    return {
        reference: {
            horizontal: isFlipHorizontal ? horizontalInverseMap[rh] : rh,
            vertical: isFlipVertical ? verticalInverseMap[rv] : rv,
        },
        popover: {
            horizontal: isFlipHorizontal ? horizontalInverseMap[ph] : ph,
            vertical: isFlipVertical ? verticalInverseMap[pv] : pv,
        },
    };
}

/**
 * Calculates and returns an inverse {@link Offset} based on an existing {@link Offset} and a
 * {@link Flip}.
 *
 * @param offset The {@link Offset} to flip.
 * @param flip The {@link Flip} to apply to the `offset`.
 * @returns A new {@link Offset} inverted by the supplied {@link Flip}.
 */
function getFlippedOffset(offset: Offset, flip: Flip): Offset {
    const isFlipHorizontal = flip === 'horizontal' || flip === 'both';
    const isFlipVertical = flip === 'vertical' || flip === 'both';

    return {
        left: isFlipHorizontal ? -offset.left : offset.left,
        top: isFlipVertical ? -offset.top : offset.top,
    };
}

/**
 * Calculates and returns if a {@link PartialDOMRect} is (spatially) enclosed by a container.
 *
 * @param rect The {@link PartialDOMRect} to check if its area is enclosed by the `container`.
 * @param container The {@link HTMLElement} to check if it encloses the area of the `rect`.
 * @param safetyGap Minimum distance needed between `rect` and `container` before considering it to
 *   be in the visible area.
 * @returns Whether the `rect` is enclosed by the area of the `container`, by direction.
 */
function getIsRectInVisibleAreaOfContainer(
    rect: PartialDOMRect,
    container: HTMLElement | PartialDOMRect,
    safetyGap: Padding = {left: 0, right: 0, top: 0, bottom: 0},
): {horizontal: boolean; vertical: boolean} {
    const containerRect = resolveRect(container);

    const visibleArea = {
        top: Math.max(containerRect.top, 0) + safetyGap.top,
        left: Math.max(containerRect.left, 0) + safetyGap.left,
        bottom: Math.min(containerRect.bottom, window.innerHeight) - safetyGap.bottom,
        right: Math.min(containerRect.right, window.innerWidth) - safetyGap.right,
    };

    // Ceil and floor rounding are necessary in case the app on electron is not being displayed at
    // 100% zoom.
    // REF: https://bugs.chromium.org/p/chromium/issues/detail?id=359691
    return {
        horizontal:
            Math.ceil(rect.left) >= Math.floor(visibleArea.left) &&
            Math.floor(rect.right) <= Math.ceil(visibleArea.right),
        vertical:
            Math.ceil(rect.top) >= Math.floor(visibleArea.top) &&
            Math.floor(rect.bottom) <= Math.ceil(visibleArea.bottom),
    };
}

/**
 * Returns a new {@link PartialDOMRect} based on the supplied `rect` and the `offset` added.
 *
 * @param rect The {@link PartialDOMRect} to add the `offset` to.
 * @param offset The {@link Offset} to add to the `rect`.
 * @returns A new {@link PartialDOMRect} with the `offset` added.
 */
function getRectPlusOffset(rect: PartialDOMRect, offset: Offset): PartialDOMRect {
    return new DOMRect(rect.left + offset.left, rect.top + offset.top, rect.width, rect.height);
}

/**
 * Returns a new {@link PartialDOMRect} based on the supplied `rect`, with its positional properties
 * replaced by the supplied `offset`.
 *
 * @param rect The {@link PartialDOMRect} to replace the position of.
 * @param offset The {@link Offset} to replace the position of the `rect` with.
 * @returns A new {@link PartialDOMRect} with the position replaced.
 */
function getRectWithOffset(rect: PartialDOMRect, offset: Offset): PartialDOMRect {
    return new DOMRect(offset.left, offset.top, rect.width, rect.height);
}

/**
 * Returns the position of a `rect` relative to the supplied `containerRect`.
 *
 * @param rect The rect to get the position of.
 * @param containerRect The container to calculate the relative position from.
 * @returns The position of `rect` relative to `containerRect` on all its sides.
 */
function getBoundingRectRelativeToContainer(
    rect: PartialDOMRect,
    containerRect: PartialDOMRect,
): {left: i53; right: i53; top: i53; bottom: i53} {
    return {
        left: Math.floor(rect.left) - Math.ceil(containerRect.left),
        right: Math.floor(containerRect.right) - Math.ceil(rect.right),
        top: Math.floor(rect.top) - Math.ceil(containerRect.top),
        bottom: Math.floor(containerRect.bottom) - Math.ceil(rect.bottom),
    };
}
