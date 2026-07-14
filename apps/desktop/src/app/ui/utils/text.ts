import {markify, TokenType} from '@threema/threema-markup';
import autolinker from 'autolinker';

import type {I18nType} from '~/app/ui/i18n-types';
import type {u53, WeakOpaque} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import {escapeRegExp} from '~/common/utils/regex';
import {truncate} from '~/common/utils/string';
import type {AnyMention} from '~/common/viewmodel/utils/mentions';

export type SanitizedHtml = WeakOpaque<string, {readonly SanitizedHtml: unique symbol}>;

export interface SanitizeAndParseTextToHtmlOptions {
    /** The {@link Mention}s to search for and replace in the text. */
    readonly mentions?: readonly AnyMention[];
    /** The highlights to search for and replace in the text. */
    readonly highlights?: readonly string[];
    /** If mentions should link to the conversation with the respective contact. */
    readonly shouldLinkMentions?: boolean;
    /**
     * Whether to replace mentions with raw text instead of markup. Note: This will override
     * `shouldLinkMentions` if set to `true`. Defaults to `false`.
     */
    readonly shouldParseMentionsAsRawText?: boolean;
    /** If simple markup tokens (bold, italic, strikethrough) should be replaced. */
    readonly shouldParseMarkup?: boolean;
    /** If links should be detected and replaced. */
    readonly shouldParseLinks?: boolean;
    /**
     * Whether the text is rendered in a non-interactive preview context (e.g. the conversation list
     * or a notification). In preview mode, spoiler markup is rendered permanently obscured and is
     * not revealable, so spoiler content never leaks outside the conversation. Defaults to `false`.
     */
    readonly previewMode?: boolean;
    /**
     * Truncates the text to the desired length, if given. Note: If `highlights` are given, the
     * truncation will adjust to try to keep them visible.
     */
    readonly truncate?: u53;
}

/**
 * Parses some text and replaces various tokens with HTML. This is useful to render messages and
 * message previews with formatting.
 *
 * Note: Input text will be sanitized.
 *
 * @param text The input text
 * @param t The function to use for translating labels of special mentions, such as "@All".
 * @param options See {@link SanitizeAndParseTextToHtmlOptions} for docs
 * @returns The text containing the specified tokens replaced with HTML.
 */
export function sanitizeAndParseTextToHtml(
    text: string | undefined,
    t: I18nType['t'],
    {
        mentions,
        highlights,
        shouldLinkMentions = true,
        shouldParseMentionsAsRawText = false,
        shouldParseMarkup = false,
        shouldParseLinks = false,
        previewMode = false,
        truncate: truncateMax,
    }: SanitizeAndParseTextToHtmlOptions,
): SanitizedHtml {
    if (text === undefined || text === '') {
        // eslint-disable-next-line threema/ban-sanitized-html-cast
        return '' as SanitizedHtml;
    }

    let sanitizedText = escapeHtmlUnsafeChars(text);

    if (truncateMax !== undefined) {
        if (highlights !== undefined) {
            // eslint-disable-next-line threema/ban-sanitized-html-cast
            sanitizedText = truncate(
                sanitizedText,
                truncateMax,
                'around',
                highlights,
                'end',
            ) as SanitizedHtml;
        } else {
            // eslint-disable-next-line threema/ban-sanitized-html-cast
            sanitizedText = truncate(sanitizedText, truncateMax, 'end') as SanitizedHtml;
        }
    }

    if (shouldParseMarkup) {
        sanitizedText = parseMarkup(sanitizedText, previewMode);
    }

    if (mentions !== undefined) {
        sanitizedText = parseMentions(
            t,
            sanitizedText,
            mentions,
            shouldLinkMentions,
            !shouldParseMentionsAsRawText,
        );
    }

    if (highlights !== undefined) {
        sanitizedText = parseHighlights(sanitizedText, highlights);
    }

    if (shouldParseLinks) {
        sanitizedText = parseLinks(sanitizedText);
    }

    return sanitizedText;
}

/**
 * Escape HTML-unsafe characters in the given input string. If the input is
 * undefined an empty string is returned.
 *
 * @param text string | undefined
 * @returns escaped string
 */
