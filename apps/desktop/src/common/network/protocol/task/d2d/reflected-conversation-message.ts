import {MessageDirection, MessageType} from '~/common/enum';
import type {Conversation, DirectedMessageFor} from '~/common/model';
import type {
    AnyNonDeletedMessageModelStore,
    AnyPollMessageModelStore,
} from '~/common/model/types/message';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {
    InternalActiveTaskCodecHandle,
    PassiveTaskCodecHandle,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {BaseConversationMessageTask} from '~/common/network/protocol/task/common/conversation-message';
import {assert, unreachable} from '~/common/utils/assert';
import {u64ToHexLe} from '~/common/utils/number';

export class ReflectedConversationMessageTask extends BaseConversationMessageTask<PassiveTaskCodecHandle> {
    public constructor(
        services: ServicesForTasks,
        conversation: ModelStore<Conversation>,
        directedMessageInit: DirectedMessageFor<
            MessageDirection,
            Exclude<MessageType, 'deleted'>,
            'init'
        >,
    ) {
        const messageIdHex = u64ToHexLe(directedMessageInit.id);

        const log = services.logging.logger(
            `network.protocol.task.reflected-conversation-message.${messageIdHex}`,
        );

        super(services, conversation, directedMessageInit, log);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    protected async _closePoll(
        handle: PassiveTaskCodecHandle,
        poll: AnyPollMessageModelStore,
    ): Promise<void> {
        assert(
            this._directedMessageInit.type === MessageType.POLL,
            'Message must be a poll to close it',
        );
        switch (poll.ctx) {
            case MessageDirection.INBOUND:
                assert(
                    this._directedMessageInit.direction === MessageDirection.INBOUND,
                    'Original poll and fragment direction must match',
                );
                return poll.get().controller.close.fromSync(handle, this._directedMessageInit);
            case MessageDirection.OUTBOUND:
                assert(
                    this._directedMessageInit.direction === MessageDirection.OUTBOUND,
                    'Original poll and fragment direction must match',
                );
                return poll.get().controller.close.fromSync(handle, this._directedMessageInit);
            default:
                return unreachable(poll);
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    protected async _mergeChecklist(
        handle: PassiveTaskCodecHandle,
        poll: AnyPollMessageModelStore,
    ): Promise<void> {
        assert(
            this._directedMessageInit.type === MessageType.POLL,
            'Message must be a poll to merge a checklist edit',
        );
        const fragment = {
            description: this._directedMessageInit.description,
            choices: this._directedMessageInit.choices.map((choice) => ({
                choiceId: choice.choiceId,
                description: choice.description,
            })),
        };
        switch (poll.ctx) {
            case MessageDirection.INBOUND:
                return poll.get().controller.mergeChecklist.fromSync(handle, fragment);
            case MessageDirection.OUTBOUND:
                return poll.get().controller.mergeChecklist.fromSync(handle, fragment);
            default:
                return unreachable(poll);
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    protected override async _addMessage(
        handle: InternalActiveTaskCodecHandle,
    ): Promise<AnyNonDeletedMessageModelStore> {
        return this._conversation
            .get()
            .controller.addMessage.fromSync(handle, this._directedMessageInit);
    }
}
