import type {AppServicesForSvelte} from '~/app/types';
import type {ActivityLayout} from '~/app/ui/components/partials/call-activity/helpers';
import type {
    FeedType,
    ParticipantFeedProps,
} from '~/app/ui/components/partials/call-participant-feed/props';

/**
 * Props accepted by the `VideoPanel` component.
 */
export interface VideoPanelProps {
    readonly feeds: readonly Omit<ParticipantFeedProps<FeedType>, 'activity' | 'services'>[];
    readonly activity: {
        readonly isExpanded: boolean;
        readonly layout: ActivityLayout;
    };
    /**
     * Called when the `VideoPanel`'s full view state changes.
     */
    readonly onchangefullview?: (isFullView: boolean) => void;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}
