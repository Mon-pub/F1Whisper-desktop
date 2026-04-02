/**
 * Checks if the given {@link Node} and {@link EventTarget} are both defined and refer to the same
 * DOM node.
 */
export function nodeIsTarget(
    // As nodes or targets can be null, check it explicitly.
    /* eslint-disable @typescript-eslint/no-restricted-types */
    node: Node | null | undefined,
    target: EventTarget | null | undefined,
    /* eslint-enable @typescript-eslint/no-restricted-types */
): boolean {
    if (node === undefined || node === null || target === null || target === undefined) {
        return false;
    }

    return node === target;
}
