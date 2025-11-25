import type {ActivityLayout} from '~/app/ui/components/partials/call-activity/helpers';
import type {u53} from '~/common/types';

/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly containerLayout: ActivityLayout;
    /**
     * Whether the panel that contains this `TopBar` is expanded or collapsed. Used to display the
     * appropriate action button and icon.
     */
    readonly isExpanded: boolean;
    /**
     * Whether the panel is currently displaying a feed in full view.
     */
    readonly isFullView: boolean;
    readonly onclickgridview?: (event: MouseEvent) => void;
    readonly onclicktoggleexpand?: (event: MouseEvent) => void;
    readonly state:
        | {
              readonly type: 'connecting';
          }
        | {
              readonly type: 'connected';
              /** When the group call was started. */
              readonly startedAt: Date;
              /** Number of participants in the call. */
              readonly nParticipants: u53;
          };
}