export function escapeHtmlUnsafeChars(text: string | undefined): SanitizedHtml {
    if (text === undefined || text === '') {
        // eslint-disable-next-line threema/ban-sanitized-html-cast
        return '' as SanitizedHtml;
    }

    // eslint-disable-next-line threema/ban-sanitized-html-cast
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;') as SanitizedHtml;
}

/**
 * Returns an HTML tag (as a string) that can be used to render a {@link Mention}.
 *
 * @param t The function to use for translating labels of special mentions, such as "@All".
 * @param mention The mention to generate HTML code for.
 * @param enableLinks Whether to format mentions of contacts as links.
 * @param enableMarkup Whether to replace the mention with markup or raw text. Note: This will
 *   override `enableLinks` if set to `false`.
 * @returns A string containing a HTML tag which represents the supplied `Mention`.
 */
function getMentionHtml(
    t: I18nType['t'],
    mention: AnyMention,
    enableLinks: boolean,
    enableMarkup: boolean,
): SanitizedHtml {
    switch (mention.type) {
        case 'self': {
            const text = escapeHtmlUnsafeChars(
                mention.nickname ?? t('messaging.label--mention-me', 'Me'),
            );
            // eslint-disable-next-line threema/ban-sanitized-html-cast
            return (
                enableMarkup ? `<span class="mention me">@${text}</span>` : `@${text}`
            ) as SanitizedHtml;
        }
        case 'contact': {
            const name = escapeHtmlUnsafeChars(mention.name);
            if (!enableMarkup) {
                // eslint-disable-next-line threema/ban-sanitized-html-cast
                return `@${name}` as SanitizedHtml;
            }
            if (enableLinks) {
                const href = `#/conversation/${mention.lookup.type}/${mention.lookup.uid}/`;
                // eslint-disable-next-line threema/ban-sanitized-html-cast
                return `<a href="${href}" draggable="false" class="mention">@${name}</a>` as SanitizedHtml;
            }
            // eslint-disable-next-line threema/ban-sanitized-html-cast
            return `<span class="mention">@${name}</span>` as SanitizedHtml;
        }
        case 'removed-contact': {
            const name = escapeHtmlUnsafeChars(mention.identity);
            // eslint-disable-next-line threema/ban-sanitized-html-cast
            return (
                enableMarkup ? `<span class="mention">@${name}</span>` : `@${name}`
            ) as SanitizedHtml;
        }
        case 'everyone': {
            const text = escapeHtmlUnsafeChars(t('messaging.label--mention-all', 'All'));
            // eslint-disable-next-line threema/ban-sanitized-html-cast
            return (
                enableMarkup ? `<span class="mention all">@${text}</span>` : `@${text}`
            ) as SanitizedHtml;
        }
        default:
            return unreachable(mention);
    }
}

function getHighlightHtml(highlight: SanitizedHtml): SanitizedHtml {
    // eslint-disable-next-line threema/ban-sanitized-html-cast
    return `<span class="highlight-subtext">${highlight}</span>` as SanitizedHtml;
}

/* eslint-disable threema/ban-sanitized-html-cast */
function joinSanitized(
    parts: SanitizedHtml[],
    separator: SanitizedHtml = '' as SanitizedHtml,
): SanitizedHtml {
    return parts.join(separator) as SanitizedHtml;
}
/* eslint-enable threema/ban-sanitized-html-cast */

/**
 * Sentinel character (Unicode private use area) used to mask out inline-code spans so their
 * contents are not interpreted as bold/italic/strike or spoiler markup. The placeholder takes the
 * form `{index}`, which cannot collide with already-escaped user content (the input is
 * `SanitizedHtml`, so any literal `` the user typed survives, but `markify`/the spoiler regex
 * never emit one — and we restore them all in the same pass).
 */
const CODE_MASK_SENTINEL = String.fromCharCode(0xe000);

