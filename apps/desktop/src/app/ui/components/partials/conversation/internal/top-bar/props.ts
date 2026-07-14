import type {AppServicesForSvelte} from '~/app/types';
import type {ClearConversationModalProps} from '~/app/ui/components/partials/modals/clear-conversation-modal/props';
import type {DeleteConversationModalProps} from '~/app/ui/components/partials/modals/delete-conversation-modal/props';
import type {ReceiverCardProps} from '~/app/ui/components/partials/receiver-card/props';
import type {u53} from '~/common/types';
import type {AnyCallData} from '~/common/viewmodel/utils/call';
import type {AnyReceiverData, GroupReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly call?: AnyCallData;
    /** Details of the conversation related to this receiver. */
    readonly conversation: ClearConversationModalProps['conversation'] &
        DeleteConversationModalProps['conversation'] & {
            readonly archive: () => Promise<void>;
            readonly isArchived: boolean;
            readonly isPinned: boolean;
            readonly pin: () => Promise<void>;
            readonly totalMessagesCount: u53;
            readonly unarchive: () => Promise<void>;
            readonly unpin: () => Promise<void>;
            /**
             * Disappearing-messages timer (F1Whisper fork): the currently configured timer in
             * seconds (0 = off) and a handler that opens the picker.
             */
            readonly disappearing: {
                readonly timerSeconds: u53;
                readonly onclick: () => void;
            };
        };
    readonly onclickjoincall?: (options: {
        readonly event: MouseEvent;
        readonly intent: 'join' | 'join-or-create';
    }) => void;
    /**
     * Start a 1:1 (o2o) audio call with the current contact. Only relevant for contact
     * conversations; the button is gated on the peer supporting audio calls
     * (`ContactReceiverData.supportsO2oAudioCall`).
     */
    readonly onclicko2ocall?: (options: {readonly event: MouseEvent}) => void;
    readonly receiver:
        | Exclude<AnyReceiverData, GroupReceiverData>
        // Extend the `GroupReceiverData` with a function to delete groups.
        | (GroupReceiverData & {delete: () => Promise<boolean>});
    readonly services: ReceiverCardProps['services'] &
        Pick<AppServicesForSvelte, 'router' | 'settings'>;
}
