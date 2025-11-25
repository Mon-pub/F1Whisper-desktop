import {GroupUserState} from '~/common/enum';
import type {Group} from '~/common/model/types/group';
import type {IdentityString} from '~/common/network/types';

/**
 * Returns whether a group is a notes group or not.
 */
export function isNotesGroup(group: Group): boolean {
    return (
        group.view.members.size === 0 &&
        group.view.userState === GroupUserState.MEMBER &&
        group.view.creator === 'me'
    );
}

/**
 * Returns whether the group creator is a Gateway ID.
 */
export function isGroupManagedByGateway(groupCreatorIdentity: IdentityString): boolean {
    return groupCreatorIdentity.startsWith('*');
}

/**
 * Returns whether the group creator is a Gateway ID and is monitoring the conversation.
 */
export function isGroupManagedAndMonitoredByGateway(
    groupName: string,
    groupCreatorIdentity: IdentityString,
): boolean {
    return isGroupManagedByGateway(groupCreatorIdentity) && groupName.startsWith('☁');
}
