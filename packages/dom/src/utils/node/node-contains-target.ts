/**
 * Checks if the given {@link Node} contains the given {@link EventTarget}. If one of the elements
 * is `null` or `undefined`, this function will return `false`.
 *
 * Useful to check if an event originated in the subtree of a specific node or element.
 *
 * @param node Node whose subtree to check.
 * @param target EventTarget to check if it is a descendant of `node`.
 * @returns `true` if `target` is a descendant of `node`, false otherwise (and if one of them is not
 *   present).
 */
export function nodeContainsTarget(
    // As nodes or targets can be null, check it explicitly.
    /* eslint-disable @typescript-eslint/no-restricted-types */
    node: Node | null | undefined,
    target: EventTarget | null | undefined,
    /* eslint-enable @typescript-eslint/no-restricted-types */
): boolean {
    if (node === undefined || node === null || target === null || target === undefined) {
        return false;
    }

    return node.contains(target as Node);
}
