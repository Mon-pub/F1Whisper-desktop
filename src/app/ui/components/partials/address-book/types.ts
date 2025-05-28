import type {ContextMenuItemHandlerProps} from '~/app/ui/components/partials/receiver-nav/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {Contact, Group} from '~/common/model';

export interface GroupedReceivers {
    readonly contacts: ReceiverPreviewListProps<ContextMenuItemHandlerProps<Contact>>['items'];
    readonly groups: ReceiverPreviewListProps<ContextMenuItemHandlerProps<Group>>['items'];
    readonly workSubscriptionContacts: ReceiverPreviewListProps<
        ContextMenuItemHandlerProps<Contact>
    >['items'];
}

export type TabState = 'contacts' | 'groups' | 'workSubscriptionContacts';

export type AddressBookState = 'receiver-preview-list' | 'contact-add-form' | 'group-add-form';
