import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';

import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {Group} from '~/common/model';
import type {ReceiverDataFor, ReceiverUpdateDataFor} from '~/common/viewmodel/utils/receiver';

export interface EditGroupNameModalProps extends Pick<ModalProps, 'onclose'> {
    readonly receiver: ReceiverDataFor<Group> & {
        readonly edit: (update: ReceiverUpdateDataFor<Group>) => Promise<boolean>;
        readonly updateProfilePicture: (update: ReadonlyUint8Array | undefined) => Promise<boolean>;
    };
    readonly services: AppServicesForSvelte;
}
