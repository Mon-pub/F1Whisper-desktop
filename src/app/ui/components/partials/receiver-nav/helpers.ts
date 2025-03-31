import type {GroupedReceivers} from '~/app/ui/components/partials/address-book/types';
import type {ContextMenuItemHandlerProps} from '~/app/ui/components/partials/receiver-nav/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import {InactiveContactsPolicy} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {AnyReceiver} from '~/common/model';
import type {AppearanceSettingsView} from '~/common/model/types/settings';
import type {u53} from '~/common/types';
import {assert} from '~/common/utils/assert';

/**
 * Takes a list of receivers and groups them into categories that the {@link AddressBook} can
 * display.
 *
 * Filters out inactive contacts according to the setting and removes contacts with
 * {@link AcquaintanceLevel.GROUP_OR_DELETED}.
 */
export function receiverListToGroupedAddressBookItems(
    receiverPreviewList:
        | ReceiverPreviewListProps<ContextMenuItemHandlerProps<AnyReceiver>>['items']
        | undefined,
    appearanceSettings: AppearanceSettingsView,
    log: Logger,
): GroupedReceivers {
    const contacts: GroupedReceivers['contacts'] = [];
    const groups: GroupedReceivers['groups'] = [];
    const workSubscriptionContacts: GroupedReceivers['workSubscriptionContacts'] = [];
    if (receiverPreviewList === undefined) {
        return {contacts, groups, workSubscriptionContacts};
    }
    for (const item of receiverPreviewList) {
        if (item.receiver.type === 'self') {
            log.warn('Self should not be in the receiver preview list');
            continue;
        }
        assert(
            item.receiver.type !== 'distribution-list',
            'DESK-236: Distribution lists not yet supported',
        );
        if (item.receiver.type === 'group') {
            groups.push({...item} as GroupedReceivers['groups'][u53]);
            continue;
        }

        // We apply basic filters that generally hold here.

        // Only retain contacts that were added manually by the user.
        if (item.receiver.acquaintanceLevel !== 'direct') {
            continue;
        }

        // Filter inactive contacts according to the respective policy.
        if (
            appearanceSettings.inactiveContactsPolicy === InactiveContactsPolicy.HIDE &&
            (item.receiver.isInactive || item.receiver.isInvalid)
        ) {
            continue;
        }
        if (item.receiver.verification.type === 'shared-work-subscription') {
            // Cast is fine here since we check the verification type just above.
            workSubscriptionContacts.push({
                ...item,
            } as GroupedReceivers['workSubscriptionContacts'][u53]);
        }

        contacts.push({...item} as GroupedReceivers['contacts'][u53]);
    }
    return {contacts, groups, workSubscriptionContacts};
}
