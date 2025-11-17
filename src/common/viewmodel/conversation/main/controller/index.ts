import {NACL_CONSTANTS} from '~/common/crypto';
import {randomString} from '~/common/crypto/random';
import {
    ConversationVisibility,
    GroupUserState,
    ImageRenderingType,
    MessageDirection,
    MessageType,
    PollChoicesType,
    PollMessageType,
    PollState,
    ReceiverType,
} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {Conversation} from '~/common/model';
import type {MediaBasedMessageType} from '~/common/model/types/message/common';
import type {ModelStore} from '~/common/model/utils/model-store';
import {randomMessageId, randomPollId} from '~/common/network/protocol/utils';
import type {MessageId, StatusMessageId} from '~/common/network/types';
import {wrapRawBlobKey} from '~/common/network/types/keys';
import {assert, unreachable, unwrap} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyMarked, type Remote} from '~/common/utils/endpoint';
import type {RemoteAbortListener} from '~/common/utils/signal';
import {type IQueryableStore, WritableStore} from '~/common/utils/store';
import type {IViewModelRepository, ServicesForViewModel} from '~/common/viewmodel';
import {
    getMessageType,
    transcodeAudioAndSetProperties,
    transcodeVideoAndSetProperties,
} from '~/common/viewmodel/conversation/main/controller/helpers';
import type {
    SendMessageEventDetail,
    SendFileBasedMessageInformation,
    OutboundMessageInitFragment,
    PollLookup,
} from '~/common/viewmodel/conversation/main/controller/types';
import {
    getOngoingGroupCallViewModelBundle,
    type OngoingGroupCallViewModelBundle,
} from '~/common/viewmodel/group-call/activity';

export interface IConversationViewModelController extends ProxyMarked {
    readonly currentViewportMessages: IQueryableStore<Set<MessageId | StatusMessageId>>;
    readonly archive: () => Promise<void>;
    /**
     * Clear the conversation by deleting all stored messages.
     */
    readonly clear: () => void;
    readonly delete: () => void;
    readonly removeMessage: (messageId: MessageId) => void;
    readonly markMessageAsDeleted: (messageId: MessageId) => Promise<void>;
    readonly removeStatusMessage: (statusMessageId: StatusMessageId) => void;
    readonly markAllMessagesAsRead: () => Promise<void>;
    readonly pin: () => Promise<void>;
    readonly sendMessage: (messageEventDetail: Remote<SendMessageEventDetail>) => Promise<void>;
    /**
     * Closes a poll and creates a new closed-poll-setup message.
     */
    readonly sendPollCloseMessage: (pollLookup: PollLookup) => Promise<void>;
    readonly sendIsTyping: (value: boolean) => Promise<void>;
    /**
     * Set the currently visible messages in conversation viewport.
     *
     * Used to calculate the fetched (and prefetched) messages from the model store / database.
     *
     * Note: Make sure to pass in a new `Set` each time, otherwise store changes won't be
     *       propagated!
     */
    readonly setCurrentViewportMessages: (messageIds: Set<MessageId | StatusMessageId>) => void;
    readonly unarchive: () => Promise<void>;
    readonly unpin: () => Promise<void>;

    /**
     * Group-specific controller.
     *
     * TODO(DESK-1469): Workaround because we're unable to narrow down conversation view model type
     * based on `ReceiverType` because of a limitation of `Remote` that erases the possibility to
     * narrow. We may want to resolve this properly at some point.
     */
    readonly group: {
        /** See `GroupController.joinCall<'join'>` */
        readonly joinCall: (
            cancel: RemoteAbortListener<unknown>,
        ) => Promise<OngoingGroupCallViewModelBundle | undefined>;

        /** See `GroupController.joinCall<'join-or-create'>` */
        readonly joinOrCreateCall: (
            cancel: RemoteAbortListener<unknown>,
        ) => Promise<OngoingGroupCallViewModelBundle>;

        /**
         * Delete a left group.
         *
         * Return true if the group was succesfully deleted.
         *
         * @throws if the current conversation is not a left group.
         */
        readonly deleteGroup: () => Promise<boolean>;
    };
}

