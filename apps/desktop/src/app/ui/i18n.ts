// SOURCE: https://github.com/i18next/i18next/issues/1901

import i18next, {type i18n as I18nextType} from 'i18next';
import ICU from 'i18next-icu';

import type {I18nType} from '~/app/ui/i18n-types';
import type {LoggerFactory, LogRecordFn} from '~/common/logging';
import type {StrictPartial, u53} from '~/common/types';
import {assertUnreachable} from '~/common/utils/assert';
import {keys} from '~/common/utils/object';
import {type IQueryableStore, WritableStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import translationArMainJson from '~/translations/ar/translation.json';
import translationBeByMainJson from '~/translations/be-BY/translation.json';
import translationBgMainJson from '~/translations/bg/translation.json';
import translationBnMainJson from '~/translations/bn/translation.json';
import translationCaMainJson from '~/translations/ca/translation.json';
import translationCsMainJson from '~/translations/cs/translation.json';
import translationDeRendezvousEmojiJson from '~/translations/de/rendezvous-emoji.json';
import translationDeMainJson from '~/translations/de/translation.json';
import translationEnRendezvousEmojiJson from '~/translations/en/rendezvous-emoji.json';
import translationEnMainJson from '~/translations/en/translation.json';
import translationEsMainJson from '~/translations/es/translation.json';
import translationFaMainJson from '~/translations/fa/translation.json';
import translationFrMainJson from '~/translations/fr/translation.json';
import translationGswMainJson from '~/translations/gsw/translation.json';
import translationHiMainJson from '~/translations/hi/translation.json';
import translationHuMainJson from '~/translations/hu/translation.json';
import translationItMainJson from '~/translations/it/translation.json';
import translationJaMainJson from '~/translations/ja/translation.json';
import translationNlNlMainJson from '~/translations/nl-NL/translation.json';
import translationNoMainJson from '~/translations/no/translation.json';
import translationPlMainJson from '~/translations/pl/translation.json';
import translationPtBrMainJson from '~/translations/pt-BR/translation.json';
import translationRuMainJson from '~/translations/ru/translation.json';
import translationSkMainJson from '~/translations/sk/translation.json';
import translationTrMainJson from '~/translations/tr/translation.json';
import translationUgMainJson from '~/translations/ug/translation.json';
import translationUkMainJson from '~/translations/uk/translation.json';
import translationUrMainJson from '~/translations/ur/translation.json';
import translationUzMainJson from '~/translations/uz/translation.json';
import translationZhCnMainJson from '~/translations/zh-CN/translation.json';
import translationZhTwMainJson from '~/translations/zh-TW/translation.json';

// Merge translation files
// Note: Locales other than `de`/`en` only translate the main `translation.json`; everything else
// (including the rendezvous emoji names) falls back to English via i18next `fallbackLng`.
const translationArJson = {...translationArMainJson};
const translationBeByJson = {...translationBeByMainJson};
const translationBgJson = {...translationBgMainJson};
const translationBnJson = {...translationBnMainJson};
const translationCaJson = {...translationCaMainJson};
const translationCsJson = {...translationCsMainJson};
const translationDeJson = {...translationDeMainJson, ...translationDeRendezvousEmojiJson};
const translationEnJson = {...translationEnMainJson, ...translationEnRendezvousEmojiJson};
const translationEsJson = {...translationEsMainJson};
const translationFaJson = {...translationFaMainJson};
const translationFrJson = {...translationFrMainJson};
const translationGswJson = {...translationGswMainJson};
const translationHiJson = {...translationHiMainJson};
const translationHuJson = {...translationHuMainJson};
const translationItJson = {...translationItMainJson};
const translationJaJson = {...translationJaMainJson};
const translationNlNlJson = {...translationNlNlMainJson};
const translationNoJson = {...translationNoMainJson};
const translationPlJson = {...translationPlMainJson};
const translationPtBrJson = {...translationPtBrMainJson};
const translationRuJson = {...translationRuMainJson};
const translationSkJson = {...translationSkMainJson};
const translationTrJson = {...translationTrMainJson};
const translationUgJson = {...translationUgMainJson};
const translationUkJson = {...translationUkMainJson};
const translationUrJson = {...translationUrMainJson};
const translationUzJson = {...translationUzMainJson};
const translationZhCnJson = {...translationZhCnMainJson};
const translationZhTwJson = {...translationZhTwMainJson};

/**
 * Define English as the base translation. All other translations will only be able to (optionally)
 * provide keys defined by the base translation.
 */
type BaseTranslation = typeof translationEnJson;

/**
 * This type together with {@link BaseTranslationTopic} ensure that the keys defined in the base
 * translation strictly follow the format described in the documentation.
 */
type BaseTranslationNamespace = {
    readonly [TKey in keyof BaseTranslation]: TKey extends Lowercase<string>
        ? TKey extends 'locale'
            ? Record<Locale, string>
            : TKey extends `${string}--${string}`
              ? TKey extends `${OptionalTranslationTopicModifier}--${Lowercase<string>}`
                  ? BaseTranslationTopic<BaseTranslation[TKey]>
                  : never
              : BaseTranslationTopic<BaseTranslation[TKey]>
        : never;
};
type BaseTranslationTopic<TRecord extends Record<string, string>> = {
    readonly [TKey in keyof TRecord]: TKey extends `${TranslationKeyModifier}--${Lowercase<string>}`
        ? string
        : never;
};

type OptionalTranslationTopicModifier = 'dialog' | 'settings' | 'language';

type TranslationKeyModifier =
    | 'error'
    | 'success'
    | 'action'
    | 'label'
    | 'hint'
    | 'markup'
    | 'prose';

// This cast makes usage of the `BaseTranslationNamespace` to ensure that all keys in the base
// translation follow the format described in the documentation. Otherwise a type error is raised
// here when typechecking.
const translationEn: BaseTranslationNamespace = translationEnJson;

// Casting the `translation*Json` (other than the base `translationEnJson`) values imported from the
// JSON files as `StrictPartial` of `BaseTranslationNamespace` ensures that all translations provide
// only keys defined in the base translation while allowing for missing keys. If a translation
// provides a key that does not exist in the base translation, a type error is raised here when
// typechecking.
const translationDe: StrictPartial<typeof translationDeJson, BaseTranslationNamespace> =
    translationDeJson;
const translationAr: StrictPartial<typeof translationArJson, BaseTranslationNamespace> =
    translationArJson;
const translationBeBy: StrictPartial<typeof translationBeByJson, BaseTranslationNamespace> =
    translationBeByJson;
const translationBg: StrictPartial<typeof translationBgJson, BaseTranslationNamespace> =
    translationBgJson;
const translationBn: StrictPartial<typeof translationBnJson, BaseTranslationNamespace> =
    translationBnJson;
const translationCa: StrictPartial<typeof translationCaJson, BaseTranslationNamespace> =
    translationCaJson;
const translationCs: StrictPartial<typeof translationCsJson, BaseTranslationNamespace> =
    translationCsJson;
const translationEs: StrictPartial<typeof translationEsJson, BaseTranslationNamespace> =
    translationEsJson;
const translationFa: StrictPartial<typeof translationFaJson, BaseTranslationNamespace> =
    translationFaJson;
const translationFr: StrictPartial<typeof translationFrJson, BaseTranslationNamespace> =
    translationFrJson;
const translationGsw: StrictPartial<typeof translationGswJson, BaseTranslationNamespace> =
    translationGswJson;
const translationHi: StrictPartial<typeof translationHiJson, BaseTranslationNamespace> =
    translationHiJson;
const translationHu: StrictPartial<typeof translationHuJson, BaseTranslationNamespace> =
    translationHuJson;
const translationIt: StrictPartial<typeof translationItJson, BaseTranslationNamespace> =
    translationItJson;
const translationJa: StrictPartial<typeof translationJaJson, BaseTranslationNamespace> =
    translationJaJson;
const translationNlNl: StrictPartial<typeof translationNlNlJson, BaseTranslationNamespace> =
    translationNlNlJson;
const translationNo: StrictPartial<typeof translationNoJson, BaseTranslationNamespace> =
    translationNoJson;
const translationPl: StrictPartial<typeof translationPlJson, BaseTranslationNamespace> =
    translationPlJson;
const translationPtBr: StrictPartial<typeof translationPtBrJson, BaseTranslationNamespace> =
    translationPtBrJson;
const translationRu: StrictPartial<typeof translationRuJson, BaseTranslationNamespace> =
    translationRuJson;
const translationSk: StrictPartial<typeof translationSkJson, BaseTranslationNamespace> =
    translationSkJson;
const translationTr: StrictPartial<typeof translationTrJson, BaseTranslationNamespace> =
    translationTrJson;
const translationUg: StrictPartial<typeof translationUgJson, BaseTranslationNamespace> =
    translationUgJson;
const translationUk: StrictPartial<typeof translationUkJson, BaseTranslationNamespace> =
    translationUkJson;
const translationUr: StrictPartial<typeof translationUrJson, BaseTranslationNamespace> =
    translationUrJson;
const translationUz: StrictPartial<typeof translationUzJson, BaseTranslationNamespace> =
    translationUzJson;
const translationZhCn: StrictPartial<typeof translationZhCnJson, BaseTranslationNamespace> =
    translationZhCnJson;
const translationZhTw: StrictPartial<typeof translationZhTwJson, BaseTranslationNamespace> =
    translationZhTwJson;

// Consider keeping the locales in sync in the config/i18next-parser.config.js file.
export const resources = {
    ar: {translation: translationAr},
    'be-BY': {translation: translationBeBy},
    bg: {translation: translationBg},
    bn: {translation: translationBn},
    ca: {translation: translationCa},
    cs: {translation: translationCs},
    de: {translation: translationDe},
    en: {translation: translationEn},
    es: {translation: translationEs},
    fa: {translation: translationFa},
    fr: {translation: translationFr},
    gsw: {translation: translationGsw},
    hi: {translation: translationHi},
    hu: {translation: translationHu},
    it: {translation: translationIt},
    ja: {translation: translationJa},
    'nl-NL': {translation: translationNlNl},
    no: {translation: translationNo},
    pl: {translation: translationPl},
    'pt-BR': {translation: translationPtBr},
    ru: {translation: translationRu},
    sk: {translation: translationSk},
    tr: {translation: translationTr},
    ug: {translation: translationUg},
    uk: {translation: translationUk},
    ur: {translation: translationUr},
    uz: {translation: translationUz},
    'zh-CN': {translation: translationZhCn},
    'zh-TW': {translation: translationZhTw},
} as const;

/**
 * Available locales.
 */
const LOCALES_WITH_TRANSLATIONS = keys(resources);

// Note: 'cimode' is a special locale from i18next to always display the translation key instead
// of the translation.
export const LOCALES = import.meta.env.DEBUG
    ? ([...LOCALES_WITH_TRANSLATIONS, 'cimode'] as const)
    : LOCALES_WITH_TRANSLATIONS;

/**
 * Mapping from locale identifier to name in that language.
 */
export const LOCALE_NAMES: {[locales in keyof typeof resources]: string} & {
    readonly cimode: string;
} = {
    ar: 'العربية',
    'be-BY': 'Беларуская',
    bg: 'Български',
    bn: 'বাংলা',
    ca: 'Català',
    cimode: 'Translation Mode',
    cs: 'Čeština',
    de: 'Deutsch',
    en: 'English',
    es: 'Español',
    fa: 'فارسی',
    fr: 'Français',
    gsw: 'Schwiizerdütsch',
    hi: 'हिन्दी',
    hu: 'Magyar',
    it: 'Italiano',
    ja: '日本語',
    'nl-NL': 'Nederlands',
    no: 'Norsk',
    pl: 'Polski',
    'pt-BR': 'Português (Brasil)',
    ru: 'Русский',
    sk: 'Slovenčina',
    tr: 'Türkçe',
    ug: 'ئۇيغۇرچە',
    uk: 'Українська',
    ur: 'اردو',
    uz: 'Oʻzbekcha',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
};

export type Locale = (typeof LOCALES)[u53];

const FALLBACK_LOCALE: Locale = 'en';

/**
 * Text direction of a locale.
 */
export type LocaleDirection = 'ltr' | 'rtl';

/**
 * Locales that are written right-to-left. Keep this in sync with the locales added to
 * {@link resources}. Any locale not listed here is assumed to be left-to-right.
 */
const RTL_LOCALES: ReadonlySet<string> = new Set<string>(['ar', 'fa', 'ur', 'ug']);

/**
 * Determine the text direction for a locale.
 */
export function localeDirection(locale: string): LocaleDirection {
    // Use the base language subtag (e.g. `ar` from `ar-EG`) so regional variants resolve correctly.
    let language = locale;
    try {
        language = new Intl.Locale(locale).language;
    } catch {
        // Unable to parse the locale; fall back to the raw value.
    }
    return RTL_LOCALES.has(language) ? 'rtl' : 'ltr';
}

/**
 * Apply the locale's text direction and language to the root `<html>` element so that the whole UI
 * lays out correctly for RTL locales and assistive technologies announce the right language.
 *
 * No-op outside of a DOM context (e.g. in a worker).
 */
export function applyDocumentLocaleDirection(locale: Locale): void {
    if (typeof document === 'undefined') {
        return;
    }
    const root = document.documentElement;
    root.setAttribute('dir', localeDirection(locale));
    root.setAttribute('lang', locale);
}

export function ensureLocale(locale: string | undefined): Locale {
    if (locale === undefined) {
        return FALLBACK_LOCALE;
    }

    return getClosestAvailableLocale(locale);
}

export function isLocale(locale: string): locale is Locale {
    return (LOCALES as readonly string[]).includes(locale);
}

function getClosestAvailableLocale(locale: string): Locale {
    if (isLocale(locale)) {
        return locale;
    }

    // TODO(DESK-1122): This is somewhat naive. Use a more intelligent algorithm.
    try {
        const minimizedLocale = new Intl.Locale(locale).language;
        if (isLocale(minimizedLocale)) {
            return minimizedLocale;
        }
    } catch {
        // Unable to create an Intl.Locale object from locale.
        // Ignoring error.
    }

    return FALLBACK_LOCALE;
}

interface LocaleConfig {
    readonly localeStore: IQueryableStore<Locale>;
    readonly logging: LoggerFactory;
}

function i18nLogAdapter(logRecordFn: LogRecordFn): (args: unknown[]) => void {
    return (args: unknown[]) => {
        logRecordFn(...args);
    };
}

// Returning an object `{i18n: i18nextType}` instead of directly `i18n: i18nextType` is a way to force
// triggering an update.
function createI18nStore(i18n: I18nextType): WritableStore<{i18n: I18nextType}> {
    const i18nStore = new WritableStore<{i18n: I18nextType}>({i18n});

    function forceStoreRefresh(): void {
        i18nStore.set({i18n});
    }

    i18n.on('initialized', forceStoreRefresh);
    i18n.on('loaded', forceStoreRefresh);
    i18n.on('added', forceStoreRefresh);
    i18n.on('languageChanged', forceStoreRefresh);

    return i18nStore;
}

const i18nStore = createI18nStore(i18next);

export async function initialize(config: LocaleConfig): Promise<void> {
    const log = config.logging.logger('i18n');
    const i18n = i18nStore.get().i18n;

    if (i18n.isInitialized) {
        log.warn('Already initialized');
        return;
    }

    log.info('Initializing...', {config});

    await i18n
        .use({
            type: 'logger',
            log: i18nLogAdapter(log.info),
            warn: i18nLogAdapter(log.warn),
            error: i18nLogAdapter(log.error),
        })
        .use(ICU)
        .init({
            lng: config.localeStore.get(),
            resources,
            fallbackLng: FALLBACK_LOCALE,
            debug: import.meta.env.DEBUG,
            returnNull: false,
        });

    log.info('Initialization complete', {
        language: i18n.language,
        resolvedLanguage: i18n.resolvedLanguage,
        loadedLanguages: i18n.languages,
    });

    // Apply the initial text direction (and language) to the root element so RTL locales lay out
    // correctly from the first paint.
    applyDocumentLocaleDirection(ensureLocale(i18n.resolvedLanguage));

    // Note: We can ignore the unsubscriber because we will maintain a global reference to the store
    config.localeStore.subscribe((locale) => {
        if (isLocale(locale)) {
            // Keep the document direction in sync with the selected locale, even when i18next does
            // not need to switch languages (e.g. on the initial subscription callback).
            applyDocumentLocaleDirection(locale);
            if (i18n.language === locale) {
                return;
            }
            i18n.changeLanguage(locale).catch(assertUnreachable);
        }
    });
}

// Svelte only re-renders the component using the store, when the store is updated.
// Returning an object is a way to force triggering an update.
//
// TODO(DESK-1081): `i18n` should not be a global, but exposed through `globals`.
export type I18n = Pick<I18nextType, 't'> & Omit<I18nType, 't'>;
export const i18n: IQueryableStore<I18n> = derive(
    [i18nStore],
    ([{currentValue: updatedI18nStore}]) => {
        const locale = ensureLocale(updatedI18nStore.i18n.resolvedLanguage);

        return {
            t: updatedI18nStore.i18n.t,
            locale: locale === 'cimode' ? 'en' : locale,
        };
    },
);
