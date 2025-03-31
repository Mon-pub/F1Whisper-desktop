import type {AppServicesForSvelte} from '~/app/types';
import type {TopBarProps} from '~/app/ui/components/partials/group-add-form/internal/top-bar/props';
import type {ReceiverPreviewListItem} from '~/app/ui/components/partials/receiver-preview-list/props';

export interface StepOneProps extends TopBarProps {
    readonly contacts: ReceiverPreviewListItem<unknown>[];
    readonly oncontinue: () => void;
    readonly searchTerm: string | undefined;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
}
