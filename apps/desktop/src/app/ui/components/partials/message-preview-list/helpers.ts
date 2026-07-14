import type {I18nType} from '~/app/ui/i18n-types';
import {type SanitizedHtml, sanitizeAndParseTextToHtml} from '~/app/ui/utils/text';
import type {u53} from '~/common/types';
import type {AnyMention} from '~/common/viewmodel/utils/mentions';

/**
 * Sanitizes and parses raw text from a text message to HTML.
 */
export function getTextContent(
    raw: string | undefined,
    highlights: string | readonly string[] | undefined,
    mentions: readonly AnyMention[] | undefined,
    t: I18nType['t'],
    truncate?: u53,
): SanitizedHtml | undefined {
    const html = sanitizeAndParseTextToHtml(raw, t, {
        highlights: typeof highlights === 'string' ? [highlights] : highlights,
        mentions,
        shouldLinkMentions: false,
        shouldParseLinks: false,
        shouldParseMarkup: true,
        // This is a non-interactive preview (e.g. search results / message previews); render
        // spoilers permanently obscured so their content cannot leak or be tapped here.
        previewMode: true,
        truncate,
    });

    return html === '' ? undefined : html;
}
