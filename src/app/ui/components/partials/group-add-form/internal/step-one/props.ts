import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';

export interface StepOneProps {
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly onclickcancel?: (event: MouseEvent) => void;
    readonly oncontinue: () => void;
    readonly searchTerm: string | undefined;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
}
