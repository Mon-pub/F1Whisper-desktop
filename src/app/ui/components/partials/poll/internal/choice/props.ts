import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture-button/props';
import type {ProfilePictureService} from '~/common/dom/ui/profile-picture';
import type {PollAnnounceType} from '~/common/enum';
import type {PollId} from '~/common/network/types';
import type {i53, u53} from '~/common/types';

/**
 * Props accepted by the `Choice` component.
 */
export interface ChoiceProps {
    readonly pollId: PollId;
    readonly choiceId: i53;
    readonly description: string;
    readonly selected: boolean;
    readonly disabled: boolean;
    readonly votesCurrent: u53;
    readonly votesMax: u53;
    readonly receivers: ProfilePictureReceiverData[];
    readonly profilePictureService: ProfilePictureService;
    readonly announceType: PollAnnounceType;
    readonly onselect: (choiceId: i53, checked: boolean) => void;
}
