// @ts-check

/**
 * Pure helpers for the source-key coverage gate (FU-M11).
 *
 * Split out from `check-source-keys.mjs` so tests can import these without pulling in the CLI's
 * top-level path resolution. `check-source-keys.mjs` resolves paths at module scope via
 * `fileURLToPath(import.meta.url)`; when a spec imports that module, esbuild shims `import.meta.url`
 * into a `document.*` reference that does not exist in the node test bundle and crashes the whole
 * suite at load. This module has no imports and no top-level side effects, so it is safe to bundle.
 */

/**
 * The keys referenced by source but not defined by the catalog.
 *
 * @param {Iterable<string>} sourceKeys - Keys extracted from source.
 * @param {Set<string>} catalogKeys - Keys present in the reference catalog.
 * @returns {string[]} Sorted uncovered keys.
 */
export function findUncoveredKeys(sourceKeys, catalogKeys) {
    return [...sourceKeys].filter((key) => !catalogKeys.has(key)).sort();
}

/**
 * The interpolation variable names (`{name}`) referenced by a catalog value.
 *
 * @param {unknown} value - A catalog value.
 * @returns {Set<string>} The set of referenced variable names.
 */
export function placeholderNames(value) {
    /** @type {Set<string>} */
    const names = new Set();
    if (typeof value !== 'string') {
        return names;
    }
    for (const match of value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu)) {
        const name = match[1];
        if (name !== undefined) {
            names.add(name);
        }
    }
    return names;
}
