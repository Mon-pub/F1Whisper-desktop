import {nodeContainsTarget} from './node-contains-target';
import {nodeIsTarget} from './node-is-target';

/**
 * Combination of {@link nodeIsTarget} and {@link nodeContainsTarget}. Checks if the given
 * {@link Node} is the given {@link EventTarget} or contains it. Note: If one of the elements is
 * `null` or `undefined`, this function will return `false`.
 */
export function nodeIsOrContainsTarget(
    // As nodes or targets can be null, check it explicitly.
    /* eslint-disable @typescript-eslint/no-restricted-types */
    node: Node | null | undefined,
    target: EventTarget | null | undefined,
    /* eslint-enable @typescript-eslint/no-restricted-types */
): boolean {
    return nodeIsTarget(node, target) || nodeContainsTarget(node, target);
}
