import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture-button/props';
import type {ProfilePictureService} from '~/common/dom/ui/profile-picture';
import type {u53} from '~/common/types';

/**
 * Props accepted by the `PollVotesListItem` component.
 */
export interface PollVotesListItemProps {
    readonly description: string;
    readonly totalAmountVotes: u53;
    readonly participants: readonly ProfilePictureReceiverData[];
    readonly profilePictureService: ProfilePictureService;
}