export class ConversationViewModelController implements IConversationViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public group = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        joinCall: async (
            cancel: RemoteAbortListener<unknown>,
        ): Promise<OngoingGroupCallViewModelBundle | undefined> =>
            await this._joinCall('join', cancel),
        joinOrCreateCall: async (
            cancel: RemoteAbortListener<unknown>,
        ): Promise<OngoingGroupCallViewModelBundle> =>
            await this._joinCall('join-or-create', cancel),

        /** @inheritdoc */
        deleteGroup: async (): Promise<boolean> => {
            const receiver = this._conversation.get().controller.receiver().get();

            assert(
                receiver.type === ReceiverType.GROUP &&
                    receiver.view.userState !== GroupUserState.MEMBER,
                'Receiver must be group and left to delete it completely',
            );
            return await this._services.model.groups.remove.fromLocal(receiver.ctx);
        },
    };

    private readonly _log: Logger;
    private readonly _currentViewportMessagesStore = new WritableStore<
        Set<MessageId | StatusMessageId>
    >(new Set());

    public constructor(
        private readonly _services: ServicesForViewModel,
        private readonly _conversation: ModelStore<Conversation>,
        private readonly _viewModelRepository: IViewModelRepository,
    ) {
        this._log = _services.logging.logger('viewmodel.conversation.main.controller');
    }

    public get currentViewportMessages(): IQueryableStore<Set<MessageId | StatusMessageId>> {
        return this._currentViewportMessagesStore;
    }

    public async archive(): Promise<void> {
        return await this._conversation
            .get()
            .controller.updateVisibility.fromLocal(ConversationVisibility.ARCHIVED);
    }

    public clear(): void {
        this._conversation.get().controller.removeAllStatusMessages.direct();
        this._conversation.get().controller.removeAllMessages.direct();
    }

    /** @inheritdoc */
    public delete(): void {
        // Clear all conversation contents.
        this.clear();

        // Soft-delete the conversation (i.e., the conversation is kept in the database but is not
        // shown in the conversation list anymore).
        this._conversation.get().controller.update.direct({lastUpdate: undefined});
    }

    public removeMessage(messageId: MessageId): void {
        return this._conversation.get().controller.removeMessage.direct(messageId);
    }

    public removeStatusMessage(statusMessageId: StatusMessageId): void {
        this._conversation.get().controller.removeStatusMessage.direct(statusMessageId);
    }

    public async markMessageAsDeleted(messageId: MessageId): Promise<void> {
        return await this._conversation
            .get()
            .controller.markMessageAsDeleted.fromLocal(messageId, new Date());
    }

    public async markAllMessagesAsRead(): Promise<void> {
        return await this._conversation.get().controller.read.fromLocal(new Date());
    }

    public async pin(): Promise<void> {
        return await this._conversation
            .get()
            .controller.updateVisibility.fromLocal(ConversationVisibility.PINNED);
    }

    public async sendIsTyping(value: boolean): Promise<void> {
        return await this._conversation.get().controller.updateTyping.fromLocal(value);
    }

    public async sendMessage(messageEventDetail: Remote<SendMessageEventDetail>): Promise<void> {
        const {crypto} = this._services;

        let outgoingMessageInitFragments: OutboundMessageInitFragment[] = [];
        switch (messageEventDetail.type) {
            case 'text':
                outgoingMessageInitFragments = [
                    {
                        type: 'text',
                        text: messageEventDetail.text,
                        quotedMessageId: messageEventDetail.quotedMessageId,
                    },
                ];
                break;
            case 'files':
                outgoingMessageInitFragments = await this._prepareFileBasedMessageInitFragments(
                    messageEventDetail.files,
                    this._log,
                );
                break;
            case 'poll':
                outgoingMessageInitFragments = [
                    {
                        type: 'poll',
                        announceType: messageEventDetail.announceType,
                        answerType: messageEventDetail.answerType,
                        description: messageEventDetail.description,
                        displayMode: messageEventDetail.displayMode,
                        pollCreatorIdentity: this._services.device.identity.string,
                        pollId: randomPollId(this._services.crypto),
                        pollState: messageEventDetail.pollState,
                        choicesType: PollChoicesType.TEXT,
                        choices: messageEventDetail.choices.map((choice) => ({
                            description: choice.description,
                            choiceId: choice.choiceId,
                            sortKey: choice.choiceId,
                            participantVotes: [],
                        })),
                        participants: [],
                    },
                ];
                break;
            default:
                unreachable(messageEventDetail);
        }

        for (const init of outgoingMessageInitFragments) {
            const id = randomMessageId(crypto);
            this._log.debug(`Send ${init.type} message with id ${id}`);

            await this._conversation.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                id,
                createdAt: new Date(),
                ...init,
            });
        }
    }

    /** @inheritdoc */
    public async sendPollCloseMessage(pollLookup: PollLookup): Promise<void> {
        if (pollLookup.pollCreatorIdentity !== this._services.device.identity.string) {
            this._log.error('Cannot close a poll where the user is not the creator');
            return;
        }

        const poll = this._conversation
            .get()
            .controller.getMessageByPollId(
                pollLookup.pollCreatorIdentity,
                pollLookup.pollId,
                PollMessageType.POLL_CREATED,
            );
        assert(
            poll !== undefined && poll.ctx === MessageDirection.OUTBOUND,
            'Poll to be closed must exist within the given conversation',
        );

        // If the poll is already closed, do nothing.
        if (poll.get().view.pollState === PollState.CLOSED) {
            this._log.debug(
                'Trying to close a poll that was already closed. Returning without adding a new message',
            );
            return;
        }
        // Close the current poll.
        poll.get().controller.close.direct();

        const {view: pollView} = poll.get();

        const {participants, votes} = poll.get().controller.getParticipantsAndVotes();

        await this._conversation.get().controller.addMessage.fromLocal({
            direction: MessageDirection.OUTBOUND,
            pollState: PollState.CLOSED,
            id: randomMessageId(this._services.crypto),
            announceType: pollView.announceType,
            answerType: pollView.answerType,
            createdAt: new Date(),
            description: pollView.description,
            displayMode: pollView.displayMode,
            pollCreatorIdentity: this._services.device.identity.string,
            pollId: pollLookup.pollId,
            participants,
            choicesType: pollView.choicesType,
            choices: pollView.choices.map((choice, index) => ({
                choiceId: choice.choiceId,
                description: choice.description,
                // Unwrap is fine since `getParticipantsAndVotes` guarantees that this exists.
                participantVotes: unwrap(votes[index]),
                sortKey: choice.sortKey,
                totalAmountVotes: choice.totalAmountVotes,
            })),
            type: 'poll',
        });
    }

    /** @inheritdoc */
    public setCurrentViewportMessages(messageIds: Set<MessageId | StatusMessageId>): void {
        this._currentViewportMessagesStore.set(messageIds);
    }

    public async unarchive(): Promise<void> {
        return await this._conversation
            .get()
            .controller.updateVisibility.fromLocal(ConversationVisibility.SHOW);
    }

    public async unpin(): Promise<void> {
        return await this._conversation
            .get()
            .controller.updateVisibility.fromLocal(ConversationVisibility.SHOW);
    }

    private async _joinCall<TIntent = 'join' | 'join-or-create'>(
        intent: TIntent,
        cancel: RemoteAbortListener<unknown>,
    ): Promise<
        TIntent extends 'join'
            ? OngoingGroupCallViewModelBundle | undefined
            : OngoingGroupCallViewModelBundle
    > {
        const receiver = this._conversation.get().controller.receiver();
        assert(receiver.type === ReceiverType.GROUP);
        const ongoing = await receiver.get().controller.joinCall(intent, cancel);
        if (ongoing === undefined) {
            return undefined as TIntent extends 'join'
                ? OngoingGroupCallViewModelBundle | undefined
                : OngoingGroupCallViewModelBundle;
        }
        return getOngoingGroupCallViewModelBundle(this._services, ongoing);
    }

    /**
     * Generate outgoing message init fragments based on the files. These files may be sent as raw
     * files or as media files, depending on the media type.
     */
    private async _prepareFileBasedMessageInitFragments(
        files: SendFileBasedMessageInformation['files'],
        log?: Logger,
    ): Promise<OutboundMessageInitFragment[]> {
        const {crypto, file} = this._services;

        const outgoingMessageInitFragments: OutboundMessageInitFragment[] = [];

        // If more than 1 file is being sent, set a correlation ID
        const correlationId = files.length > 1 ? randomString(crypto, 32) : undefined;

        for (const fileInfo of files) {
            // Generate random blob encryption key for the blobs (which will be encrypted and
            // uploaded by the outgoing conversation message task)
            const encryptionKey = wrapRawBlobKey(
                crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );

            const commonFileProperties = {
                caption: fileInfo.caption?.length === 0 ? undefined : fileInfo.caption,
                correlationId,
                encryptionKey,
            };

            const thumbnailFileData =
                fileInfo.thumbnailBytes !== undefined
                    ? await file.store(fileInfo.thumbnailBytes)
                    : undefined;

            // Determine message type based on media type
            let messageType: MediaBasedMessageType = getMessageType(fileInfo);

            for (;;) {
                switch (messageType) {
                    case MessageType.FILE:
                        outgoingMessageInitFragments.push({
                            type: 'file',
                            ...commonFileProperties,
                            fileName: fileInfo.fileName,
                            fileSize: fileInfo.fileSize,
                            mediaType: fileInfo.mediaType,
                            fileData: await file.store(fileInfo.bytes),
                        });
                        break;
                    case MessageType.VIDEO: {
                        const transcodingResult = await transcodeVideoAndSetProperties(
                            fileInfo.bytes,
                            this._services.model.user.mediaSettings.get().view.videoQuality,
                            log,
                        );

                        if (transcodingResult === undefined) {
                            log?.debug('Could not transcode video, sending the message as file');
                            messageType = MessageType.FILE;
                            continue;
                        }

                        const {bytes, ...rest} = transcodingResult;
                        outgoingMessageInitFragments.push({
                            ...commonFileProperties,
                            ...rest,
                            fileData: await file.store(bytes),
                            dimensions: fileInfo.dimensions,
                            thumbnailMediaType: fileInfo.thumbnailMediaType,
                            thumbnailFileData,
                        });
                        break;
                    }
                    case MessageType.AUDIO: {
                        const transcodingResult = await transcodeAudioAndSetProperties(
                            fileInfo.bytes,
                            log,
                        );

                        if (transcodingResult === undefined) {
                            log?.debug('Could not transcode audio, sending the message as file');
                            messageType = MessageType.FILE;
                            continue;
                        }

                        const {bytes, ...rest} = transcodingResult;
                        outgoingMessageInitFragments.push({
                            ...commonFileProperties,
                            ...rest,
                            fileData: await file.store(bytes),
                        });
                        break;
                    }
                    case MessageType.IMAGE:
                        outgoingMessageInitFragments.push({
                            type: 'image',
                            ...commonFileProperties,
                            fileName: fileInfo.fileName,
                            fileSize: fileInfo.fileSize,
                            mediaType: fileInfo.mediaType,
                            fileData: await file.store(fileInfo.bytes),
                            renderingType: ImageRenderingType.REGULAR,
                            animated: false, // TODO(DESK-1115)
                            dimensions: fileInfo.dimensions,
                            thumbnailMediaType: fileInfo.thumbnailMediaType,
                            thumbnailFileData,
                        });
                        break;
                    default:
                        unreachable(messageType);
                }
                break;
            }
        }

        return outgoingMessageInitFragments;
    }
}
