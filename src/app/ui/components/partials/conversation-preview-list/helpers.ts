import type {Draft} from '~/app/ui/components/partials/conversation/drafts';
import type {ConversationPreviewListItem} from '~/app/ui/components/partials/conversation-preview-list/props';
import type {AnyContentItemOptions} from '~/app/ui/components/partials/receiver-card/internal/content-item/types';
import type {I18nType} from '~/app/ui/i18n-types';
import {type SanitizedHtml, sanitizeAndParseTextToHtml} from '~/app/ui/utils/text';
import {unreachable} from '~/common/utils/assert';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

export function getReceiverCardBottomLeftItemOptions(
    draft: Draft | undefined,
    i18n: I18nType,
    isArchived: boolean,
    isPrivate: boolean,
    lastMessage: ConversationPreviewListItem<unknown>['lastMessage'],
    receiver: AnyReceiverData,
): AnyContentItemOptions[] | undefined {
    let lastMessageItem: AnyContentItemOptions[] =
        lastMessage === undefined
            ? []
            : [
                  {
                      type: 'text',
                      text: {
                          html: getLastMessagePreviewText(i18n, receiver, lastMessage),
                      },
                  } as const,
              ];

    // Prefer draft.
    if (draft !== undefined) {
        lastMessageItem = [
            {
                type: 'text',
                text: {
                    html: `<span class="draft">${i18n.t('messaging.label--prefix-draft', 'Draft:')}</span> ${draft.text}` as SanitizedHtml,
                },
            },
        ];
    }

    // Hide last message text if the conversation is private.
    if (isPrivate) {
        lastMessageItem = [
            {
                type: 'text',
                text: {
                    raw: i18n.t('messaging.label--protected-conversation', 'Private'),
                },
            },
        ];
    }

    switch (receiver.type) {
        case 'contact': {
            const {isInactive, isInvalid} = receiver;

            return [
                {
                    type: 'tags',
                    isArchived,
                    isInactive,
                    isInvalid,
                } as const,
                ...lastMessageItem,
            ];
        }

        case 'group': {
            return [
                {
                    type: 'tags',
                    isArchived,
                } as const,
                ...lastMessageItem,
            ];
        }

        // TODO(DESK-236): Implement distribution lists.
        case 'distribution-list':
            return undefined;

        default:
            return unreachable(receiver);
    }
}

function getLastMessagePreviewText(
    i18n: I18nType,
    receiver: Pick<AnyReceiverData, 'type'>,
    lastMessage: Pick<
        NonNullable<ConversationPreviewListItem<unknown>['lastMessage']>,
        'file' | 'sender' | 'text' | 'status' | 'pollData'
    >,
): SanitizedHtml {
    let text: SanitizedHtml | undefined = undefined;

    if (lastMessage.status.deleted !== undefined) {
        return i18n.t(
            'messaging.label--deleted-message-preview',
            'This message was deleted',
        ) as SanitizedHtml;
    }
    if (lastMessage.text !== undefined) {
        text = sanitizeAndParseTextToHtml(lastMessage.text.raw, i18n.t, {
            mentions: lastMessage.text.mentions,
            shouldLinkMentions: false,
            shouldParseMentionsAsRawText: true,
            shouldParseLinks: false,
            shouldParseMarkup: true,
        });
    } else if (lastMessage.pollData !== undefined) {
        text = sanitizeAndParseTextToHtml(
            `${i18n.t('messaging.label--default-poll-message-preview', 'Poll')}: ${lastMessage.pollData.description}`,
            i18n.t,
            {
                shouldLinkMentions: false,
                shouldParseMentionsAsRawText: true,
                shouldParseLinks: false,
                shouldParseMarkup: true,
            },
        );
    } else if (lastMessage.file !== undefined) {
        switch (lastMessage.file.type) {
            case 'audio':
                text = i18n.t(
                    'messaging.label--default-audio-message-preview',
                    'Voice Message',
                ) as SanitizedHtml;
                break;

            case 'file':
                text = i18n.t(
                    'messaging.label--default-file-message-preview',
                    'File',
                ) as SanitizedHtml;
                break;

            case 'image':
                text = i18n.t(
                    'messaging.label--default-image-message-preview',
                    'Image',
                ) as SanitizedHtml;
                break;

            case 'video':
                text = i18n.t(
                    'messaging.label--default-video-message-preview',
                    'Video',
                ) as SanitizedHtml;
                break;

            default:
                unreachable(lastMessage.file.type);
        }
    }

    if (receiver.type === 'group' && text !== undefined) {
        switch (lastMessage.sender.type) {
            case 'self':
                return i18n.t('messaging.label--default-sender-self', 'Me: {text}', {
                    text,
                }) as SanitizedHtml;
            case 'contact':
                return `${lastMessage.sender.name}: ${text}` as SanitizedHtml;
            default:
                unreachable(lastMessage.sender);
        }
    }

    return text ?? ('' as SanitizedHtml);
}
