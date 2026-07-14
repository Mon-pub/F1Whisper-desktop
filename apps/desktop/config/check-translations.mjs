// @ts-check

/**
 * Translation parity gate (ALL locales).
 *
 * HARD RULE: every user-facing string MUST be localized equally across ALL shipped locales — the
 * strings that exist today AND any string added in the future. This gate enforces that: it fails
 * (exit code 1) if ANY locale's `translation.json` is not key-for-key identical to the English
 * source (`en/translation.json`), i.e. if a locale is MISSING a key, has an EMPTY value for a key,
 * or has an EXTRA key that no longer exists in the source.
 *
 * `en` is the reference catalog (source of truth for the key set). Every other locale directory
 * under `src/translations/` must contain exactly the same (nested) key set, all non-empty.
 *
 * The same invariant is asserted as a unit test in `src/test/mocha/app/translation-parity.spec.ts`
 * so it also fails `pnpm test`. This script is the build/lint gate (`lint:i18n`).
 *
 * Usage: `node config/check-translations.mjs` (run from the desktop package root).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TRANSLATIONS_DIR = path.resolve(SCRIPT_DIR, '..', 'src', 'translations');
const CATALOG_FILENAME = 'translation.json';
const REFERENCE_LOCALE = 'en';

/**
 * Flatten a nested catalog object into a map of dotted key -> value.
 *
 * @param {Record<string, unknown>} object - The (possibly nested) catalog.
 * @param {string} [prefix] - The accumulated dotted prefix.
 * @param {Map<string, unknown>} [out] - The accumulator.
 * @returns {Map<string, unknown>} A flat map of `a.b.c` -> value.
 */
function flatten(object, prefix = '', out = new Map()) {
    for (const [key, value] of Object.entries(object)) {
        const dotted = prefix === '' ? key : `${prefix}.${key}`;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            flatten(/** @type {Record<string, unknown>} */ (value), dotted, out);
        } else {
            out.set(dotted, value);
        }
    }
    return out;
}

/**
 * List every locale directory that contains a `translation.json`.
 *
 * @returns {string[]} Sorted locale directory names.
 */
function listLocales() {
    return fs
        .readdirSync(TRANSLATIONS_DIR, {withFileTypes: true})
        .filter(
            (entry) =>
                entry.isDirectory() &&
                fs.existsSync(path.join(TRANSLATIONS_DIR, entry.name, CATALOG_FILENAME)),
        )
        .map((entry) => entry.name)
        .sort();
}

/**
 * Load and flatten a locale's catalog.
 *
 * @param {string} locale - The locale directory (e.g. `en`).
 * @returns {Map<string, unknown>} Flattened key -> value map.
 * @throws {Error} If the catalog cannot be read or parsed (the process exits with code 1 first).
 */
function loadFlatCatalog(locale) {
    const file = path.join(TRANSLATIONS_DIR, locale, CATALOG_FILENAME);
    try {
        return flatten(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (error) {
        console.error(`✖ Could not read/parse ${file}: ${error}`);
        process.exit(1);
        throw error; // Unreachable; satisfies the type checker.
    }
}

/**
 * Format a capped, indented bullet list for console output.
 *
 * @param {readonly string[]} keys - The keys to render.
 * @param {number} [cap] - Maximum keys to print before summarizing.
 * @returns {string} Newline-separated indented bullets.
 */
function bulletList(keys, cap = 40) {
    const shown = keys.slice(0, cap).map((key) => `    - ${key}`);
    if (keys.length > cap) {
        shown.push(`    … and ${keys.length - cap} more`);
    }
    return shown.join('\n');
}

function main() {
    const reference = loadFlatCatalog(REFERENCE_LOCALE);
    const referenceKeys = new Set(reference.keys());
    const locales = listLocales().filter((locale) => locale !== REFERENCE_LOCALE);

    let failed = false;
    let totalMissing = 0;
    let totalEmpty = 0;
    let totalExtra = 0;

    for (const locale of locales) {
        const catalog = loadFlatCatalog(locale);
        const keys = new Set(catalog.keys());

        const missing = [...referenceKeys].filter((key) => !keys.has(key)).sort();
        const extra = [...keys].filter((key) => !referenceKeys.has(key)).sort();
        const empty = [...referenceKeys]
            .filter((key) => keys.has(key))
            .filter((key) => {
                const value = catalog.get(key);
                return typeof value !== 'string' || value.trim() === '';
            })
            .sort();

        totalMissing += missing.length;
        totalEmpty += empty.length;
        totalExtra += extra.length;

        if (missing.length === 0 && empty.length === 0 && extra.length === 0) {
            continue;
        }
        failed = true;
        console.error(`\n✖ ${locale}/${CATALOG_FILENAME} is not in parity with ${REFERENCE_LOCALE}:`);
        if (missing.length > 0) {
            console.error(`  ${missing.length} missing key(s):\n${bulletList(missing)}`);
        }
        if (empty.length > 0) {
            console.error(`  ${empty.length} empty value(s):\n${bulletList(empty)}`);
        }
        if (extra.length > 0) {
            console.error(
                `  ${extra.length} extra key(s) not in ${REFERENCE_LOCALE}:\n${bulletList(extra)}`,
            );
        }
    }

    if (failed) {
        console.error(
            `\n✖ Translation parity FAILED (missing ${totalMissing}, empty ${totalEmpty}, extra ${totalExtra}).` +
                `\n  Every locale must match src/translations/${REFERENCE_LOCALE}/${CATALOG_FILENAME} key-for-key, all non-empty.`,
        );
        process.exit(1);
    }

    console.log(
        `✓ Translation parity OK: ${locales.length} locale(s) match ${REFERENCE_LOCALE} (${referenceKeys.size} keys) key-for-key.`,
    );
}

main();
