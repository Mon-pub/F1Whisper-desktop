import type {DatabaseBackend, DbConversationUid} from '~/common/db';
import {
    CspE2eConversationType,
    CspE2eGroupConversationType,
    GroupUserState,
    MessageDirection,
    MessageType,
    ReceiverType,
    ReceiverTypeUtils,
} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {
    AnyOutboundNonDeletedMessageModelStore,
    AnyReceiver,
    Contact,
    Group,
} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
import type {UploadedBlobBytes} from '~/common/model/message/common';
import type {CspE2eType, LayerEncoder} from '~/common/network/protocol';
import {clampF1DisappearingTimer} from '~/common/network/protocol/disappearing-message-metadata';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {serializeQuoteText} from '~/common/network/protocol/task/common/quotes';
import {getFileJsonData, getPollJsonData} from '~/common/network/protocol/task/csp/common';
import {OutgoingCspMessagesTask} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import type {ValidCspMessageTypeForReceiver} from '~/common/network/protocol/task/csp/types';
import * as structbuf from '~/common/network/structbuf';
import type {
    FileEncodable,
    GroupMemberContainerEncodable,
    PollSetupEncodable,
    TextEncodable,
} from '~/common/network/structbuf/csp/e2e';
import type {MessageId} from '~/common/network/types';
import {ensureError, unreachable} from '~/common/utils/assert';
import {UTF8} from '~/common/utils/codec';
import {u64ToHexLe} from '~/common/utils/number';

interface CurrentOutgoingMessage {
    readonly message: AnyOutboundNonDeletedMessageModelStore;
    readonly receiver: AnyReceiver;
}

type ServicesForOutgoingConversationMessage = ServicesForTasks & {
    readonly db: Pick<
        DatabaseBackend,
        'deleteOutgoingMessageOutboxEntry' | 'hasOutgoingMessageOutboxEntry'
    >;
};

/**
 * The outgoing message task has the following responsibilities:
 *
 * - Upload blobs (if any)
 * - Call the OutgoingCspMessageTask which handles sending, reflection and acks
 *
 * This task is only meant to be used for conversation messages (with an associated message model),
 * not for control messages.
 */
