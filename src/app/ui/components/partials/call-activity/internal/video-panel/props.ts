import type {AppServicesForSvelte} from '~/app/types';
import type {ActivityLayout} from '~/app/ui/components/partials/call-activity/helpers';
import type {
    FeedType,
    ParticipantFeedProps,
} from '~/app/ui/components/partials/call-participant-feed/props';
import type {u53} from '~/common/types';

/**
 * Props accepted by the `VideoPanel` component.
 */
export interface VideoPanelProps {
    readonly feeds: readonly Omit<ParticipantFeedProps<FeedType>, 'activity' | 'services'>[];
    readonly activity: {
        readonly layout: ActivityLayout;
    };
    /**
     * Optional index of the feed which should be displayed in full view initially. If not provided,
     * the `VideoPanel` component will start in grid view.
     */
    readonly initialFullViewFeedIndex?: u53;
    /**
     * Called when the `VideoPanel`'s full view state changes.
     */
    readonly onchangefullview?: (isFullView: boolean) => void;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}
