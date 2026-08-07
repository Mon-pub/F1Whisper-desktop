// @ts-check

/**
 * Source-key coverage + interpolation gate (FU-M11).
 *
 * `check-translations.mjs` proves every locale matches the English catalog, but treats English as
 * the complete source of truth: a key USED in source yet absent from every catalog passes silently.
 * This gate closes that gap. It extracts the i18n keys actually referenced in source using the
 * project's own i18next-parser (into a throwaway directory, never touching `src/translations/`) and
 * asserts each exists in the committed English catalog. It also checks that interpolation
 * placeholders (`{name}`) present in the English value are preserved by every locale, so a
 * translation cannot silently drop or rename a variable.
 *
 * Runs alongside `check-translations.mjs` (source coverage first, then locale parity).
 *
 * Usage: `node config/check-source-keys.mjs` (run from the desktop package root).
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';
import {fileURLToPath} from 'node:url';

import {findUncoveredKeys, placeholderNames} from './i18n-source-keys.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const TRANSLATIONS_DIR = path.join(PACKAGE_ROOT, 'src', 'translations');
const CATALOG_FILENAME = 'translation.json';
const REFERENCE_LOCALE = 'en';
const I18NEXT_BIN = path.join(PACKAGE_ROOT, 'node_modules', '.bin', 'i18next');
const I18NEXT_CONFIG = path.join(SCRIPT_DIR, 'i18next-parser.config.js');
// The same source globs as the `generate:translations` package script.
const SOURCE_GLOBS = ['src/app/**/*.{ts,svelte}', 'src/common/dom/ui/**/*.ts'];

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
 * Load a translation catalog file and flatten it to dotted keys.
 *
 * @param {string} file - Absolute path to a `translation.json`.
 * @returns {Map<string, unknown>} Flat dotted-key catalog.
 */
function loadFlatCatalog(file) {
    return flatten(JSON.parse(fs.readFileSync(file, {encoding: 'utf8'})));
}

/**
 * Whether two sets contain exactly the same members.
 *
 * @param {Set<string>} a - First set.
 * @param {Set<string>} b - Second set.
 * @returns {boolean} Whether both sets contain exactly the same members.
 */
function sameSet(a, b) {
    return a.size === b.size && [...a].every((member) => b.has(member));
}

/**
 * Extract the i18n keys referenced in source by running the project's i18next-parser into a
 * throwaway directory (so `src/translations/` is never touched) and reading the generated reference
 * catalog's key set.
 *
 * @returns {Set<string>} The set of source-referenced keys.
 */
function extractSourceKeys() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1w-i18n-src-'));
    try {
        execFileSync(
            I18NEXT_BIN,
            [
                ...SOURCE_GLOBS,
                '-o',
                path.join(tmpDir, '$LOCALE/$NAMESPACE.json'),
                '-c',
                I18NEXT_CONFIG,
            ],
            {cwd: PACKAGE_ROOT, stdio: ['ignore', 'ignore', 'inherit']},
        );
        const generated = path.join(tmpDir, REFERENCE_LOCALE, CATALOG_FILENAME);
        if (!fs.existsSync(generated)) {
            throw new Error(
                `i18next-parser produced no ${REFERENCE_LOCALE} catalog at ${generated}`,
            );
        }
        return new Set(loadFlatCatalog(generated).keys());
    } finally {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    }
}

function main() {
    const referenceCatalog = loadFlatCatalog(
        path.join(TRANSLATIONS_DIR, REFERENCE_LOCALE, CATALOG_FILENAME),
    );
    const referenceKeys = new Set(referenceCatalog.keys());

    // 1. Source-key coverage: every key used in source must exist in the reference catalog.
    const sourceKeys = extractSourceKeys();
    const uncovered = findUncoveredKeys(sourceKeys, referenceKeys);

    // 2. Interpolation consistency: each locale must preserve the reference value's `{name}` set.
    const locales = fs
        .readdirSync(TRANSLATIONS_DIR, {withFileTypes: true})
        .filter(
            (entry) =>
                entry.isDirectory() &&
                fs.existsSync(path.join(TRANSLATIONS_DIR, entry.name, CATALOG_FILENAME)),
        )
        .map((entry) => entry.name)
        .filter((locale) => locale !== REFERENCE_LOCALE);
    /** @type {string[]} */
    const placeholderProblems = [];
    for (const locale of locales) {
        const catalog = loadFlatCatalog(
            path.join(TRANSLATIONS_DIR, locale, CATALOG_FILENAME),
        );
        for (const [key, referenceValue] of referenceCatalog) {
            const referenceNames = placeholderNames(referenceValue);
            if (referenceNames.size === 0 || !catalog.has(key)) {
                // Missing keys are reported by `check-translations.mjs` (locale parity).
                continue;
            }
            const localeNames = placeholderNames(catalog.get(key));
            if (!sameSet(referenceNames, localeNames)) {
                placeholderProblems.push(
                    `${locale} · ${key}: expected {${[...referenceNames].sort().join(', ')}}, ` +
                        `got {${[...localeNames].sort().join(', ')}}`,
                );
            }
        }
    }

    let failed = false;
    if (uncovered.length > 0) {
        failed = true;
        console.error(
            `\n✖ ${uncovered.length} i18n key(s) used in source but missing from ` +
                `${REFERENCE_LOCALE}/${CATALOG_FILENAME}:`,
        );
        for (const key of uncovered) {
            console.error(`    ${key}`);
        }
    }
    if (placeholderProblems.length > 0) {
        failed = true;
        console.error(`\n✖ ${placeholderProblems.length} interpolation placeholder mismatch(es):`);
        for (const problem of placeholderProblems) {
            console.error(`    ${problem}`);
        }
    }

    if (failed) {
        console.error(
            `\n✖ Source-key coverage FAILED. Add every source-referenced key to ` +
                `src/translations/${REFERENCE_LOCALE}/${CATALOG_FILENAME} and keep placeholders identical.`,
        );
        process.exit(1);
    }

    console.log(
        `✓ Source-key coverage OK: ${sourceKeys.size} source key(s) all present in ` +
            `${REFERENCE_LOCALE} (${referenceKeys.size} keys); placeholders consistent across ` +
            `${locales.length} locale(s).`,
    );
}

// CLI entry point. This module is only ever executed via `node config/check-source-keys.mjs`
// (the `lint:i18n:source` script); the pure helpers tests need live in `i18n-source-keys.mjs`, so
// this file is never imported into a bundle and running `main()` unconditionally is safe.
main();
