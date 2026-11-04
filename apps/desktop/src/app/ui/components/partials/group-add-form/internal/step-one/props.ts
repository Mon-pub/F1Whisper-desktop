import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {DbContactUid} from '~/common/db';
import type {ContactReceiverData} from '~/common/viewmodel/utils/receiver';

export interface StepOneProps {
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly onclickcancel: (event: MouseEvent) => void;
    readonly onformcancel?: (event: MouseEvent) => void;
    readonly onformcontinue: () => void;
    readonly onselectitem: (selected: boolean, lookup: ContactReceiverData) => void;
    readonly selectedContacts: ReadonlySet<DbContactUid>;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
}
