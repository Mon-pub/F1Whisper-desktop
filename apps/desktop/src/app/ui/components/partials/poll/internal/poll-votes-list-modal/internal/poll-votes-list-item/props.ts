import type {u53} from '@threema/ts-utils/integer/u53';

import type {AppServicesForSvelte} from '~/app/types';
import type {ProfilePictureReceiverData} from '~/app/ui/components/partials/profile-picture-button/props';
import type {PollDisplayMode} from '~/common/enum';

/**
 * Props accepted by the `PollVotesListItem` component.
 */
export interface PollVotesListItemProps {
    readonly description: string;
    readonly displayMode: PollDisplayMode;
    readonly isWinner: boolean;
    readonly participants: readonly ProfilePictureReceiverData[];
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
    readonly totalAmountVotes: u53;
}
