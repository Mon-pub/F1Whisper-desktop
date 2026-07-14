import type {AppServicesForSvelte} from '~/app/types';
import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture-button/props';
import type {PollAnnounceType} from '~/common/enum';
import type {PollId} from '~/common/network/types';
import type {i53, u53} from '~/common/types';

/**
 * Props accepted by the `Choice` component.
 */
export interface ChoiceProps {
    readonly announceType: PollAnnounceType;
    readonly choiceId: i53;
    readonly description: string;
    readonly disabled: boolean;
    readonly onselect: (choiceId: i53, checked: boolean) => void;
    readonly pollId: PollId;
    readonly receivers: ProfilePictureReceiverData[];
    readonly selected: boolean;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
    readonly votesCurrent: u53;
    readonly votesMax: u53;
    /**
     * Render the choice as a checklist item: the poll progress bar is hidden and the row reads as a
     * simple task entry. The checkbox + who-checked cluster are reused as-is. Defaults to `false`.
     */
    readonly checklist?: boolean;
}
