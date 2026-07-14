import type {u53} from '~/common/types';

/**
 * Props accepted by the `DisappearingMessagesModal` component.
 */
export interface DisappearingMessagesModalProps {
    /** The currently configured timer in seconds (0 / undefined = off). */
    readonly currentTimerSeconds?: u53;
    /** Invoked with the chosen timer in seconds (0 = off) when the user picks a different preset. */
    readonly onselect?: (timerSeconds: u53) => void;
    /** Invoked when the modal is closed. */
    readonly onclose?: () => void;
}
