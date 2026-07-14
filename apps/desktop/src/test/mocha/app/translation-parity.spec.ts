import {expect} from 'chai';

/**
 * Translation parity unit test.
 *
 * HARD RULE: every user-facing string MUST be localized equally across ALL shipped locales — the
 * strings that exist today AND any string added in the future. This test fails (so `pnpm test` and
 * therefore the build fail) if ANY locale's `translation.json` is not key-for-key identical to the
 * English source (`en`): a MISSING key, an EMPTY value, or an EXTRA key that no longer exists in the
 * source all fail the test. `en` is the reference catalog (source of truth for the key set).
 *
 * The identical invariant is enforced at build/lint time by `config/check-translations.mjs`
 * (`lint:i18n`); this spec makes it part of the test suite as well.
 */

const REFERENCE_LOCALE = 'en';

// Eagerly bundle every locale catalog at build time (no runtime filesystem access needed).
const CATALOGS = import.meta.glob<Record<string, unknown>>(
    '../../../translations/*/translation.json',
    {eager: true, import: 'default'},
);

/**
 * Flatten a nested catalog object into a map of dotted key -> value.
 */
function flatten(
    object: Record<string, unknown>,
    prefix = '',
    out = new Map<string, unknown>(),
): Map<string, unknown> {
    for (const [key, value] of Object.entries(object)) {
        const dotted = prefix === '' ? key : `${prefix}.${key}`;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            flatten(value as Record<string, unknown>, dotted, out);
        } else {
            out.set(dotted, value);
        }
    }
    return out;
}

/**
 * Extract the locale directory name from a glob path like
 * `../../../translations/de/translation.json`.
 */
function localeFromPath(globPath: string): string {
    const match = /translations\/(?<locale>[^/]+)\/translation\.json$/u.exec(globPath);
    const locale = match?.groups?.locale;
    if (locale === undefined) {
        throw new Error(`Could not extract locale from path: ${globPath}`);
    }
    return locale;
}

export function run(): void {
    describe('translation parity', function () {
        const byLocale = new Map<string, Map<string, unknown>>();
        for (const [globPath, catalog] of Object.entries(CATALOGS)) {
            byLocale.set(localeFromPath(globPath), flatten(catalog));
        }

        const reference = byLocale.get(REFERENCE_LOCALE);

        it(`has the reference (${REFERENCE_LOCALE}) catalog with keys`, function () {
            expect(reference, `${REFERENCE_LOCALE}/translation.json`).to.not.be.equal(undefined);
            expect(reference?.size ?? 0).to.be.greaterThan(0);
        });

        if (reference === undefined) {
            return;
        }
        const referenceKeys = [...reference.keys()];

        for (const [locale, catalog] of byLocale) {
            if (locale === REFERENCE_LOCALE) {
                continue;
            }

            it(`${locale} is key-for-key identical to ${REFERENCE_LOCALE} with no empty values`, function () {
                const keys = new Set(catalog.keys());

                const missing = referenceKeys.filter((key) => !keys.has(key));
                const extra = [...keys].filter((key) => !reference.has(key));
                const empty = referenceKeys
                    .filter((key) => keys.has(key))
                    .filter((key) => {
                        const value = catalog.get(key);
                        return typeof value !== 'string' || value.trim() === '';
                    });

                expect(missing, `keys missing in "${locale}"`).to.deep.equal([]);
                expect(
                    extra,
                    `keys in "${locale}" not present in "${REFERENCE_LOCALE}"`,
                ).to.deep.equal([]);
                expect(empty, `empty values in "${locale}"`).to.deep.equal([]);
            });
        }
    });
}
