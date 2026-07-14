import type {u53} from '~/common/types';
import type {SendPollBasedMessageInformation} from '~/common/viewmodel/conversation/main/controller/types';

export interface CreatePollFormProps {
    readonly choices: {
        readonly description: string;
        readonly id: u53;
    }[];
    /**
     * Bindable property which is set to `true` if the data entered by the user is valid, or `false`
     * otherwise.
     */
    readonly isFormValid?: boolean;
    readonly onclickcopypoll: () => void;
    readonly onsend: (poll: SendPollBasedMessageInformation) => void;
    readonly options: {
        readonly allowMultipleAnswers: boolean;
        readonly showIntermediateResults: boolean;
        /**
         * Create a checklist instead of a poll (rendered as tappable, sinking checklist items).
         * Defaults to `false`.
         */
        readonly asChecklist?: boolean;
    };
    readonly pollTitle: string;
}
