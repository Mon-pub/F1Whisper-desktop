import type {ContextMenuItem} from '~/app/ui/components/hocs/context-menu-provider/types';
import type {StatusMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/status-message/props';
import type {I18nType} from '~/app/ui/i18n-types';
import {GroupUserState, StatusMessageType} from '~/common/enum';
import type {u53} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import type {IQueryableStoreValue} from '~/common/utils/store';

/**
 * Returns the context menu items for the status message context menu.
 */
export function getContextMenuItems(
    i18n: I18nType,
    onClickMessageDetails: () => void,
    onClickDelete: () => void,
): readonly ContextMenuItem[] {
    return [
        {
            type: 'option',
            handler: onClickMessageDetails,
            icon: {name: 'info'},
            label: i18n.t('messaging.action--message-option-details', 'Message Details'),
        },
        {
            type: 'option',
            handler: onClickDelete,
            icon: {
                name: 'delete',
                color: 'default',
                filled: false,
            },
            label: i18n.t('messaging.action--message-option-delete', 'Delete'),
        },
    ];
}

/**
 * Returns the status message text for the given status.
 */
export function getStatusMessageTextForStatus(
    status: IQueryableStoreValue<StatusMessageProps['store']>['status'],
    i18n: I18nType,
): string {
    switch (status.type) {
        case StatusMessageType.CHAT_RESTORED: {
            return i18n.t(
                'status.prose--chat-restored',
                'This device was relinked. Future messages will appear below.',
            );
        }
        case StatusMessageType.GROUP_MEMBER_CHANGED: {
            return i18n.t(
                'status.prose--group-member-changed',
                '{addedCount, plural, =0 {} =1 {{addedMembers} was added to the group} other {{addedMembers} were added to the group}}{and, plural, =0 {} other {, and }}{removedCount, plural, =0 {} =1 {{removedMembers} was removed from the group} other {{removedMembers} were removed from the group}}',
                {
                    addedMembers: status.added.join(', '),
                    removedMembers: status.removed.join(', '),
                    addedCount: `${status.added.length}`,
                    removedCount: `${status.removed.length}`,
                    and: status.added.length > 0 && status.removed.length > 0 ? '1' : '0',
                },
            );
        }
        case StatusMessageType.GROUP_MEMBERS_LEFT: {
            return i18n.t(
                'status.prose--group-members-left',
                '{leftCount, plural, =0 {} =1 {{leftMembers} left the group} other {{leftMembers} left the group}}',
                {
                    leftMembers: status.left.join(', '),
                    leftCount: `${status.left.length}`,
                },
            );
        }
        case StatusMessageType.GROUP_NAME_CHANGED: {
            if (status.oldName === '') {
                return i18n.t(
                    'status.prose--group-created-name',
                    'The group name was changed to “{name}”',
                    {
                        name: status.newName,
                    },
                );
            }
            return i18n.t(
                'status.prose--group-name-changed',
                'The group name was changed from “{old}” to “{new}”',
                {old: status.oldName, new: status.newName},
            );
        }

        case StatusMessageType.GROUP_PROFILE_PICTURE_CHANGED: {
            return status.change === 'removed'
                ? i18n.t(
                      'status.prose--group-profile-picture-removed',
                      'The group picture was removed',
                  )
                : i18n.t(
                      'status.prose--group-profile-picture-set',
                      'The group picture was updated',
                  );
        }

        case StatusMessageType.GROUP_CALL_STARTED:
            return i18n.t(
                'status.prose--group-call-started',
                '{startedBy} has started a group call',
                {
                    startedBy: status.startedBy,
                },
            );

        case StatusMessageType.GROUP_CALL_ENDED:
            return i18n.t('status.prose--group-call-ended', 'Group call has ended');

        case StatusMessageType.GROUP_USER_STATE_CHANGED:
            return getUserStateStatusMessageText(i18n, status.newUserState);

        case StatusMessageType.DISAPPEARING_TIMER_CHANGED: {
            const who =
                status.changedBy === 'me'
                    ? i18n.t('status.prose--disappearing-timer-changed-by-you', 'You')
                    : status.changedBy;
            if (status.newTimerSeconds === 0) {
                return i18n.t(
                    'status.prose--disappearing-timer-off',
                    '{who} turned off disappearing messages',
                    {who},
                );
            }
            return i18n.t(
                'status.prose--disappearing-timer-set',
                '{who} set the disappearing messages timer to {duration}',
                {who, duration: formatDisappearingTimerDuration(i18n, status.newTimerSeconds)},
            );
        }

        default:
            return unreachable(status);
    }
}

/**
 * Format a disappearing-messages timer (in seconds) as a human-readable duration.
 */
function formatDisappearingTimerDuration(i18n: I18nType, seconds: u53): string {
    const minute = 60;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    if (seconds % week === 0) {
        return i18n.t(
            'status.prose--disappearing-duration-weeks',
            '{count, plural, one {# week} other {# weeks}}',
            {count: `${seconds / week}`},
        );
    }
    if (seconds % day === 0) {
        return i18n.t(
            'status.prose--disappearing-duration-days',
            '{count, plural, one {# day} other {# days}}',
            {count: `${seconds / day}`},
        );
    }
    if (seconds % hour === 0) {
        return i18n.t(
            'status.prose--disappearing-duration-hours',
            '{count, plural, one {# hour} other {# hours}}',
            {count: `${seconds / hour}`},
        );
    }
    if (seconds % minute === 0) {
        return i18n.t(
            'status.prose--disappearing-duration-minutes',
            '{count, plural, one {# minute} other {# minutes}}',
            {count: `${seconds / minute}`},
        );
    }
    return i18n.t(
        'status.prose--disappearing-duration-seconds',
        '{count, plural, one {# second} other {# seconds}}',
        {count: `${seconds}`},
    );
}

function getUserStateStatusMessageText(i18n: I18nType, userState: GroupUserState): string {
    switch (userState) {
        case GroupUserState.MEMBER:
            return i18n.t('status.prose--user-added', 'You were added to the group');
        case GroupUserState.LEFT:
            return i18n.t('status.prose--user-left', 'You have left the group');
        case GroupUserState.KICKED:
            return i18n.t('status.prose--user-kicked', 'You were removed from the group');
        default:
            return unreachable(userState);
    }
}