export class OutgoingConversationMessageTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;

    private readonly _log: Logger;

    /**
     * Queue by durable identity, never by a captured model object. The current conversation, message
     * and receiver are re-resolved after deferred prerequisites and at each network boundary.
     */
    public constructor(
        private readonly _services: ServicesForOutgoingConversationMessage,
        private readonly _conversationUid: DbConversationUid,
        private readonly _messageId: MessageId,
    ) {
        // Instantiate logger
        const messageIdHex = u64ToHexLe(_messageId);
        this._log = _services.logging.logger(`network.protocol.task.out-message.${messageIdHex}`);
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        let current = this._resolveCurrentMessage();
        if (current === undefined || !this._sendPrecondition()) {
            return;
        }
        let {message, receiver} = current;
        const messageType = message.type;
        this._log.info(
            `Run for ${ReceiverTypeUtils.nameOf(
                receiver.type,
            )?.toLowerCase()} ${messageType} message`,
        );

        // Upload file message data
        let uploadedBlobBytes: UploadedBlobBytes | undefined;
        switch (messageType) {
            case 'file':
            case 'image':
            case 'video':
            case 'audio':
                uploadedBlobBytes = await message.get().controller.uploadBlobs();
                break;
            case 'poll':
            case 'text':
                // Nothing to upload
                break;
            default:
                unreachable(messageType);
        }

        // Now that blobs are uploaded for the recipient (using low resolution/quality to optimize
        // network traffic and server load), we can re-generate the image thumbnail in a slightly
        // higher resolution, as an optimization for the local user.
        // Blob upload can defer for an arbitrary duration. Re-resolve by identity before touching the
        // model again; deletion replaces/deactivates the captured store while upload is pending.
        current = this._resolveCurrentMessage();
        if (current === undefined || !this._sendPrecondition()) {
            return;
        }
        ({message, receiver} = current);
        if (message.type === 'image' && uploadedBlobBytes?.main !== undefined) {
            message
                .get()
                .controller.regenerateThumbnail(uploadedBlobBytes.main)
                .catch((error: unknown) =>
                    this._log.warn(`Failed to regenerate thumbnail: ${ensureError(error)}`),
                );
        }

        // Initialize outgoing CSP message task
        const cspMessageFlags = CspMessageFlags.forMessageType(message.type);
        cspMessageFlags.groupMessage = receiver.type === ReceiverType.GROUP;
        const {id: messageId, createdAt, disappearingTimerSeconds} = message.get().view;
        const sharedMessageProperties = {
            messageId,
            createdAt,
            disappearingTimerSeconds: clampF1DisappearingTimer(disappearingTimerSeconds ?? 0),
            allowUserProfileDistribution: true,
        } as const;

        let outCspMessageTask: OutgoingCspMessagesTask;
        switch (receiver.type) {
            case ReceiverType.CONTACT:
                outCspMessageTask = new OutgoingCspMessagesTask(this._services, [
                    {
                        receiver: {main: receiver},
                        precondition: this._sendPrecondition,
                        sharedMessageProperties,
                        specifics: {
                            default: {
                                encoder: this._getCspEncoder(message, receiver),
                                messageProperties: {
                                    cspMessageFlags,
                                    type: this._getCspE2eType(
                                        message.type,
                                        receiver.type,
                                    ) as ValidCspMessageTypeForReceiver<Contact>,
                                },
                            },
                        },
                    },
                ]);
                break;
            case ReceiverType.GROUP:
                outCspMessageTask = new OutgoingCspMessagesTask(this._services, [
                    {
                        receiver: {main: receiver},
                        precondition: this._sendPrecondition,
                        sharedMessageProperties,
                        specifics: {
                            default:
                                // This cast is fine since the function will is bound to return a
                                // `GroupMemberEncodable` encoder due to the switch here.
                                {
                                    encoder: this._getCspEncoder(
                                        message,
                                        receiver,
                                    ) as LayerEncoder<GroupMemberContainerEncodable>,
                                    messageProperties: {
                                        cspMessageFlags,
                                        type: this._getCspE2eType(
                                            message.type,
                                            receiver.type,
                                        ) as ValidCspMessageTypeForReceiver<Group>,
                                    },
                                },
                        },
                    },
                ]);
                break;
            case ReceiverType.DISTRIBUTION_LIST:
                throw new Error('DESK-237: Distribution lists not implemented');
            default:
                unreachable(receiver);
        }

        // Run task
        await outCspMessageTask.run(handle);

        // Done
        if (this._services.db.hasOutgoingMessageOutboxEntry(this._messageId)) {
            this._log.info(
                `Sent ${ReceiverTypeUtils.nameOf(receiver.type)?.toLowerCase()} ${messageType} message`,
            );
        }
    }

    /**
     * Return the layer encoder for the message to be sent (without container).
     */
    private _getCspEncoder(
        messageModelStore: AnyOutboundNonDeletedMessageModelStore,
        receiver: AnyReceiver,
    ): LayerEncoder<
        TextEncodable | FileEncodable | PollSetupEncodable | GroupMemberContainerEncodable
    > {
        let encoder;
        const messageModel = messageModelStore.get();
        switch (messageModel.type) {
            case 'text': {
                // Get message text (or quote V2 text)
                const {quotedMessageId, text: viewText} = messageModel.view;
                let textString;
                if (quotedMessageId === undefined) {
                    textString = viewText;
                } else {
                    textString = serializeQuoteText(quotedMessageId, viewText);
                }

                // Encode message
                encoder = structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                    text: UTF8.encode(textString),
                });
                break;
            }
            case 'file':
            case 'image':
            case 'video':
            case 'audio': {
                const fileJson = getFileJsonData(messageModel);
                encoder = structbuf.bridge.encoder(structbuf.csp.e2e.File, {
                    file: UTF8.encode(JSON.stringify(fileJson)),
                });
                break;
            }
            case 'poll': {
                const {participants, votes} = messageModel.controller.getParticipantsAndVotes();
                const pollJson = getPollJsonData(messageModel.view, participants, votes);
                encoder = structbuf.bridge.encoder(structbuf.csp.e2e.PollSetup, {
                    id: messageModel.view.pollId,
                    poll: UTF8.encode(JSON.stringify(pollJson)),
                });
                break;
            }
            default:
                return unreachable(messageModel);
        }

        if (receiver.type === ReceiverType.GROUP) {
            return structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                groupId: receiver.view.groupId,
                creatorIdentity: UTF8.encode(
                    getIdentityString(this._services.device, receiver.view.creator),
                ),
                innerData: encoder,
            });
        }
        return encoder;
    }

    /**
     * Determine the CSP E2E Type for the conversation message based on the receiver.
     * It guarantees that {@link ValidCspMessageTypeForReceiver} holds true for the returned value.
     *
     * @returns a valid conversation message type.
     */
    private _getCspE2eType(
        messageType: AnyOutboundNonDeletedMessageModelStore['type'],
        receiverType: AnyReceiver['type'],
    ): CspE2eType {
        if (receiverType === ReceiverType.GROUP) {
            switch (messageType) {
                case 'text':
                    return CspE2eGroupConversationType.GROUP_TEXT;
                case 'file':
                case 'image':
                case 'video':
                case 'audio':
                    return CspE2eGroupConversationType.GROUP_FILE;
                case 'poll':
                    return CspE2eGroupConversationType.GROUP_POLL_SETUP;
                default:
                    return unreachable(messageType);
            }
        } else {
            switch (messageType) {
                case 'text':
                    return CspE2eConversationType.TEXT;
                case 'file':
                case 'image':
                case 'video':
                case 'audio':
                    return CspE2eConversationType.FILE;
                case 'poll':
                    return CspE2eConversationType.POLL_SETUP;
                default:
                    return unreachable(messageType);
            }
        }
    }

    /** Resolve the current live outbound message and receiver from durable identities. */
    private _resolveCurrentMessage(): CurrentOutgoingMessage | undefined {
        if (!this._services.db.hasOutgoingMessageOutboxEntry(this._messageId)) {
            return undefined;
        }
        const conversation = this._services.model.conversations.getByUid(this._conversationUid);
        const message = conversation?.get().controller.getMessage(this._messageId);
        if (
            conversation === undefined ||
            message === undefined ||
            message.ctx !== MessageDirection.OUTBOUND ||
            message.type === MessageType.DELETED ||
            message.get().view.sentAt !== undefined ||
            message.get().view.sendFailedAt !== undefined ||
            !message.get().controller.lifetimeGuard.active.get()
        ) {
            return undefined;
        }
        return {
            message: message as AnyOutboundNonDeletedMessageModelStore,
            receiver: conversation.get().controller.receiver().get(),
        };
    }

    /** Generic CSP precondition plus terminal group-membership handling. */
    private readonly _sendPrecondition = (): boolean => {
        const current = this._resolveCurrentMessage();
        if (current === undefined) {
            return false;
        }
        if (
            current.receiver.type === ReceiverType.GROUP &&
            current.receiver.view.userState !== GroupUserState.MEMBER
        ) {
            current.message.get().controller.sendFailed(new Date());
            this._services.db.deleteOutgoingMessageOutboxEntry(this._messageId);
            this._log.warn('Terminally dismissed group message because local membership was lost');
            return false;
        }
        return true;
    };
}
