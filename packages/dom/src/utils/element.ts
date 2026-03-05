/**
 * Look up an element by ID and throw if it is not found.
 *
 * @param id The element ID to look up.
 * @returns The element with the given ID.
 * @throws {Error} If no element with the given ID exists in the document.
 */
export function getElementByIdOrThrow(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (element === null) {
        throw new Error(`Element with id "${id}" not found`);
    }
    return element;
}
