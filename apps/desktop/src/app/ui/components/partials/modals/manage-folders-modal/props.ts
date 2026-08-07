import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {DbReceiverLookup} from '~/common/db';

/**
 * Props accepted by the `ManageFoldersModal` component (F1Whisper fork). Desktop-local chat
 * folders: create/rename/delete folders and assign conversations to them.
 */
export interface ManageFoldersModalProps extends Pick<ModalProps, 'onclose'> {
    /** All conversations available to assign to a folder. */
    readonly conversations: readonly {
        readonly lookup: DbReceiverLookup;
        readonly name: string;
    }[];
    readonly services: Pick<AppServicesForSvelte, 'storage'>;
}
