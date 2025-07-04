import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Returns true if the user is allowed to send reactions to the given receiver.
 */
export function receiverAllowsReactions(receiver: AnyReceiverData): boolean {
    return !(
        (receiver.type === 'contact' && receiver.isBlocked) ||
        (receiver.type === 'group' && receiver.isLeft)
    );
}