// Inline-code spans: single backtick pairs, non-empty, no backtick or newline inside.
// eslint-disable-next-line threema/ban-stateful-regex-flags
const REGEX_MATCH_CODE = /`(?<content>[^`\n]+?)`/gu;
// Spoiler spans: doubled pipes required, non-empty, no newline inside.
// eslint-disable-next-line threema/ban-stateful-regex-flags
const REGEX_MATCH_SPOILER = /\|\|(?<content>[^\n]+?)\|\|/gu;
// The masked inline-code placeholder produced in step 1, restored in step 4.
// eslint-disable-next-line threema/ban-stateful-regex-flags
const REGEX_MATCH_CODE_MASK = new RegExp(
    `${CODE_MASK_SENTINEL}(?<index>\\d+)${CODE_MASK_SENTINEL}`,
    'gu',
);

/**
 * Parses some text and replaces predefined markup indicators with HTML tags:
 * - `` `some words` `` to `<span class="md-code">some words</span>` (rendered literally, monospace).
 * - `*some words*` to `<span class="md-bold">some words</span>`.
 * - `_some words_` to `<span class="md-italic">some words</span>`.
 * - `~some words~` to `<span class="md-strike">some words</span>`.
 * - `||some words||` to a spoiler span (tap-to-reveal; permanently obscured in preview mode).
 *
 * Inline code is masked out first so that markup tokens inside a code span stay literal. Spoiler
 * markup is applied after `markify` so the bold/italic/strike inside a spoiler still render once
 * revealed.
 *
 * @param text The text to parse (already HTML-sanitized).
 * @param previewMode If `true`, spoilers are rendered permanently obscured and non-interactive
 *   (for the conversation list and notifications), so the hidden text never leaks.
 * @returns The text containing the markup replaced with HTML.
 */
function parseMarkup(text: SanitizedHtml, previewMode = false): SanitizedHtml {
    // 1. Mask inline-code spans so their contents are not parsed as other markup. Single backtick
    //    pairs only; the content must be non-empty and must not contain a backtick or newline.
    const codeSpans: string[] = [];
    let masked = (text as string).replace(REGEX_MATCH_CODE, (...args) => {
        const groups = args[args.length - 1] as {readonly content: string};
        const index = codeSpans.push(groups.content) - 1;
        return `${CODE_MASK_SENTINEL}${index}${CODE_MASK_SENTINEL}`;
    });

    // 2. Apply the standard markup (bold/italic/strike) via the shared markify implementation.
    masked = markify(masked, {
        [TokenType.Asterisk]: 'md-bold',
        [TokenType.Underscore]: 'md-italic',
        [TokenType.Tilde]: 'md-strike',
    });

    // 3. Replace `||spoiler||` (doubled pipes required). In preview mode the span is obscured and
    //    non-interactive; otherwise it is tap-to-reveal (handled by a delegated click handler in
    //    `Prose.svelte`). Content must be non-empty and must not contain a newline.
    masked = masked.replace(REGEX_MATCH_SPOILER, (...args) => {
        const groups = args[args.length - 1] as {readonly content: string};
        const tabindex = previewMode ? '' : ' role="button" tabindex="0"';
        const previewClass = previewMode ? ' preview' : '';
        return `<span class="md-spoiler${previewClass}"${tabindex}>${groups.content}</span>`;
    });

    // 4. Restore the masked inline-code spans as monospace markup.
    masked = masked.replace(REGEX_MATCH_CODE_MASK, (...args) => {
        const groups = args[args.length - 1] as {readonly index: string};
        return `<span class="md-code">${codeSpans[Number(groups.index)]}</span>`;
    });

    // eslint-disable-next-line threema/ban-sanitized-html-cast
    return masked as SanitizedHtml;
}

/**
 * Parses some text and replaces `@[<IdentityString>]` mentions with HTML tags. The
 * replacement will be `@All` or `@<mention.name>`, wrapped in an appropriate tag:
 *
 * - `span` for mentions of type "all" or "self".
 * - `a` for mentions of type "other" (linking to the corresponding conversation).
 *
 * @param t The function to use for translating labels of special mentions, such as "@All".
 * @param text The text to parse.
 * @param mentions One or more mentions to search for and replace in the text.
 * @param enableLinks Whether to format mentions of contacts as links.
 * @param enableMarkup Whether to replace the mention with markup or raw text. Note: This will
 *   override `enableLinks` if set to `false`.
 * @returns The text containing the mentions replaced with HTML.
 */
export function parseMentions(
    t: I18nType['t'],
    text: SanitizedHtml,
    mentions: readonly AnyMention[],
    enableLinks: boolean,
    enableMarkup: boolean,
): SanitizedHtml {
    let parsedText = text;

    // If the result is rendered as text, insert a space after every mention that is immediately
    // followed by another mention.
    if (!enableMarkup) {
        // eslint-disable-next-line threema/ban-sanitized-html-cast
        parsedText = parsedText.replaceAll(
            // Matches an identity (e.g., @[*SUPPORT]) or all mention (@[@@@@@@@@]), which is
            // immediately followed by another mention (matched using a positive lookahead
            // `(?=...)`).
            //
            // eslint-disable-next-line threema/ban-stateful-regex-flags
            /(?<identity>@\[[A-Z0-9*]{1}[A-Z0-9]{7}\]|@\[@{8}\])(?=@\[[A-Z0-9*]{1}[A-Z0-9]{7}\]|@\[@{8}\])/gu,
            (match) => `${match} `,
        ) as SanitizedHtml;
    }

    for (const mention of mentions) {
        // eslint-disable-next-line threema/ban-sanitized-html-cast
        parsedText = parsedText.replaceAll(
            `@[${mention.identity}]`,
            getMentionHtml(t, mention, enableLinks, enableMarkup),
        ) as SanitizedHtml;
    }

    return parsedText;
}

/**
 * Parses some text and replaces highlights (e.g. from search) with HTML tags.
 *
 * @param text The text to parse.
 * @param highlights An array of highlights to search for and replace in the text.
 * @returns The text containing the highlights replaced with HTML.
 */
export function parseHighlights(text: SanitizedHtml, highlights: readonly string[]): SanitizedHtml {
    let parsedText = text;
    for (const highlight of highlights) {
        if (highlight.trim() !== '') {
            parsedText = joinSanitized(
                // eslint-disable-next-line threema/ban-sanitized-html-cast
                parsedText
                    // Split text at the locations where it matches the highlight string.
                    .split(new RegExp(`(${escapeRegExp(highlight)})`, 'ui'))
                    // Replace chunks to highlight with HTML.
                    .map((chunk, index) =>
                        // eslint-disable-next-line threema/ban-sanitized-html-cast
                        index % 2 === 0 ? chunk : getHighlightHtml(chunk as SanitizedHtml),
                    ) as SanitizedHtml[],
            );
        }
    }

    return parsedText;
}

/**
 * Parses some text and replaces urls with actual `a` tags.
 *
 * @param text The text to parse.
 * @returns The text containing the urls replaced with HTML.
 */
export function parseLinks(text: SanitizedHtml): SanitizedHtml {
    // Autolinker has isses with paths containing ':' and '.'. See
    // https://github.com/gregjacobs/Autolinker.js/issues/433 Therefore we disable the schemeMatches
    // logic for all links that do not begin with “http(s)”. We can remove this logic once the issue
    // is resolved.
    return joinSanitized(
        // TODO(DESK-2111): Sanitizing the split text by whitespace and then converting into HTML is
        // a faulty approach, we should do the required text conversions and then sanitize.
        //
        // eslint-disable-next-line threema/ban-sanitized-html-cast
        text
            // Split on all white space (space, nbsp, new line etc.)
            .split(/(?<ws>\s+)/u)
            .map((token) => {
                // Early return if token is just white space
                if (/^\s+$/u.test(token)) {
                    return token;
                }

                return autolinker.link(token, {
                    phone: false,
                    stripPrefix: false,
                    stripTrailingSlash: false,
                    urls: {
                        ipV4Matches: false,
                        // Enable schemeMatches only for propper http(s) links
                        schemeMatches: /^[^:/]*https?:\/\//u.test(token),
                    },
                    replaceFn: (match) => {
                        // Autolinker sometimes matches text starting with a double-slash (e.g. "//threema.ch"),
                        // which shouldn't be permitted.
                        if (match.type === 'url' && match.getMatchedText().startsWith('//')) {
                            return false;
                        }

                        if (match.type === 'url' && match.getUrlMatchType() === 'tld') {
                            // If no scheme was given use `https://` instead of `http://`
                            // See https://github.com/gregjacobs/Autolinker.js/issues/319
                            return match
                                .buildTag()
                                .setAttr('href', match.getUrl().replace('http://', 'https://'));
                        }
                        return true;
                    },
                });
            }) as SanitizedHtml[],
    );
}
