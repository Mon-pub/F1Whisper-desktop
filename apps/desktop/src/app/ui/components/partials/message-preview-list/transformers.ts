import type {AppServicesForSvelte} from '~/app/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import {getTextContent} from '~/app/ui/components/partials/message-preview-list/helpers';
import type {MessagePreviewListProps} from '~/app/ui/components/partials/message-preview-list/props';
import type {I18nType} from '~/app/ui/i18n-types';
import type {DbReceiverLookup} from '~/common/db';
import type {Logger} from '~/common/logging';
import type {MessageId} from '~/common/network/types';
import type {u53} from '~/common/types';

/**
 * Returns the message's quote props in the shape expected by {@link MessageProps}.
 */
export function transformMessageQuoteProps(
    rawQuoteProps: MessagePreviewListProps['items'][u53]['messages'][u53]['quote'],
    receiverLookup: DbReceiverLookup,
    services: Pick<AppServicesForSvelte, 'thumbnailCache'>,
    i18n: I18nType,
    log: Logger,
): MessageProps['quote'] {
    if (rawQuoteProps === undefined) {
        return undefined;
    }
    if (rawQuoteProps === 'not-found') {
        return {
            type: 'not-found',
            fallbackText: i18n.t(
                'messaging.error--quoted-message-not-found',
                'This message could not be found',
            ),
        };
    } else if (rawQuoteProps.type === 'deleted-message') {
        return {
            type: 'deleted',
            fallbackText: i18n.t(
                'messaging.error--quoted-message-deleted',
                'This message was deleted',
            ),
        };
    }

    const sanitizedHtml = getTextContent(
        rawQuoteProps.text?.raw,
        undefined,
        rawQuoteProps.text?.mentions,
        i18n.t,
        70,
    );

    return {
        type: 'default',
        alt: i18n.t('messaging.hint--media-thumbnail', 'Media preview'),
        content:
            sanitizedHtml === undefined
                ? undefined
                : {
                      sanitizedHtml,
                  },
        clickable: false,
        file: transformMessageFileProps(
            rawQuoteProps.file,
            rawQuoteProps.id,
            receiverLookup,
            services,
            rawQuoteProps.text?.raw.length,
        ),
        sender: rawQuoteProps.sender,
    };
}

/**
 * Returns the message's file props including the `thumbnailStore` if the file has a thumbnail.
 */
export function transformMessageFileProps(
    fileProps: MessagePreviewListProps['items'][u53]['messages'][u53]['file'],
    messageId: MessageId,
    receiverLookup: DbReceiverLookup,
    services: Pick<AppServicesForSvelte, 'thumbnailCache'>,
    contentLength: u53 = 0,
): MessageProps['file'] {
    // If the message doesn't have any file, keep its `fileProps` `undefined`.
    if (fileProps === undefined) {
        return undefined;
    }

    // If the file doesn't include a thumbnail, keep the `fileProps` unchanged.
    if (fileProps.thumbnail === undefined) {
        return fileProps as Omit<
            NonNullable<MessagePreviewListProps['items'][u53]['messages'][u53]['file']>,
            'thumbnail'
        >;
    }

    // If `fileProps` contain a thumbnail, fetch the corresponding `thumbnailStore`.
    return Object.assign(fileProps, {
        thumbnail: {
            ...fileProps.thumbnail,
            constraints: {
                min: {
                    width: Math.min(128 + contentLength, 176),
                    height: 70,
                    size: 16384,
                },
                max: {
                    width: 320,
                    height: 196,
                    size: 30000,
                },
            },
            thumbnailStore: services.thumbnailCache.getMessageThumbnail(
                messageId,
                receiverLookup,
                fileProps.thumbnail.expectedDimensions,
            ),
        },
    });
}
