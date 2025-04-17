import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {Contact} from '~/common/model';
import type {ReceiverDataFor, ReceiverUpdateDataFor} from '~/common/viewmodel/utils/receiver';

export interface EditContactModalProps extends Pick<ModalProps, 'onclose'> {
    readonly receiver: ReceiverDataFor<Contact> & {
        readonly edit: (update: ReceiverUpdateDataFor<Contact>) => Promise<void>;
    };
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}
