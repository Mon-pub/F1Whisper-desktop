import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

/**
 * Determine whether or not a receiver is a notes group.
 */
export function isNotesGroup(receiver: AnyReceiverDataOrSelf): boolean {
    return (
        receiver.type === 'group' &&
        !receiver.isLeft &&
        receiver.creator.type === 'self' &&
        receiver.members.length === 0
    );
}
