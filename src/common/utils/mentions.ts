import {isIdentityString, type IdentityString} from '~/common/network/types';

// eslint-disable-next-line threema/ban-stateful-regex-flags
export const REGEX_MATCH_MENTION = /@\[(?<identity>[A-Z0-9*]{1}[A-Z0-9]{7}|@{8})\]/gu;

/**
 * Identity string that matches everyone.
 */
export const EVERYONE_IDENTITY_STRING = '@@@@@@@@';

type EveryoneIdentityString = typeof EVERYONE_IDENTITY_STRING;

/**
 * Parse all mentioned identities in a text.
 */
export function getMentionedIdentities(
    text: string,
): ReadonlySet<IdentityString | EveryoneIdentityString> {
    const mentionedIdentities = new Set<IdentityString | EveryoneIdentityString>();
    for (const match of text.matchAll(REGEX_MATCH_MENTION)) {
        const identity = match.groups?.identity;

        if (isIdentityString(identity) || identity === EVERYONE_IDENTITY_STRING) {
            mentionedIdentities.add(identity);
        }
    }
    return mentionedIdentities;
}
