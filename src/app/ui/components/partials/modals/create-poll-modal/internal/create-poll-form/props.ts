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
    };
    readonly pollTitle: string;
}
