import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {CreatePollFormProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/create-poll-form/props';

export interface CreatePollModalProps
    extends Pick<CreatePollFormProps, 'onsend'>,
        Pick<ModalProps, 'onclose'> {
    readonly services: Pick<AppServicesForSvelte, 'backend'>;
}
