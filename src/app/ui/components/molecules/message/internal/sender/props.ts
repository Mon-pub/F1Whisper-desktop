import type {ProfilePictureColor} from '~/app/ui/svelte-components/threema/ProfilePicture';

/**
 * Props accepted by the `Sender` component.
 */
export interface SenderProps {
    /**
     * Deterministic color of this sender used to color the name.
     *
     * Can be set to 'none' in case no special color should be displayed, e.g in edit mode.
     */
    readonly color: ProfilePictureColor | 'none';
    /** Whether the associated message has a thumbnail. Used to determine wrapping behavior. */
    readonly messageHasThumbnail: boolean;
    /** Full name of the sender. */
    readonly name: string;
}
