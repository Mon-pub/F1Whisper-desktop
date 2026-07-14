/**
 * Props accepted by the `TypingIndicator` component.
 */
export interface TypingIndicatorProps {
    /**
     * Display names of the group members currently typing (F1Whisper fork). When empty (1:1 chats),
     * only the animated dots are shown; when non-empty, a "… is typing" label is shown above them.
     */
    readonly memberNames?: readonly string[];
}
