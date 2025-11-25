import type {AppServicesForSvelte} from '~/app/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {RegularMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/props';
import type {DbReceiverLookup} from '~/common/db';
import type {MessageId} from '~/common/network/types';
import type {IQueryableStoreValue} from '~/common/utils/store';

/**
 * Returns the message's file props including the `ThumbnailStore` if the file has a thumbnail.
 */
export function transformMessageFileProps(
    fileProps: IQueryableStoreValue<RegularMessageProps['store']>['file'],
    messageId: MessageId,
    receiverLookup: DbReceiverLookup,
    services: Pick<AppServicesForSvelte, 'thumbnailCache'>,
): MessageProps['file'] {
    // If the message doesn't have any file, keep its `fileProps` `undefined`.
    if (fileProps === undefined) {
        return undefined;
    }

    // If the file doesn't include a thumbnail, keep the `fileProps` unchanged.
    if (fileProps.thumbnail === undefined) {
        return fileProps as Omit<
            NonNullable<IQueryableStoreValue<RegularMessageProps['store']>['file']>,
            'thumbnail'
        >;
    }

    // If `fileProps` contain a thumbnail, fetch the corresponding `ThumbnailStore`.
    return Object.assign(fileProps, {
        thumbnail: {
            ...fileProps.thumbnail,
            thumbnailStore: services.thumbnailCache.getMessageThumbnail(
                messageId,
                receiverLookup,
                fileProps.thumbnail.expectedDimensions,
            ),
        },
    });
}
