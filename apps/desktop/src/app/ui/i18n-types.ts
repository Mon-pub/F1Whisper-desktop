/**
 * A function similar to `i18n.t`, which is easier to test.
 */
type I18nTLikeFunction = (
    key: string,
    defaultValue: string,
    options?: Record<string, string>,
) => string;

/**
 * An object with helpers to translate things.
 */
export interface I18nType {
    readonly t: I18nTLikeFunction;
    readonly locale:
        | 'ar'
        | 'be-BY'
        | 'bg'
        | 'bn'
        | 'ca'
        | 'cs'
        | 'de'
        | 'en'
        | 'es'
        | 'fa'
        | 'fr'
        | 'gsw'
        | 'hi'
        | 'hu'
        | 'it'
        | 'ja'
        | 'nl-NL'
        | 'no'
        | 'pl'
        | 'pt-BR'
        | 'ru'
        | 'sk'
        | 'tr'
        | 'ug'
        | 'uk'
        | 'ur'
        | 'uz'
        | 'zh-CN'
        | 'zh-TW';
}

export type I18nLocales = I18nType['locale'];
