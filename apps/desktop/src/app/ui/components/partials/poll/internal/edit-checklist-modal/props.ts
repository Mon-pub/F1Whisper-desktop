import type {PollProps} from '~/app/ui/components/partials/poll/props';

/**
 * Props accepted by the `EditChecklistModal` component (F1Whisper fork).
 */
export interface EditChecklistModalProps {
    readonly pollData: PollProps['pollData'];
    readonly receiver: PollProps['receiver'];
    readonly onclose: () => void;
}
