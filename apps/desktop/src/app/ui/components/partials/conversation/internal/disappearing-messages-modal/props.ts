import type {u53} from '~/common/types';

/**
 * Props accepted by the `DisappearingMessagesModal` component.
 */
export interface DisappearingMessagesModalProps {
    /** The currently configured timer in seconds (0 / undefined = off). */
    readonly currentTimerSeconds?: u53;
    /**
     * Whether the timer is read-only (F1Whisper fork). Set for a LINKED follower desktop: the phone
     * owns the disappearing-messages timer and does not reflect its control to the device group, so
     * the follower can only view the current value, not change it. Standalone/leader mode leaves this
     * `false` and the picker stays fully interactive.
     */
    readonly locked?: boolean;
    /** Invoked with the chosen timer in seconds (0 = off) when the user picks a different preset. */
    readonly onselect?: (timerSeconds: u53) => void;
    /** Invoked when the modal is closed. */
    readonly onclose?: () => void;
}
