import {type MessageDirection, PollMessageType, PollState, type MessageType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Conversation, DirectedMessageFor} from '~/common/model';
import type {
    AnyNonDeletedMessageModelStore,
    AnyPollMessageModelStore,
} from '~/common/model/types/message';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    PassiveTaskCodecHandle,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {messageStoreHasThumbnail} from '~/common/network/protocol/task/common/file';
import {unreachable} from '~/common/utils/assert';

export abstract class BaseConversationMessageTask<
    TTaskCodecHandleType extends PassiveTaskCodecHandle | ActiveTaskCodecHandle<'volatile'>,
> implements ComposableTask<TTaskCodecHandleType, void>
{
    public constructor(
        protected readonly _services: ServicesForTasks,
        protected readonly _conversation: ModelStore<Conversation>,
        protected readonly _directedMessageInit: DirectedMessageFor<
            MessageDirection,
            Exclude<MessageType, 'deleted'>,
            'init'
        >,
        protected readonly _log: Logger,
    ) {}

    public async run(handle: TTaskCodecHandleType): Promise<void> {
        switch (this._directedMessageInit.type) {
            case 'text':
            case 'file':
            case 'image':
            case 'video':
            case 'audio':
                break;
            case 'poll': {
                // 2. Look up the poll with the given ID within the conversation.
                const poll = this._conversation
                    .get()
                    .controller.getMessageByPollId(
                        this._directedMessageInit.pollCreatorIdentity,
                        this._directedMessageInit.pollId,
                        PollMessageType.POLL_CREATED,
                    );

                // 3. If no associated poll could be found:
                if (poll === undefined) {
                    // 3.1 If state is 1 (closed), discard the message and abort these steps.
                    if (this._directedMessageInit.pollState === PollState.CLOSED) {
                        this._log.error('New polls should not have PollState set to CLOSED. Abort');
                        return;
                    }
                    break;
                }

                // 4. If the associated poll is closed, discard the message and abort these steps.
                if (poll.get().view.pollState === PollState.CLOSED) {
                    return;
                }
                // 5. If state is 0 (open), discard the message and abort these steps.
                if (this._directedMessageInit.pollState === PollState.OPEN) {
                    return;
                }

                // 6. Close the poll with the given participants, ignore any other fields of the
                //    message.
                await this._closePoll(handle, poll);
                break;
            }
            default:
                unreachable(this._directedMessageInit);
        }

        const messageStore = await this._addMessage(handle);

        // If this message type has a thumbnail, automatically trigger its download
        if (messageStoreHasThumbnail(messageStore)) {
            messageStore
                .get()
                .controller.thumbnailBlob()
                .catch((error: unknown) =>
                    this._log.error(
                        `Downloading the thumbnail of an incoming message failed: ${error}`,
                    ),
                );
        }

        // If the settings are configured for autodownload, directly download the associated blob
        if (messageStore.type !== 'text' && messageStore.type !== 'poll') {
            const autoDownload = this._services.model.user.mediaSettings.get().view.autoDownload;
            if (
                autoDownload.on &&
                (autoDownload.limitInMb === 0 ||
                    messageStore.get().view.fileSize / 1e6 < autoDownload.limitInMb)
            ) {
                messageStore
                    .get()
                    .controller.blob()
                    .catch((error: unknown) => {
                        this._log.error(
                            `Downloading the blob of a reflected outgoing message failed: ${error}`,
                        );
                    });
            }
        }
    }

    protected abstract _closePoll(
        handle: TTaskCodecHandleType,
        poll: AnyPollMessageModelStore,
    ): Promise<void>;

    protected abstract _addMessage(
        handle: TTaskCodecHandleType,
    ): Promise<AnyNonDeletedMessageModelStore>;
}
