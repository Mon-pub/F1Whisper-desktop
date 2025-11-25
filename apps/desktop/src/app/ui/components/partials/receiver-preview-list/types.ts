import type {WeakOpaque} from '~/common/types';

/**
 * A unique identifier of a receiver in a preview list.
 */
export type ReceiverPreviewListId = WeakOpaque<
    string,
    {readonly ReceiverPreviewListId: unique symbol}
>;
