import type {u53} from '@threema/ts-utils/integer/u53';
import {AsyncLock} from '@threema/ts-utils/lock/async-lock';
import {TIMER} from '@threema/ts-utils/timer/global-timer';
import type {TimerCanceller} from '@threema/ts-utils/timer/timer-canceller';

import type {
    DbContactUid,
    DbConversationUid,
    DbGroupUid,
    DbPendingContactDisappearingTimer,
    DbPendingGroupDisappearingTimer,
    DbReceiverLookup,
    UidOf,
} from '~/common/db';
import {
    AcquaintanceLevel,
    ConversationVisibility,
    CspE2eDeliveryReceiptStatus,
    Existence,
    MessageDirection,
    MessageQueryDirection,
    MessageType,
    ReadReceiptPolicy,
    ReceiverType,
    StatusMessageType,
    TriggerSource,
    TypingIndicatorPolicy,
    type PollMessageType,
} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {Contact} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
import {dispatchOutgoingMessage} from '~/common/model/f1-outgoing-message-dispatch';
import {enrollOutgoingMessageInOutbox} from '~/common/model/outgoing-message-outbox';
import type {ServicesForModel} from '~/common/model/types/common';
import type {
    Conversation,
    ConversationController,
    ConversationControllerHandle,
    ConversationRepository,
    ConversationUpdate,
    ConversationUpdateFromToSync,
    ConversationView,
} from '~/common/model/types/conversation';
import type {
    AnyDeletedMessageModelStore,
    AnyInboundNonDeletedMessageModelStore,
    AnyMessageModelStore,
    AnyNonDeletedMessageModelStore,
    AnyNonDeletedMessageType,
    AnyOutboundNonDeletedMessageModelStore,
    AnyPollMessageModelStore,
    DirectedMessageFor,
    SetOfAnyLocalMessageModelStore,
} from '~/common/model/types/message';
import type {
    InboundDeletedMessageModel,
    OutboundDeletedMessageModel,
} from '~/common/model/types/message/deleted';
import type {AnyReceiver, AnyReceiverStore} from '~/common/model/types/receiver';
import type {
    AnyStatusMessageModelStore,
    StatusMessageModelStores,
    StatusMessageView,
} from '~/common/model/types/status';
import {getDebugTagForReceiver} from '~/common/model/utils/debug-tags';
import {LazyWeakRef, ModelStoreCache} from '~/common/model/utils/model-cache';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import {clampF1DisappearingTimer} from '~/common/network/protocol/disappearing-message-metadata';
import {getBlobUploadCoordinator} from '~/common/network/protocol/f1-blob-upload-coordinator';
import type {InternalActiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingDeleteMessageTask} from '~/common/network/protocol/task/csp/outgoing-delete-message';
import {OutgoingDeliveryReceiptTask} from '~/common/network/protocol/task/csp/outgoing-delivery-receipt';
import {
    OutgoingContactDisappearingTimerTask,
    OutgoingGroupDisappearingTimerTask,
} from '~/common/network/protocol/task/csp/outgoing-disappearing-timer';
import {OutgoingGroupReceiptToSenderTask} from '~/common/network/protocol/task/csp/outgoing-group-receipt-to-sender';
import {OutgoingGroupTypingIndicatorTask} from '~/common/network/protocol/task/csp/outgoing-group-typing-indicator';
import {OutgoingTypingIndicatorTask} from '~/common/network/protocol/task/csp/outgoing-typing-indicator';
import {ReflectContactSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-contact-sync-transaction';
import {ReflectGroupSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-group-sync-transaction';
import {ReflectIncomingMessageUpdateTask} from '~/common/network/protocol/task/d2d/reflect-message-update';
import {randomMessageId} from '~/common/network/protocol/utils';
import {computeDisappearingStamp} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import {
    isMessageId,
    type ConversationId,
    type MessageId,
    type StatusMessageId,
    isStatusMessageId,
    statusMessageIdtoStatusMessageUid,
    type PollId,
    type IdentityString,
} from '~/common/network/types';
import {STATUS_CODEC} from '~/common/status';
import type {i53, Mutable} from '~/common/types';
import {assert, assertUnreachable, isNotUndefined, unreachable} from '~/common/utils/assert';
import {PROXY_HANDLER} from '~/common/utils/endpoint';
import {omit} from '~/common/utils/object';
import {
    createExactPropertyValidator,
    type Exact,
    OPTIONAL,
} from '~/common/utils/property-validator';
import {type LocalStore, WritableStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import {LocalSetStore, type IDerivableSetStore} from '~/common/utils/store/set-store';

import * as contact from './contact';
import * as group from './group';
import * as message from './message';
import {MESSAGE_FACTORY} from './message/factory';
import * as status from './status';

// TODO(DESK-697)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createCache() {
    const set = new LazyWeakRef<LocalSetStore<ModelStore<Conversation>>>();
    return {
        set,
        store: {
            [ReceiverType.CONTACT]: new ModelStoreCache<
                UidOf<DbReceiverLookup>,
                ModelStore<Conversation>
            >(set),
            [ReceiverType.DISTRIBUTION_LIST]: new ModelStoreCache<
                UidOf<DbReceiverLookup>,
                ModelStore<Conversation>
            >(set),
            [ReceiverType.GROUP]: new ModelStoreCache<
                UidOf<DbReceiverLookup>,
                ModelStore<Conversation>
            >(set),
        } as const,
    } as const;
}

let cache = createCache();

/** Normalize both persisted off representations to the same governing value. */
function governingTimer(timerSeconds: u53 | undefined): u53 | undefined {
    return timerSeconds !== undefined && timerSeconds > 0 ? timerSeconds : undefined;
}

function formatTimer(timerSeconds: u53 | undefined): string {
    return timerSeconds === undefined ? 'unset' : `${timerSeconds}s`;
}

function recreateCaches(): void {
    cache = createCache();
}

const ensureExactConversationUpdate = createExactPropertyValidator<ConversationUpdate>(
    'ConversationUpdate',
    {
        lastUpdate: OPTIONAL,
        category: OPTIONAL,
        visibility: OPTIONAL,
        isTyping: OPTIONAL,
        ephemeralTimerSeconds: OPTIONAL,
        typingMembers: OPTIONAL,
    },
);

export function deactivateAndPurgeCacheCascade(
    services: ServicesForModel,
    receiver: DbReceiverLookup,
    conversation: ModelStore<Conversation>,
    log?: Logger,
): void {
    const {controller} = conversation.get();

    // Deactivate the conversation...
    controller.lifetimeGuard.deactivate(() => {
        // Deactivate and purge all currently cached messages of this conversation
        message.deactivateAndPurgeCache(services, controller.uid, log);

        // Deactivate and purge all currently cached status messages of this conversation
        status.deactivateAndPurgeCache(services, controller.uid, log);

        // Purge the conversation from the conversation cache
        cache.store[receiver.type].remove(receiver.uid);
    });
}

// Function overload with constrained return type based on existence.
export function getByReceiver<TExistence extends Existence>(
    services: ServicesForModel,
    receiver: DbReceiverLookup,
    existence: TExistence,
    tag?: string,
): TExistence extends Existence.ENSURED
    ? ModelStore<Conversation>
    : ModelStore<Conversation> | undefined;

/**
 * Fetch a conversation model by its receiver.
 *
 * Note: This function assumes that existence of the receiver is ensured. And a receiver **must**
 *       always have an associated conversation.
 */
export function getByReceiver(
    services: ServicesForModel,
    receiver: DbReceiverLookup,
    existence: Existence,
    tag?: string,
): ModelStore<Conversation> | undefined {
    return cache.store[receiver.type].getOrAdd(receiver.uid, () => {
        const {db} = services;
        // Lookup the associated conversation
        const conversation = db.getConversationOfReceiver(receiver);
        if (existence === Existence.ENSURED) {
            assert(
                conversation !== undefined,
                `Expected conversation for receiver ${receiver.type}:${receiver.uid} to exist`,
            );
        } else if (conversation === undefined) {
            return undefined;
        }

        // Create a store
        return new ConversationModelStore(
            services,
            receiver,
            {...omit(conversation, ['peerEphemeralTimerSeconds']), type: receiver.type},
            conversation.uid,
            tag ?? '???',
        );
    });
}

/**
 * Fetch a conversation model by its `uid`.
 */
export function getByUid(
    services: ServicesForModel,
    uid: DbConversationUid,
    existence: Existence,
    tag?: string,
): ModelStore<Conversation> | undefined {
    const {db} = services;

    const conversation = db.getConversationByUid(uid);
    const receiver = conversation?.receiver;
    if (existence === Existence.ENSURED) {
        assert(receiver !== undefined, `Expected conversation ${uid} to exist`);
    } else if (receiver === undefined) {
        return undefined;
    }

    return getByReceiver(services, receiver, existence, tag);
}

function update(
    services: ServicesForModel,
    receiver: DbReceiverLookup,
    change: Exact<ConversationUpdate>,
    uid: DbConversationUid,
): void {
    const {db} = services;
    db.updateConversation({...change, uid});
}

export class ConversationModelController implements ConversationController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public readonly lifetimeGuard = new ModelLifetimeGuard<ConversationView>();

    public readonly read = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        // eslint-disable-next-line @typescript-eslint/require-await
        fromLocal: async (readAt: Date) => this._handleRead(TriggerSource.LOCAL, readAt),
    };

    /** @inheritdoc */
    public readonly addMessage: ConversationController['addMessage'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        fromLocal: async (
            init: DirectedMessageFor<MessageDirection.OUTBOUND, AnyNonDeletedMessageType, 'init'>,
        ) => {
            const sharedTimerSnapshotSeconds = this._snapshotSharedDisappearingTimer();
            const receiverStore = this.receiver();
            const receiver = receiverStore.get();

            await this._ensureDirectAcquaintanceLevelForDirectMessages(
                {source: TriggerSource.LOCAL},
                receiver,
            );

            await this._ensureConversationIsUnarchived({source: TriggerSource.LOCAL});

            // P-H12 durable outbox: enroll a durable record keyed by the message id BEFORE
            // persisting the message and scheduling the in-memory send task. If the app quits,
            // crashes, or switches profile between here and the server ack, startup recovery
            // (recoverOutgoingMessageOutbox) reconstructs the send task from this row. Enrolling
            // first guarantees there is never a persisted message with no record of a pending send;
            // the only window (a row whose message is not persisted yet) is harmless -- recovery
            // drops it.
            enrollOutgoingMessageInOutbox(this._services, {
                messageId: init.id,
                conversationUid: this.uid,
            });

            const messageStore = this._addMessage(init, sharedTimerSnapshotSeconds);

            // Hand the message over for sending if it was created locally. F1Whisper fork: this goes
            // through the ordered preparation lane, which uploads the blobs outside the task
            // manager and then schedules the send task (and clears the durable outbox row once the
            // transmit is confirmed). Not awaited: the message is returned immediately.
            dispatchOutgoingMessage(this._services, this.uid, init.id, this._log);

            // Return the added message
            return messageStore;
        },
        fromSync: (
            handle,
            init: DirectedMessageFor<MessageDirection, AnyNonDeletedMessageType, 'init'>,
        ) => this.addMessage.direct(init),
        fromRemote: async (
            activeTaskHandle,
            init: DirectedMessageFor<MessageDirection.INBOUND, AnyNonDeletedMessageType, 'init'>,
        ) => {
            const sharedTimerSnapshotSeconds = this._snapshotSharedDisappearingTimer();
            const receiver = this.receiver();

            await this._ensureDirectAcquaintanceLevelForDirectMessages(
                {source: TriggerSource.REMOTE, handle: activeTaskHandle},
                receiver.get(),
            );

            await this._ensureConversationIsUnarchived({
                source: TriggerSource.REMOTE,
                handle: activeTaskHandle,
            });

            // Reflected tasks bypass the active CSP task but run in the same worker. Keep this final
            // check and the synchronous insert contiguous so one path wins without a select/insert
            // race after the asynchronous prerequisites above.
            if (this.hasMessage(init.id)) {
                return undefined;
            }
            const store = this._addMessage(init, sharedTimerSnapshotSeconds);

            // Trigger a notification
            this.lifetimeGuard.run((handle) => {
                // TODO(DESK-255): This must be delayed to prevent notifications for messages that have
                // already been acknowledged or which are going to be acknowledged by another device within
                // a small time period.
                this._services.notification
                    .notifyNewMessage(
                        store,
                        {
                            receiver,
                            view: handle.view(),
                        },
                        this._services.model.user.profileSettings.get().view.nickname ??
                            this._services.device.identity.string,
                    )
                    .catch(assertUnreachable);
            });

            // Return the added message
            return store;
        },
        direct: (init: DirectedMessageFor<MessageDirection, AnyNonDeletedMessageType, 'init'>) =>
            this._addMessage(init),
    };

    /** @inheritdoc */
    public readonly removeMessage: ConversationController['removeMessage'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        direct: (uid: MessageId, incomingDiscardDisposition) => {
            const messageToRemove = this.getMessage(uid);

            if (messageToRemove === undefined) {
                return;
            }

            const decrementUnread =
                messageToRemove.ctx === MessageDirection.INBOUND &&
                messageToRemove.get().view.readAt === undefined;
            messageToRemove.get().controller.remove(incomingDiscardDisposition);
            if (decrementUnread) {
                this.decrementUnreadMessageCount();
            }
            this._updateStoresOnConversationUpdate();
        },
    };

    /** @inheritdoc */
    public readonly markMessageAsDeleted: ConversationController['markMessageAsDeleted'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        fromLocal: async (uid: MessageId, deletedAt: Date) => {
            const messageToDelete = this.getMessage(uid);
            if (messageToDelete === undefined) {
                this._log.warn('Cannot find the message to be deleted');
                return;
            }

            await this._lock.with(async () => {
                // Validate message
                if (messageToDelete.type === MessageType.DELETED) {
                    this._log.warn('Trying to delete a message that was already deleted.');
                    return;
                }
                if (!messageToDelete.get().controller.lifetimeGuard.active.get()) {
                    this._log.warn('Trying to delete a message with an inactive model.');
                    return;
                }
                assert(
                    messageToDelete.ctx === MessageDirection.OUTBOUND,
                    'Cannot send an outgoing delete message task for an inbound message',
                );

                // Run task
                const task = new OutgoingDeleteMessageTask(
                    this._services,
                    this.receiver().get(),
                    messageToDelete,
                    deletedAt,
                );
                await this._services.taskManager.schedule(task);

                // Update local state
                this._deleteMessage(messageToDelete, deletedAt);
                this._updateStoresOnConversationUpdate();
            });
        },

        fromSync: (handle, uid: MessageId, deletedAt: Date) => {
            const messageToDelete = this.getMessage(uid);

            // Validate message
            if (messageToDelete === undefined) {
                this._log.warn('Cannot find the message to be deleted');
                return;
            }
            if (messageToDelete.type === MessageType.DELETED) {
                this._log.warn('Trying to delete a message that was already deleted.');
                return;
            }
            if (!messageToDelete.get().controller.lifetimeGuard.active.get()) {
                this._log.warn('Trying to delete a message with an inactive model.');
                return;
            }

            // Update local state
            this._deleteMessage(messageToDelete, deletedAt);
            this._updateStoresOnConversationUpdate();
        },

        fromRemote: async (handle, uid: MessageId, deletedAt: Date) => {
            const messageToDelete = this.getMessage(uid);
            if (messageToDelete === undefined) {
                this._log.warn('Cannot find the message to be deleted');
                return;
            }

            // eslint-disable-next-line @typescript-eslint/require-await
            await this._lock.with(async () => {
                // Validate message
                if (messageToDelete.type === MessageType.DELETED) {
                    this._log.warn('Trying to delete a message that was already deleted.');
                    return;
                }
                if (!messageToDelete.get().controller.lifetimeGuard.active.get()) {
                    this._log.warn('Trying to delete a message with an inactive model.');
                    return;
                }

                // Update local state
                const deletedMessageStore = this._deleteMessage(messageToDelete, deletedAt);
                this._updateStoresOnConversationUpdate();

                // Update notification
                assert(
                    deletedMessageStore.ctx === MessageDirection.INBOUND,
                    'Cannot create a delete notification for an outbound message',
                );
                this.lifetimeGuard.run((storeHandle): void => {
                    this._services.notification
                        .notifyMessageDelete(deletedMessageStore, {
                            receiver: this.receiver(),
                            view: storeHandle.view(),
                        })
                        .catch(assertUnreachable);
                });
            });
        },
    };

    /** @inheritdoc */
    public readonly removeAllMessages: ConversationController['removeAllMessages'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        direct: () => {
            this.lifetimeGuard.update(() => {
                message.removeAll(this._services, this._log, this.uid);
                this._updateStoresOnConversationUpdate();
                // When we remove all messages, we also want to set the unread count to 0. As the
                // messages are removed from the database and the model, no message can be unread.
                return {unreadMessageCount: 0};
            });
        },
    };

    /** @inheritdoc */
    public readonly removeStatusMessage: ConversationController['removeStatusMessage'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        direct: (statusMessageId: StatusMessageId) => {
            this.lifetimeGuard.update(() => {
                status.remove(
                    this._services,
                    this._log,
                    this.uid,
                    statusMessageIdtoStatusMessageUid(statusMessageId),
                );
                this._updateStatusStoresOnConversationUpdate();
                return {};
            });
        },
    };

    /** @inheritdoc */
    public readonly removeAllStatusMessages: ConversationController['removeAllStatusMessages'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        direct: () => {
            this.lifetimeGuard.update(() => {
                status.removeAllOfConversation(this._services, this._log, this.uid);
                this._updateStatusStoresOnConversationUpdate();
                return {};
            });
        },
    };

    /** @inheritdoc */
    public readonly update: ConversationController['update'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        fromSync: (
            handle,
            change: Mutable<ConversationUpdate, 'lastUpdate'>,
            unreadMessageCountDelta?: i53,
        ): void => {
            this.update.direct(change, unreadMessageCountDelta);
        },
        direct: (
            change: Mutable<ConversationUpdate, 'lastUpdate'>,
            unreadMessageCountDelta?: i53,
        ): void => {
            this.lifetimeGuard.update((view) => {
                if (Object.hasOwn(change, 'lastUpdate') && change.lastUpdate === undefined) {
                    return this._services.db.runInTransaction(() => {
                        this._services.db.deleteOutgoingMessageOutboxEntriesForConversation(
                            this.uid,
                        );
                        // F1Whisper fork: the send intent of every pending message is gone, so
                        // stop their uploads too (the messages themselves stay, so their lifetime
                        // guards do not fire).
                        getBlobUploadCoordinator(this._services.blob).abortConversation(
                            this.uid,
                            'send-cancelled',
                        );
                        return this._update(view, change, unreadMessageCountDelta);
                    });
                }
                return this._update(view, change, unreadMessageCountDelta);
            });
        },
    };

    public readonly updateVisibility: ConversationController['updateVisibility'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        fromLocal: async (visibility: ConversationVisibility) => {
            const conversationChange: ConversationUpdateFromToSync = {visibility};

            // No need for a precondition to archive or pin
            const precondition = (): boolean => this.lifetimeGuard.active.get();

            let syncTask: ReflectContactSyncTransactionTask | ReflectGroupSyncTransactionTask;

            const conversationId = this.conversationId();
            switch (conversationId.type) {
                case ReceiverType.CONTACT:
                    syncTask = new ReflectContactSyncTransactionTask(this._services, precondition, {
                        type: 'update-conversation-data',
                        identity: conversationId.identity,
                        conversation: conversationChange,
                    });
                    break;
                case ReceiverType.DISTRIBUTION_LIST:
                    // TODO(DESK-236): Implement distribution list
                    throw new Error('TODO(DESK-236): Implement distribution list');
                case ReceiverType.GROUP: {
                    const group_ = this.receiver();
                    assert(group_.type === ReceiverType.GROUP);
                    syncTask = new ReflectGroupSyncTransactionTask(this._services, precondition, {
                        type: 'update',
                        groupId: conversationId.groupId,
                        creatorIdentity: conversationId.creatorIdentity,
                        groupUpdate: {},
                        conversationUpdate: conversationChange,
                    });
                    break;
                }
                default:
                    unreachable(conversationId);
            }

            await this._lock.with(async () => {
                const result = await this._services.taskManager.schedule(syncTask);
                // Commit update, if possible
                switch (result) {
                    case 'success':
                        // Update locally
                        this.lifetimeGuard.update((view) => this._update(view, {visibility}));
                        break;
                    case 'aborted':
                        // Synchronization conflict
                        throw new Error(
                            'Failed to update conversation visibility due to synchronization conflict',
                        );
                    default:
                        unreachable(result);
                }
            });
        },
    };

    public readonly updateTyping: ConversationController['updateTyping'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,
        // eslint-disable-next-line @typescript-eslint/require-await
        fromRemote: async (handle, isTyping: boolean) => {
            this._updateIsTyping(isTyping);
        },

        fromSync: (handle, isTyping) => {
            this._updateIsTyping(isTyping);
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        fromLocal: async (isTyping: boolean) => {
            // F1Whisper fork: group conversations send a group-typing indicator (0x84) instead.
            if (this.receiverLookup.type === ReceiverType.GROUP) {
                this._handleLocalGroupTyping(isTyping);
                return;
            }
            if (this._shouldSendTypingIndicator()) {
                if (isTyping) {
                    this._resetIsTypingOutgoingTimer();
                    if (this._isTypingOutgoingTimerCanceller === undefined) {
                        this._scheduleOutgoingTypingIndicatorTask(true);
                        this._isTypingOutgoingTimerCanceller = TIMER.repeat(
                            () => this._scheduleOutgoingTypingIndicatorTask(true),
                            this._isTypingOutgoingInterval,
                            'after-interval',
                        );
                    }
                } else {
                    this._scheduleOutgoingTypingIndicatorTask(false);
                    this._isTypingOutgoingTimerCanceller?.();
                    this._isTypingOutgoingTimerCanceller = undefined;
                }
            }
        },
    };

    /** @inheritdoc */
    public readonly updateEphemeralTimer: ConversationController['updateEphemeralTimer'] = {
        // The local user set the timer (e.g. via the picker): update locally AND send the CSP
        // disappearing-timer control message so the peer/group converges.
        fromLocal: async (timerSeconds: u53, at: Date): Promise<void> => {
            if (!this._services.volatileProtocolState.isCspOriginator()) {
                throw new Error('A linked follower cannot originate disappearing-timer changes');
            }
            const conversationId = this.conversationId();
            switch (conversationId.type) {
                case ReceiverType.CONTACT: {
                    const contactReceiver = this.receiver();
                    assert(contactReceiver.type === ReceiverType.CONTACT);
                    const pending = this._persistLocalContactEphemeralTimer(
                        contactReceiver.ctx,
                        timerSeconds,
                        at,
                    );
                    if (pending === undefined) {
                        return;
                    }
                    await this._services.taskManager.schedule(
                        new OutgoingContactDisappearingTimerTask(
                            this._services,
                            contactReceiver.ctx,
                            timerSeconds,
                            pending.generation,
                            pending.messageId,
                            pending.createdAt,
                        ),
                    );
                    break;
                }
                case ReceiverType.GROUP: {
                    const groupReceiver = this.receiver();
                    assert(groupReceiver.type === ReceiverType.GROUP);
                    const pending = this._persistLocalGroupEphemeralTimer(
                        groupReceiver.ctx,
                        timerSeconds,
                        at,
                    );
                    if (pending === undefined) {
                        return;
                    }
                    await this._services.taskManager.schedule(
                        new OutgoingGroupDisappearingTimerTask(
                            this._services,
                            groupReceiver.ctx,
                            timerSeconds,
                            pending.generation,
                        ),
                    );
                    break;
                }
                case ReceiverType.DISTRIBUTION_LIST:
                    // Disappearing messages are not applicable to distribution lists.
                    break;
                default:
                    unreachable(conversationId);
            }
        },
        // An incoming control message set the timer: update locally ONLY. CRITICAL: never send an
        // outgoing message here, otherwise an incoming change would echo back to the sender (the
        // per-device echo-loop that previously broke multi-device).
        fromRemote: (timerSeconds: u53, changedBy: IdentityString, at: Date): void => {
            if (this.receiverLookup.type === ReceiverType.GROUP) {
                this._applyAuthoritativeGroupEphemeralTimer(
                    MessageDirection.INBOUND,
                    timerSeconds,
                    changedBy,
                    at,
                );
            } else {
                this._applyPeerEphemeralTimer(timerSeconds, changedBy, at);
            }
        },
        // F1Whisper fork (FU-H04b): a linked follower applying a disappearing-timer control the phone
        // leader reflected. Phone-authoritative: mirror the phone's own apply for the reflected
        // direction so the follower converges to byte-identical state, and NEVER send (the phone
        // already sent the peer/group copy; a follower send would echo into the device group).
        // - OUTBOUND reflected = the phone applied an explicit local choice.
        // - INBOUND reflected = the phone applied the peer's authoritative value.
        fromSync: (
            direction: MessageDirection,
            timerSeconds: u53,
            changedBy: IdentityString,
            at: Date,
        ): void => {
            if (this.receiverLookup.type === ReceiverType.GROUP) {
                this._applyAuthoritativeGroupEphemeralTimer(direction, timerSeconds, changedBy, at);
            } else {
                this._applyAuthoritativeContactEphemeralTimer(
                    direction,
                    timerSeconds,
                    changedBy,
                    at,
                );
            }
            // Re-arm the enforcement service for the now-synchronized policy (idempotent).
            this._services.disappearingRefresh?.raise();
        },
    };

    private readonly _isTypingIncomingTimeout = 15000;
    private readonly _isTypingOutgoingInterval = 10000;
    private readonly _isTypingOutgoingTimeout = 5000;

    private readonly _resetIsTypingOutgoingTimer = TIMER.debounce(() => {
        if (this._isTypingOutgoingTimerCanceller !== undefined) {
            this._scheduleOutgoingTypingIndicatorTask(false);
            this._isTypingOutgoingTimerCanceller();
            this._isTypingOutgoingTimerCanceller = undefined;
        }
    }, this._isTypingOutgoingTimeout);

    /** F1Whisper fork (groups): stop sending group-typing after a period of inactivity. */
    private readonly _resetGroupTypingOutgoingTimer = TIMER.debounce(() => {
        if (this._groupTypingOutgoingTimerCanceller !== undefined) {
            this._scheduleOutgoingGroupTypingIndicatorTask(false);
            this._groupTypingOutgoingTimerCanceller();
            this._groupTypingOutgoingTimerCanceller = undefined;
        }
    }, this._isTypingOutgoingTimeout);

    private readonly _handle: ConversationControllerHandle;
    private readonly _lock = new AsyncLock();
    private readonly _log: Logger;

    // Stores
    private readonly _lastMessageStore: WritableStore<AnyMessageModelStore | undefined>;
    private readonly _lastStatusMessageStore: WritableStore<AnyStatusMessageModelStore | undefined>;
    // This store is used to notify subscribers that the conversation was updated and potentially
    // stale data should be refreshed. This is e.g. used for subscribers to react to added or
    // removed messages.
    private readonly _lastModificationStore: WritableStore<Date>;

    /**
     * F1Whisper fork (groups): per-member typing auto-expiry timers, keyed by member identity. Each
     * incoming group-typing indicator (re)arms its member's 15s timer; on expiry the member is
     * removed from {@link _groupTypingMembers}.
     */
    private readonly _groupTypingTimers = new Map<IdentityString, TimerCanceller>();
    /** F1Whisper fork (groups): set of members currently typing. Ephemeral; never persisted. */
    private readonly _groupTypingMembers = new Set<IdentityString>();

    private _isTypingIncomingTimerCanceller: TimerCanceller | undefined;
    private _isTypingOutgoingTimerCanceller: TimerCanceller | undefined;
    /** F1Whisper fork (groups): throttle timer for the outgoing group-typing send. */
    private _groupTypingOutgoingTimerCanceller: TimerCanceller | undefined;

    public constructor(
        private readonly _services: ServicesForModel,
        public readonly receiverLookup: DbReceiverLookup,
        public readonly uid: DbConversationUid,
        tag: string,
    ) {
        tag = `model.${tag}`;
        this._log = this._services.logging.logger(tag);
        this._handle = {
            uid,
            receiverLookup,
            conversationId: this.conversationId.bind(this),
            decrementUnreadMessageCount: this.decrementUnreadMessageCount.bind(this),
            bumpPinnedMessages: this.bumpPinnedMessages.bind(this),
            getReceiver: this.receiver.bind(this),
            computeInboundReadDisappearingStamp: this._computeReadStampFromFrozen.bind(this),
        };

        this._lastMessageStore = new WritableStore(
            message.getLastMessage(_services, this._handle, MESSAGE_FACTORY),
        );

        this._lastStatusMessageStore = new WritableStore(
            status.getLastStatusMessage(_services, this._handle),
        );

        this._lastModificationStore = new WritableStore(new Date());
    }

    /**
     * Return the {@link ConversationId} for the current conversation.
     */
    public conversationId(): ConversationId {
        const receiver = this.receiver();
        const model = receiver.get();
        switch (model.type) {
            case ReceiverType.CONTACT:
                return {type: ReceiverType.CONTACT, identity: model.view.identity};
            case ReceiverType.GROUP: {
                return {
                    type: ReceiverType.GROUP,
                    creatorIdentity: contact.getIdentityString(
                        this._services.device,
                        model.view.creator,
                    ),
                    groupId: model.view.groupId,
                };
            }
            case ReceiverType.DISTRIBUTION_LIST:
                // TODO(DESK-236): Implement distribution list
                throw new Error('TODO(DESK-236): Implement distribution list');
            default:
                return unreachable(model);
        }
    }

    public receiver(): AnyReceiverStore {
        return this.lifetimeGuard.run(() => {
            const receiver = this.receiverLookup;
            switch (receiver.type) {
                case ReceiverType.CONTACT:
                    return contact.getByUid(this._services, receiver.uid, Existence.ENSURED);
                case ReceiverType.DISTRIBUTION_LIST:
                    // TODO(DESK-236): Implement distribution list
                    throw new Error('TODO(DESK-236): Implement distribution list');
                case ReceiverType.GROUP:
                    return group.getByUid(this._services, receiver.uid, Existence.ENSURED);
                default:
                    return unreachable(receiver);
            }
        });
    }

    /** @inheritdoc */
    public lastMessageStore(): LocalStore<AnyMessageModelStore | undefined> {
        return this._lastMessageStore;
    }

    /** @inheritdoc */
    public lastStatusMessageStore(): LocalStore<AnyStatusMessageModelStore | undefined> {
        return this._lastStatusMessageStore;
    }

    /** @inheritdoc */
    public lastModificationStore(): LocalStore<Date> {
        return this._lastModificationStore;
    }

    public decrementUnreadMessageCount(): void {
        this.lifetimeGuard.update((view) =>
            // Note: The unread message count is not persisted in the database, so only the view
            //       must be updated!
            ({unreadMessageCount: Math.max(view.unreadMessageCount - 1, 0)}),
        );
    }

    /** @inheritdoc */
    public bumpPinnedMessages(): void {
        // The pinned-messages list lives in the per-message `pinnedAt` column, not in the
        // conversation view; the conversation viewmodel re-queries it on every emission. Pushing an
        // empty delta forces that emission so the pinned banner refreshes immediately on pin/unpin.
        this.lifetimeGuard.update(() => ({}));
    }

    /** @inheritdoc */
    public updateGroupMemberTyping(memberIdentity: IdentityString, isTyping: boolean): void {
        this._updateGroupMemberTyping(memberIdentity, isTyping);
    }

    /** @inheritdoc */
    // `deletedAt` is part of the controller interface but unused by the hard-purge path (a purged
    // message records no deletion time — it leaves no row).
    public markMessageAsDisappeared(uid: MessageId, deletedAt: Date): void {
        const messageToDelete = this.getMessage(uid);
        if (messageToDelete === undefined) {
            // Already removed/disappeared — nothing to do.
            return;
        }
        if (messageToDelete.type === MessageType.DELETED) {
            return;
        }
        if (!messageToDelete.get().controller.lifetimeGuard.active.get()) {
            this._log.warn('Trying to disappear a message with an inactive model.');
            return;
        }

        // F1Whisper fork: HARD-PURGE the message — fully remove the master `messages` row (NOT a
        // type='deleted' tombstone), matching Android (no "This message was deleted" placeholder).
        // `controller.remove()` -> `removeFromDatabase`: DELETEs the row (ON DELETE CASCADE drops the
        // type-specific data + reactions) and frees the blob+thumbnail files via
        // `deleteFilesInBackground`. This is LOCAL-ONLY: no OutgoingDeleteMessageTask, no D2D reflect,
        // no notification — disappearing is enforced independently on each side, so sending a delete
        // would be wrong.
        //
        // Capture the message id + receiver lookup BEFORE `remove()` deactivates the model.
        const receiverLookup = this.receiverLookup;
        messageToDelete.get().controller.remove();

        // Evict the (DOM-layer) thumbnail cache so a stale preview cannot linger.
        this._services.media.refreshThumbnailCacheForMessage(uid, receiverLookup).catch(() => {
            // Best-effort cache eviction; the row + files are already gone.
        });

        this._updateStoresOnConversationUpdate();
    }

    /** @inheritdoc */
    public hasMessage(id: MessageId): boolean {
        return this.lifetimeGuard.run(() =>
            message.isMessagePresentInConversation(this._services, this._handle, id),
        );
    }

    /** @inheritdoc */
    public getMessage(id: MessageId): AnyMessageModelStore | undefined {
        return this.lifetimeGuard.run(() =>
            message.getByMessageId(this._services, this._handle, MESSAGE_FACTORY, id),
        );
    }

    /** @inheritdoc */
    public getMessageByPollId(
        creatorIdentity: IdentityString,
        pollId: PollId,
        pollMessageType: PollMessageType,
    ): AnyPollMessageModelStore | undefined {
        return this.lifetimeGuard.run(() =>
            message.getByPollId(
                this._services,
                this._handle,
                MESSAGE_FACTORY,
                pollId,
                pollMessageType,
                creatorIdentity,
            ),
        );
    }

    /** @inheritdoc */
    public getAllMessages(): SetOfAnyLocalMessageModelStore {
        return this.lifetimeGuard.run(() =>
            message.all(this._services, this._handle, MESSAGE_FACTORY),
        );
    }

    /** @inheritdoc */
    public getMessagesWithSurroundingMessages(
        anyMessageIds: ReadonlySet<MessageId | StatusMessageId>,
        contextSize: u53,
    ): Set<AnyMessageModelStore | AnyStatusMessageModelStore> {
        const {db} = this._services;

        return this.lifetimeGuard.run(() => {
            // If the viewport is empty, do nothing
            if (anyMessageIds.size === 0) {
                return new Set();
            }

            const perMessageTypeContextSize = Math.round(contextSize / 2);

            // Get all visible messages and their ordinals.
            const spreadMessageIds = [...anyMessageIds];
            const visibleMessages = spreadMessageIds
                .filter(isMessageId)
                .map((messageId) =>
                    message.getByMessageId(
                        this._services,
                        this._handle,
                        MESSAGE_FACTORY,
                        messageId,
                    ),
                )
                .filter(isNotUndefined);
            const standardMessageOrdinals = visibleMessages.map((m) => m.get().view.ordinal);

            // Get all visible stauts messages and their ordinals.
            const visibileStatusMessages = spreadMessageIds
                .filter(isStatusMessageId)
                .map((statusMessageId) =>
                    status.checkExistenceAndGetByUid(
                        this._services,
                        this._handle,
                        statusMessageIdtoStatusMessageUid(statusMessageId),
                    ),
                )
                .filter(isNotUndefined);
            const statusMessageOrdinals = visibileStatusMessages.map((s) => s.get().view.ordinal);

            // This is the very special case that the messages where already deleted but the viewport re-derive triggers again.
            if (standardMessageOrdinals.length === 0 && statusMessageOrdinals.length === 0) {
                return new Set();
            }

            // Calculate the min (max) ordinals of all (status) messages in the current viewport.
            const minOrdinal = Math.min(
                Math.min(...standardMessageOrdinals),
                Math.min(...statusMessageOrdinals),
            );
            const maxOrdinal = Math.max(
                Math.max(...standardMessageOrdinals),
                Math.max(...statusMessageOrdinals),
            );

            // Fetch all messages in the current viewport context.
            const oldestMessages = db
                .getMessageUids(this.uid, perMessageTypeContextSize, {
                    ordinal: minOrdinal,
                    direction: MessageQueryDirection.OLDER,
                })
                .map((m) =>
                    message.getByUid(
                        this._services,
                        this._handle,
                        MESSAGE_FACTORY,
                        m.uid,
                        Existence.ENSURED,
                    ),
                );

            const newestMessages = db
                .getMessageUids(this.uid, perMessageTypeContextSize, {
                    ordinal: maxOrdinal,
                    direction: MessageQueryDirection.NEWER,
                })
                .map((m) =>
                    message.getByUid(
                        this._services,
                        this._handle,
                        MESSAGE_FACTORY,
                        m.uid,
                        Existence.ENSURED,
                    ),
                );

            // Fetch all status messages in the current viewport context.
            const oldestStatusMessages = db
                .getStatusMessageUids(this.uid, perMessageTypeContextSize, {
                    ordinal: minOrdinal,
                    direction: MessageQueryDirection.OLDER,
                })
                .map((s) =>
                    status.getByUid(this._services, this._handle, s.uid, Existence.ENSURED),
                );

            const newestStatusMessages = db
                .getStatusMessageUids(this.uid, perMessageTypeContextSize, {
                    ordinal: maxOrdinal,
                    direction: MessageQueryDirection.NEWER,
                })
                .map((s) =>
                    status.getByUid(this._services, this._handle, s.uid, Existence.ENSURED),
                );

            // Return the mixed fetched set of status and standard messages in the current viewport context
            return new Set([
                ...oldestMessages,
                ...oldestStatusMessages,
                ...visibleMessages,
                ...visibileStatusMessages,
                ...newestMessages,
                ...newestStatusMessages,
            ]);
        });
    }

    /** @inheritdoc */
    public getAllStatusMessages(): IDerivableSetStore<AnyStatusMessageModelStore> {
        return this.lifetimeGuard.run(() =>
            status.allStatusMessagesOfConversation(this._services, this._handle),
        );
    }

    /** @inheritdoc */
    public getMessageCount(): u53 {
        return (
            message.getConversationMessageCount(this._services, this._handle) +
            status.getConversationStatusMessageCount(this._services, this._handle)
        );
    }

    /** @inheritdoc */
    public getFirstUnreadMessageId(): MessageId | undefined {
        return message.getFirstUnreadMessageId(this._services, this._handle);
    }

    /** @inheritdoc */
    public getPinnedMessageIds(): MessageId[] {
        return this.lifetimeGuard.run(() =>
            this._services.db.getPinnedMessageUids(this.uid).map(({id}) => id),
        );
    }

    /** @inheritdoc */
    public createStatusMessage<TType extends StatusMessageType>(
        statusMessage: Omit<StatusMessageView<TType>, 'conversationUid' | 'id' | 'ordinal'>,
    ): StatusMessageModelStores[TType] {
        const statusMessageModelStore = status.createStatusMessage(this._services, {
            ...statusMessage,
            conversationUid: this.uid,
        });
        this._updateStatusStoresOnConversationUpdate();

        return statusMessageModelStore;
    }

    /**
     * Update `isTyping` in the associated {@link ConversationView}, and schedule a timeout to
     * change it back to `false` if this method isn't called again in the given timeframe.
     */
    private _updateIsTyping(isTyping: boolean): void {
        // (Re-)schedule timer if `isTyping === true`.
        if (isTyping) {
            this._isTypingIncomingTimerCanceller?.();
            this._isTypingIncomingTimerCanceller = TIMER.timeout(() => {
                this.lifetimeGuard.update((view) => this._update(view, {isTyping: false}));
                this._isTypingIncomingTimerCanceller = undefined;
            }, this._isTypingIncomingTimeout);
        } else {
            this._isTypingIncomingTimerCanceller?.();
        }

        this.lifetimeGuard.update((view) => this._update(view, {isTyping}));
    }

    /**
     * F1Whisper fork (groups): set/clear a single member's typing state and (re)arm its 15s
     * auto-expiry. `typingMembers` is ephemeral (view-only, never persisted).
     */
    private _updateGroupMemberTyping(memberIdentity: IdentityString, isTyping: boolean): void {
        // Cancel any existing timer for this member.
        this._groupTypingTimers.get(memberIdentity)?.();
        this._groupTypingTimers.delete(memberIdentity);

        if (isTyping) {
            this._groupTypingMembers.add(memberIdentity);
            // Auto-expire this member after the typing timeout (re-armed on every indicator).
            this._groupTypingTimers.set(
                memberIdentity,
                TIMER.timeout(() => {
                    this._groupTypingTimers.delete(memberIdentity);
                    this._groupTypingMembers.delete(memberIdentity);
                    this._publishGroupTypingMembers();
                }, this._isTypingIncomingTimeout),
            );
        } else {
            this._groupTypingMembers.delete(memberIdentity);
        }
        this._publishGroupTypingMembers();
    }

    /** F1Whisper fork (groups): push the current typing-member set into the (ephemeral) view. */
    private _publishGroupTypingMembers(): void {
        const typingMembers = [...this._groupTypingMembers];
        // View-only update — `typingMembers` is never persisted to the database.
        this.lifetimeGuard.update(() => ({typingMembers}));
    }

    /** Persist a genuine local contact value, status row, and outgoing generation atomically. */
    private _persistLocalContactEphemeralTimer(
        contactUid: DbContactUid,
        timerSeconds: u53,
        at: Date,
    ): DbPendingContactDisappearingTimer | undefined {
        // Keep explicit local OFF as 0, distinct from a legacy/never-configured undefined value.
        const normalized = timerSeconds > 0 ? timerSeconds : 0;
        const current = this.lifetimeGuard.run((handle) => handle.view().ephemeralTimerSeconds);
        if (current === normalized) {
            return undefined;
        }

        const type = StatusMessageType.DISAPPEARING_TIMER_CHANGED;
        const value = {changedBy: 'me', newTimerSeconds: timerSeconds} as const;
        const {pending, statusMessageUid} = this._services.db.persistLocalContactDisappearingTimer(
            this.uid,
            contactUid,
            normalized,
            randomMessageId(this._services.crypto),
            {
                conversationUid: this.uid,
                createdAt: at,
                statusBytes: STATUS_CODEC[type].encode(value),
                type,
            },
        );

        this._log.info(
            `Applied local shared 1:1 disappearing timer: ${formatTimer(current)} -> ${formatTimer(normalized)}`,
        );
        this.lifetimeGuard.update(() => ({ephemeralTimerSeconds: normalized}));
        status.getByUid(this._services, this._handle, statusMessageUid, Existence.ENSURED);
        this._updateStatusStoresOnConversationUpdate();
        return pending;
    }

    /** Persist the local group value and outgoing generation in one crash-atomic transaction. */
    private _persistLocalGroupEphemeralTimer(
        groupUid: DbGroupUid,
        timerSeconds: u53,
        at: Date,
    ): DbPendingGroupDisappearingTimer | undefined {
        const normalized = timerSeconds > 0 ? timerSeconds : 0;
        const current = this.lifetimeGuard.run((handle) => handle.view().ephemeralTimerSeconds);
        if (current === normalized) {
            return undefined;
        }
        const type = StatusMessageType.DISAPPEARING_TIMER_CHANGED;
        const value = {changedBy: 'me', newTimerSeconds: timerSeconds} as const;
        const {pending, statusMessageUid} = this._services.db.persistLocalGroupDisappearingTimer(
            this.uid,
            groupUid,
            normalized,
            {
                conversationUid: this.uid,
                createdAt: at,
                statusBytes: STATUS_CODEC[type].encode(value),
                type,
            },
        );

        this.lifetimeGuard.update(() => ({ephemeralTimerSeconds: normalized}));
        status.getByUid(this._services, this._handle, statusMessageUid, Existence.ENSURED);
        this._updateStatusStoresOnConversationUpdate();
        return pending;
    }

    /** Apply a phone/peer-authoritative group value and clear stale local intent before publishing. */
    private _applyAuthoritativeGroupEphemeralTimer(
        direction: MessageDirection,
        timerSeconds: u53,
        changedBy: IdentityString,
        at: Date,
    ): void {
        assert(this.receiverLookup.type === ReceiverType.GROUP);
        const previous = this.lifetimeGuard.run((handle) => handle.view().ephemeralTimerSeconds);
        let normalized: u53 | undefined;
        if (direction === MessageDirection.OUTBOUND) {
            normalized = timerSeconds > 0 ? timerSeconds : 0;
        } else {
            normalized = timerSeconds > 0 ? timerSeconds : undefined;
        }
        const isReassert =
            direction === MessageDirection.OUTBOUND
                ? previous === normalized
                : (timerSeconds > 0 && timerSeconds === previous) ||
                  (timerSeconds <= 0 && (previous === undefined || previous <= 0));
        const type = StatusMessageType.DISAPPEARING_TIMER_CHANGED;
        const value = {
            changedBy: direction === MessageDirection.OUTBOUND ? ('me' as const) : changedBy,
            newTimerSeconds: timerSeconds,
        };
        const {statusMessageUid} = this._services.db.persistAuthoritativeGroupDisappearingTimer(
            this.uid,
            this.receiverLookup.uid,
            normalized,
            isReassert
                ? undefined
                : {
                      conversationUid: this.uid,
                      createdAt: at,
                      statusBytes: STATUS_CODEC[type].encode(value),
                      type,
                  },
        );

        this.lifetimeGuard.update(() => ({ephemeralTimerSeconds: normalized}));
        if (statusMessageUid !== undefined) {
            status.getByUid(this._services, this._handle, statusMessageUid, Existence.ENSURED);
            this._updateStatusStoresOnConversationUpdate();
        }
    }

    /** Apply an incoming contact timer unconditionally to the shared field without echoing it. */
    private _applyPeerEphemeralTimer(timerSeconds: u53, changedBy: IdentityString, at: Date): void {
        // F1Whisper fork (GROUP convergence — Option X): groups use a SINGLE shared field
        // (`ephemeralTimerSeconds`) for BOTH directions; the per-direction PEER column is unused for
        // groups. An incoming 0x95 adopts the advertised value UNCONDITIONALLY (pure last-writer-wins;
        // any member can change it, OFF included). No adopt-if-unset gate, no peer-vs-my split — that
        // per-1:1 model + the per-member piggyback re-assert caused the group timer to ping-pong
        // indefinitely. Convergence holds because the only 0x95 on the wire are genuine user changes
        // (the group piggyback is removed), each adopted by everyone. Mirrors Android v6.4.3-29.
        if (this.receiverLookup.type === ReceiverType.GROUP) {
            const previousMy = this.lifetimeGuard.run(
                (handle) => handle.view().ephemeralTimerSeconds,
            );
            // Re-assert (no real change): same positive value, or OFF when already OFF/unset. Used
            // only to suppress duplicate status rows.
            const isReassert =
                (timerSeconds > 0 && timerSeconds === previousMy) ||
                (timerSeconds <= 0 && (previousMy === undefined || previousMy <= 0));
            // Write the shared field UNCONDITIONALLY (do NOT touch peerEphemeralTimerSeconds — dead
            // for groups). OFF stores `undefined` (NOT 0), matching the MY-side convention.
            this.lifetimeGuard.update((view) =>
                this._update(view, {
                    ephemeralTimerSeconds: timerSeconds > 0 ? timerSeconds : undefined,
                }),
            );
            if (!isReassert) {
                this.createStatusMessage({
                    type: StatusMessageType.DISAPPEARING_TIMER_CHANGED,
                    value: {changedBy, newTimerSeconds: timerSeconds},
                    createdAt: at,
                });
            }
            return;
        }

        this._applyAuthoritativeContactEphemeralTimer(
            MessageDirection.INBOUND,
            timerSeconds,
            changedBy,
            at,
        );
    }

    /** Apply a peer/phone-authoritative contact value and invalidate local intent atomically. */
    private _applyAuthoritativeContactEphemeralTimer(
        direction: MessageDirection,
        timerSeconds: u53,
        changedBy: IdentityString,
        at: Date,
    ): void {
        assert(this.receiverLookup.type === ReceiverType.CONTACT);
        const previous = this.lifetimeGuard.run((handle) => handle.view().ephemeralTimerSeconds);
        // A reflected outbound OFF is the user's explicit choice on the leader and keeps the local
        // 0 sentinel. An inbound OFF uses the shared-field off representation.
        let normalized: u53 | undefined;
        if (direction === MessageDirection.OUTBOUND) {
            normalized = timerSeconds > 0 ? timerSeconds : 0;
        } else {
            normalized = timerSeconds > 0 ? timerSeconds : undefined;
        }
        const changesSharedTimer =
            direction === MessageDirection.OUTBOUND
                ? previous !== normalized
                : governingTimer(previous) !== governingTimer(normalized);
        const type = StatusMessageType.DISAPPEARING_TIMER_CHANGED;
        const value = {
            changedBy: direction === MessageDirection.OUTBOUND ? ('me' as const) : changedBy,
            newTimerSeconds: timerSeconds,
        };
        const {statusMessageUid} = this._services.db.persistAuthoritativeContactDisappearingTimer(
            this.uid,
            this.receiverLookup.uid,
            normalized,
            changesSharedTimer
                ? {
                      conversationUid: this.uid,
                      createdAt: at,
                      statusBytes: STATUS_CODEC[type].encode(value),
                      type,
                  }
                : undefined,
        );

        this._log.info(
            `Applied authoritative shared 1:1 disappearing timer: ${formatTimer(previous)} -> ${formatTimer(normalized)}; status=${changesSharedTimer}`,
        );
        this.lifetimeGuard.update(() => ({ephemeralTimerSeconds: normalized}));
        if (statusMessageUid !== undefined) {
            status.getByUid(this._services, this._handle, statusMessageUid, Existence.ENSURED);
            this._updateStatusStoresOnConversationUpdate();
        }
    }

    /**
     * Locally mark a message as deleted.
     */
    private _deleteMessage(
        messageToDelete: AnyNonDeletedMessageModelStore,
        deletedAt: Date,
    ): AnyDeletedMessageModelStore {
        return message.markMessageAsDeleted(
            this._services,
            deletedAt,
            this._handle,
            messageToDelete,
            MESSAGE_FACTORY,
            this._log,
        );
    }

    /**
     * Update database with the change, determine derived view data and return the view update.
     */
    private _update(
        view: Readonly<ConversationView>,
        change: Mutable<ConversationUpdate, 'lastUpdate'>,
        unreadMessageCountDelta?: i53,
    ): Partial<ConversationView> {
        // Prevent 'downgrading' the last update timestamp
        if (
            view.lastUpdate !== undefined &&
            change.lastUpdate !== undefined &&
            view.lastUpdate > change.lastUpdate
        ) {
            change.lastUpdate = view.lastUpdate;
        }

        // Determine unread message count
        const unreadMessageCount =
            unreadMessageCountDelta === undefined
                ? view.unreadMessageCount
                : Math.max(view.unreadMessageCount + unreadMessageCountDelta, 0);

        update(
            this._services,
            this.receiverLookup,
            ensureExactConversationUpdate(change),
            this.uid,
        );

        return {...change, unreadMessageCount};
    }

    private _handleRead(source: TriggerSource.LOCAL, readAt: Date): void {
        this.lifetimeGuard.run((handle) => {
            if (handle.view().unreadMessageCount < 1) {
                return;
            }

            handle.update((view) => {
                const readMessageIds = this._markMessagesReadAndStampAtomically(readAt);

                if (readMessageIds.length > 0) {
                    if (this.receiverLookup.type === ReceiverType.GROUP) {
                        // F1Whisper fork: send a group read receipt (0x81 READ) so the sender's
                        // "Read by" list populates, gated on the same read-receipts pref.
                        if (this._shouldSendGroupReadReceipt()) {
                            this._sendGroupReadReceipts(readMessageIds, readAt);
                        }
                    } else if (this._shouldSendReadReceipt()) {
                        this._sendReadReceiptsToContact(readMessageIds, readAt);
                    } else {
                        this._reflectMarkMessagesAsRead(readMessageIds, readAt);
                    }
                }

                return {unreadMessageCount: 0};
            });
        });
    }

    /**
     * F1Whisper fork (P-H05): mark all unread inbound messages read AND stamp each one's
     * disappearing-messages expiry in a SINGLE database transaction, so a crash between the two
     * writes can never leave a read message unstamped (which would then never disappear). After the
     * atomic commit, publish `readAt` and the committed expiry into each reactive message view (so a
     * countdown badge updates immediately) and re-arm the deletion timer for the nearest new expiry.
     *
     * @returns the ids of the messages marked read (for read-receipt handling).
     */
    private _markMessagesReadAndStampAtomically(readAt: Date): MessageId[] {
        const {db} = this._services;
        const stampsById = new Map<MessageId, ReturnType<typeof computeDisappearingStamp>>();

        const readMessages = db.runInTransaction(() => {
            const read = db.markConversationAsRead(this.uid, readAt);
            for (const {uid, id} of read) {
                const stamp = this._computeInboundReadStamp(this.getMessage(id), readAt);
                if (stamp !== undefined) {
                    db.stampMessageExpiry(uid, stamp);
                    stampsById.set(id, stamp);
                }
            }
            return read;
        });

        // Publish the committed read + expiry into the reactive message views (outside the DB
        // transaction), and re-arm the deletion timer if any new expiry was stamped.
        let stampedAny = false;
        for (const {id} of readMessages) {
            const messageModelStore = this.getMessage(id);
            if (messageModelStore === undefined) {
                continue;
            }
            assert(messageModelStore.ctx === MessageDirection.INBOUND);
            if (messageModelStore.get().type === MessageType.DELETED) {
                continue;
            }
            const stamp = stampsById.get(id);
            messageModelStore.get().controller.lifetimeGuard.update(() => ({
                readAt,
                ...(stamp ?? {}),
            }));
            if (stamp !== undefined) {
                stampedAny = true;
            }
        }
        if (stampedAny) {
            // F1Whisper fork (P-H05): re-arm the disappearing-messages deletion timer immediately for
            // the nearest new expiry, instead of waiting for the periodic sweep. The model cannot
            // reach the (backend-layer, proxied) enforcement service directly, so it raises an event
            // the service subscribes to.
            this._services.disappearingRefresh?.raise();
        }

        return readMessages.map(({id}) => id);
    }

    /**
     * Read receipts have to be sent and reflected only for contact conversations following the
     * read receipt policy override for the contact if defined, or following the global read receipt
     * policy otherwise. Note that if no delivery receipt is sent, an {@link IncomingMessageUpdate}
     * has to be sent instead.
     */
    private _shouldSendReadReceipt(): boolean {
        if (this.receiverLookup.type !== ReceiverType.CONTACT) {
            return false;
        }

        // Check contact read receipt policy override
        const contactReceiver = this.receiver();
        assert(contactReceiver.type === ReceiverType.CONTACT);
        const {readReceiptPolicyOverride} = contactReceiver.get().view;
        if (readReceiptPolicyOverride !== undefined) {
            return readReceiptPolicyOverride === ReadReceiptPolicy.SEND_READ_RECEIPT;
        }

        // Otherwise, fall back to global default
        const {readReceiptPolicy} = this._services.model.user.privacySettings.get().view;
        return readReceiptPolicy !== ReadReceiptPolicy.DONT_SEND_READ_RECEIPT;
    }

    /**
     * Note that since this method schedules a {@link OutgoingDeliveryReceiptTask} the read status
     * will also be synced with the linked devices without having to manually schedule a
     * {@link ReflectIncomingMessageUpdateTask}.
     */
    private _sendReadReceiptsToContact(readMessageIds: MessageId[], readAt: Date): void {
        const contactReceiver = this.receiver();
        assert(contactReceiver.type === ReceiverType.CONTACT);

        this._services.taskManager
            .schedule(
                new OutgoingDeliveryReceiptTask(
                    this._services,
                    contactReceiver.get(),
                    CspE2eDeliveryReceiptStatus.READ,
                    readAt,
                    readMessageIds,
                ),
            )
            .catch(() => {
                // Ignore (task should persist)
            });
    }

    /**
     * F1Whisper fork: whether to send a group read receipt (gated only by the global read-receipts
     * policy; groups have no per-conversation override).
     */
    private _shouldSendGroupReadReceipt(): boolean {
        const {readReceiptPolicy} = this._services.model.user.privacySettings.get().view;
        return readReceiptPolicy !== ReadReceiptPolicy.DONT_SEND_READ_RECEIPT;
    }

    /**
     * F1Whisper fork: send a group read receipt (0x81 READ) for the given messages — POINT-TO-POINT
     * to each message's original sender ONLY (never broadcast to the group; privacy).
     */
    private _sendGroupReadReceipts(readMessageIds: MessageId[], readAt: Date): void {
        this._sendGroupReceiptsToSenders(readMessageIds, CspE2eDeliveryReceiptStatus.READ, readAt);
    }

    /**
     * F1Whisper fork: send a group delivery/read receipt (0x81) to the ORIGINAL SENDER of each
     * referenced message ONLY (not the whole group — privacy). Messages are grouped by sender so
     * each author gets a single receipt addressed only to them; self-authored messages are skipped
     * (no self-receipt, no echo).
     */
    private _sendGroupReceiptsToSenders(
        messageIds: MessageId[],
        receiptStatus: CspE2eDeliveryReceiptStatus.RECEIVED | CspE2eDeliveryReceiptStatus.READ,
        at: Date,
    ): void {
        const groupReceiver = this.receiver();
        assert(groupReceiver.type === ReceiverType.GROUP);
        const groupModel = groupReceiver.get();
        const creatorIdentity = getIdentityString(this._services.device, groupModel.view.creator);

        // Bucket the messages by their (inbound) sender contact; skip our own outbound messages.
        const messageIdsBySender = new Map<ModelStore<Contact>, MessageId[]>();
        for (const messageId of messageIds) {
            const messageStore = this.getMessage(messageId);
            if (messageStore === undefined || messageStore.ctx !== MessageDirection.INBOUND) {
                // Only inbound (someone else's) messages get a receipt; never self-authored.
                continue;
            }
            const sender = messageStore.get().controller.sender();
            const bucket = messageIdsBySender.get(sender);
            if (bucket === undefined) {
                messageIdsBySender.set(sender, [messageId]);
            } else {
                bucket.push(messageId);
            }
        }

        // One receipt per distinct sender, addressed to that sender only.
        for (const [sender, senderMessageIds] of messageIdsBySender) {
            this._services.taskManager
                .schedule(
                    new OutgoingGroupReceiptToSenderTask(
                        this._services,
                        sender.get(),
                        {groupId: groupModel.view.groupId, creatorIdentity},
                        receiptStatus,
                        at,
                        senderMessageIds,
                    ),
                )
                .catch(() => {
                    // Ignore (task should persist)
                });
        }
    }

    private _reflectMarkMessagesAsRead(readMessageIds: MessageId[], readAt: Date): void {
        const conversation = this.conversationId();

        const messageUniqueIdsToUpdate = readMessageIds.map((messageId) => ({
            messageId,
            conversation,
        }));

        this._services.taskManager
            .schedule(
                new ReflectIncomingMessageUpdateTask(
                    this._services,
                    messageUniqueIdsToUpdate,
                    readAt,
                ),
            )
            .catch(() => {
                // Ignore (task should persist)
            });
    }

    private _shouldSendTypingIndicator(): boolean {
        if (this.receiverLookup.type !== ReceiverType.CONTACT) {
            return false;
        }

        // Check contact typing indicator policy override
        const contactReceiver = this.receiver();
        assert(contactReceiver.type === ReceiverType.CONTACT);
        const {typingIndicatorPolicyOverride} = contactReceiver.get().view;
        if (typingIndicatorPolicyOverride !== undefined) {
            return typingIndicatorPolicyOverride === TypingIndicatorPolicy.SEND_TYPING_INDICATOR;
        }

        // Otherwise, fall back to global default
        const {typingIndicatorPolicy} = this._services.model.user.privacySettings.get().view;
        return typingIndicatorPolicy !== TypingIndicatorPolicy.DONT_SEND_TYPING_INDICATOR;
    }

    private _scheduleOutgoingTypingIndicatorTask(isTyping: boolean): void {
        const contactReceiver = this.receiver();
        assert(contactReceiver.type === ReceiverType.CONTACT);
        this._services.taskManager
            .schedule(
                new OutgoingTypingIndicatorTask(this._services, contactReceiver.get(), isTyping),
            )
            .catch(() => {
                // Ignore (task should persist)
            });
    }

    /**
     * F1Whisper fork (groups): whether to send a group-typing indicator (gated only by the global
     * typing-indicator policy; groups have no per-conversation override).
     */
    private _shouldSendGroupTypingIndicator(): boolean {
        const {typingIndicatorPolicy} = this._services.model.user.privacySettings.get().view;
        return typingIndicatorPolicy !== TypingIndicatorPolicy.DONT_SEND_TYPING_INDICATOR;
    }

    /**
     * F1Whisper fork (groups): drive the outgoing group-typing throttle (mirrors the 1:1 path: an
     * immediate send + a repeat while typing, and a final "stopped" send + reset).
     */
    private _handleLocalGroupTyping(isTyping: boolean): void {
        if (!this._shouldSendGroupTypingIndicator()) {
            return;
        }
        if (isTyping) {
            this._resetGroupTypingOutgoingTimer();
            if (this._groupTypingOutgoingTimerCanceller === undefined) {
                this._scheduleOutgoingGroupTypingIndicatorTask(true);
                this._groupTypingOutgoingTimerCanceller = TIMER.repeat(
                    () => this._scheduleOutgoingGroupTypingIndicatorTask(true),
                    this._isTypingOutgoingInterval,
                    'after-interval',
                );
            }
        } else {
            this._scheduleOutgoingGroupTypingIndicatorTask(false);
            this._groupTypingOutgoingTimerCanceller?.();
            this._groupTypingOutgoingTimerCanceller = undefined;
        }
    }

    private _scheduleOutgoingGroupTypingIndicatorTask(isTyping: boolean): void {
        const groupReceiver = this.receiver();
        assert(groupReceiver.type === ReceiverType.GROUP);
        this._services.taskManager
            .schedule(
                new OutgoingGroupTypingIndicatorTask(this._services, groupReceiver.get(), isTyping),
            )
            .catch(() => {
                // Ignore
            });
    }

    private async _ensureDirectAcquaintanceLevelForDirectMessages(
        scope:
            | {source: TriggerSource.LOCAL}
            | {source: TriggerSource.REMOTE; handle: InternalActiveTaskCodecHandle},
        receiver: AnyReceiver,
    ): Promise<void> {
        if (receiver.type !== ReceiverType.CONTACT) {
            return;
        }

        if (receiver.view.acquaintanceLevel === AcquaintanceLevel.DIRECT) {
            return;
        }
        this._log.info(
            `Promoting contact from AcquaintanceLevel.GROUP_OR_DELETED to AcquaintanceLevel.DIRECT: ${receiver.view.identity}`,
        );

        switch (scope.source) {
            case TriggerSource.LOCAL:
                await receiver.controller.update.fromLocal({
                    acquaintanceLevel: AcquaintanceLevel.DIRECT,
                });
                break;
            case TriggerSource.REMOTE:
                await receiver.controller.update.fromRemote(scope.handle, {
                    acquaintanceLevel: AcquaintanceLevel.DIRECT,
                });
                break;

            default:
                unreachable(scope);
        }
    }

    private async _ensureConversationIsUnarchived(
        scope:
            | {source: TriggerSource.LOCAL}
            | {source: TriggerSource.REMOTE; handle: InternalActiveTaskCodecHandle},
    ): Promise<void> {
        await this.lifetimeGuard.run(async (conversation) => {
            if (conversation.view().visibility !== ConversationVisibility.ARCHIVED) {
                return;
            }

            this._log.info('Unarchiving conversation');

            const conversationChange: ConversationUpdateFromToSync = {
                visibility: ConversationVisibility.SHOW,
            };

            // Precondition: The conversation is archived
            const precondition = (): boolean =>
                this.lifetimeGuard.active.get() &&
                conversation.view().visibility === ConversationVisibility.ARCHIVED;

            let syncTask: ReflectContactSyncTransactionTask | ReflectGroupSyncTransactionTask;

            const conversationId = this.conversationId();
            switch (conversationId.type) {
                case ReceiverType.CONTACT:
                    syncTask = new ReflectContactSyncTransactionTask(this._services, precondition, {
                        type: 'update-conversation-data',
                        identity: conversationId.identity,
                        conversation: conversationChange,
                    });
                    break;
                case ReceiverType.DISTRIBUTION_LIST:
                    // TODO(DESK-236): Implement distribution list
                    throw new Error('TODO(DESK-236): Implement distribution list');
                case ReceiverType.GROUP:
                    {
                        const group_ = this.receiver();
                        assert(group_.type === ReceiverType.GROUP);
                        syncTask = new ReflectGroupSyncTransactionTask(
                            this._services,
                            precondition,
                            {
                                type: 'update',
                                groupId: conversationId.groupId,
                                creatorIdentity: conversationId.creatorIdentity,
                                groupUpdate: {},
                                conversationUpdate: conversationChange,
                            },
                        );
                    }
                    break;
                default:
                    unreachable(conversationId);
            }

            await this._lock.with(async () => {
                let result;
                switch (scope.source) {
                    case TriggerSource.LOCAL:
                        result = await this._services.taskManager.schedule(syncTask);
                        break;
                    case TriggerSource.REMOTE:
                        result = await syncTask.run(scope.handle);
                        break;
                    default:
                        unreachable(scope);
                }

                // Commit update, if possible
                switch (result) {
                    case 'success':
                        // Update locally
                        this.lifetimeGuard.update((view) => this._update(view, conversationChange));
                        break;
                    case 'aborted':
                        // Synchronization conflict
                        throw new Error('Failed to update contact due to synchronization conflict');
                    default:
                        unreachable(result);
                }
            });
        });
    }

    private _addMessage(
        init: DirectedMessageFor<MessageDirection.INBOUND, AnyNonDeletedMessageType, 'init'>,
        sharedTimerSnapshotSeconds?: u53,
    ): Exclude<AnyInboundNonDeletedMessageModelStore, InboundDeletedMessageModel>;
    private _addMessage(
        init: DirectedMessageFor<MessageDirection.OUTBOUND, AnyNonDeletedMessageType, 'init'>,
        sharedTimerSnapshotSeconds?: u53,
    ): Exclude<AnyOutboundNonDeletedMessageModelStore, OutboundDeletedMessageModel>;
    private _addMessage(
        init: DirectedMessageFor<MessageDirection, AnyNonDeletedMessageType, 'init'>,
        sharedTimerSnapshotSeconds?: u53,
    ): AnyNonDeletedMessageModelStore;
    private _addMessage(
        init: DirectedMessageFor<MessageDirection, AnyNonDeletedMessageType, 'init'>,
        sharedTimerSnapshotSeconds?: u53,
    ): AnyNonDeletedMessageModelStore {
        const isInbound = init.direction === MessageDirection.INBOUND;
        const isUnread = init.readAt === undefined;

        // Update 'last update' date and unread count
        const lastUpdate = isInbound ? init.receivedAt : init.createdAt;
        const unreadMessageCountDelta = isInbound && isUnread ? 1 : 0;
        this.update.direct({lastUpdate}, unreadMessageCountDelta);

        // F1Whisper fork: stamp disappearing-messages expiry. Outbound messages start their
        // countdown at send (createdAt). Inbound messages that are created already-read start at
        // their read time; otherwise they are stamped later at first-read (`_stampInboundOnRead`).
        const stampedInit = this._stampDisappearingExpiry(
            init,
            isInbound,
            isUnread,
            sharedTimerSnapshotSeconds,
        );

        // Store the message in the DB and retrieve the model
        const store = message.create(this._services, this._handle, MESSAGE_FACTORY, stampedInit);

        assert(store.type !== MessageType.DELETED, 'Cannot directly add a deleted message');

        // Ensure that the contracts stated by the overload variants of this function are fulfilled
        switch (init.direction) {
            case MessageDirection.INBOUND:
                assert(
                    store.ctx === MessageDirection.INBOUND,
                    'An init param for an inbound message should create an inbound message',
                );
                break;

            case MessageDirection.OUTBOUND:
                assert(
                    store.ctx === MessageDirection.OUTBOUND,
                    'An init param for an outbound message should create an outbound message',
                );
                break;

            default:
                unreachable(init);
        }

        // Update dependent stores
        this._updateStoresOnConversationUpdate();

        return store;
    }

    /**
     * F1Whisper fork: freeze the per-message policy. Outgoing messages use the shared timer frozen at
     * compose time. Direct incoming messages prefer the sender's metadata and use the shared timer
     * only for legacy metadata. A custom-onprem follower persists the reflection-time fallback while
     * deferring countdown creation until the exact direct CSP copy resolves its metadata.
     */
    private _stampDisappearingExpiry<
        TInit extends DirectedMessageFor<MessageDirection, AnyNonDeletedMessageType, 'init'>,
    >(init: TInit, isInbound: boolean, isUnread: boolean, sharedTimerSnapshotSeconds?: u53): TInit {
        const sharedTimerSeconds =
            sharedTimerSnapshotSeconds ?? this._snapshotSharedDisappearingTimer();
        let timerSeconds: u53;
        if (isInbound) {
            if (init.pendingRemoteDisappearingTimerNonceHash !== undefined) {
                timerSeconds = clampF1DisappearingTimer(governingTimer(sharedTimerSeconds) ?? 0);
                this._log.info(
                    `Disappearing: froze reflected fallback for message ${init.id} at ${timerSeconds}s pending direct CSP metadata`,
                );
                return {...init, disappearingTimerSeconds: timerSeconds};
            }
            const advertised = init.senderDisappearingTimerSeconds;
            timerSeconds = clampF1DisappearingTimer(
                init.disappearingTimerSeconds ??
                    advertised ??
                    governingTimer(sharedTimerSeconds) ??
                    0,
            );
            let source: 'metadata' | 'shared-field' | 'none';
            if (advertised !== undefined) {
                source = 'metadata';
            } else if (timerSeconds > 0) {
                source = 'shared-field';
            } else {
                source = 'none';
            }
            this._log.info(
                `Disappearing: froze incoming message ${init.id} at ${timerSeconds}s from ${source}`,
            );
        } else {
            timerSeconds = clampF1DisappearingTimer(governingTimer(sharedTimerSeconds) ?? 0);
            this._log.info(
                `Disappearing: froze outgoing message ${init.id} at ${timerSeconds}s for metadata advertisement`,
            );
        }

        if (isInbound && isUnread) {
            return {...init, disappearingTimerSeconds: timerSeconds};
        }
        if (timerSeconds <= 0) {
            return {...init, disappearingTimerSeconds: 0};
        }
        let start: Date;
        if (init.direction === MessageDirection.INBOUND) {
            // Created already-read: the countdown starts at the read time (fall back to receivedAt).
            start = init.readAt ?? init.receivedAt;
        } else {
            // Outbound: the countdown starts at send time.
            start = init.createdAt;
        }
        const stamp = computeDisappearingStamp(timerSeconds, start);
        if (stamp === undefined) {
            return init;
        }
        return {...init, ...stamp};
    }

    private _snapshotSharedDisappearingTimer(): u53 {
        const sharedTimerSeconds = this.lifetimeGuard.run(
            (handle) => handle.view().ephemeralTimerSeconds,
        );
        return clampF1DisappearingTimer(governingTimer(sharedTimerSeconds) ?? 0);
    }

    /**
     * F1Whisper fork: compute the disappearing-messages expiry stamp for an inbound message at
     * first-read, starting the countdown now (`readAt`). Returns `undefined` (no stamp) for a
     * missing/deleted message or when there is no active timer. The caller persists the stamp and
     * publishes it into the view; this function only computes it (so the persist can be batched into
     * one atomic transaction with the `readAt` write, P-H05).
     *
     * Timer source: the timer was FROZEN at receive time onto the message's own
     * `disappearingTimerSeconds`. That already-frozen value WINS over any live lookup — so a later
     * timer change cannot retroactively alter an already-received message. A frozen `0` means the
     * incoming timer was explicitly off at receive (P-H04): it is respected (yields no expiry) and
     * does NOT fall back to the live timer. Only a legacy `undefined` (never frozen; a race or a
     * pre-fix row) falls back to the conversation's current shared `ephemeralTimerSeconds` field. A
     * nonce-bound reflected row remains unstamped until direct CSP metadata resolves its policy.
     */
    private _computeInboundReadStamp(
        messageStore: AnyMessageModelStore | undefined,
        readAt: Date,
    ): ReturnType<typeof computeDisappearingStamp> {
        if (messageStore === undefined) {
            return undefined;
        }
        const messageModel = messageStore.get();
        if (messageModel.type === MessageType.DELETED) {
            return undefined;
        }
        if (messageModel.view.remoteDisappearingTimerPending === true) {
            return undefined;
        }
        return this._computeReadStampFromFrozen(messageModel.view.disappearingTimerSeconds, readAt);
    }

    /**
     * F1Whisper fork (P-H05): compute an inbound message's first-read disappearing stamp from its
     * receive-time-frozen timer. Exposed via {@link ConversationControllerHandle} so the message
     * controller can stamp expiry atomically with `readAt` on the reflected/sync read path too (see
     * `_computeInboundReadStamp` for the timer-source rules).
     */
    private _computeReadStampFromFrozen(
        frozenTimerSeconds: u53 | undefined,
        readAt: Date,
    ): ReturnType<typeof computeDisappearingStamp> {
        const timerSeconds =
            frozenTimerSeconds ??
            this.lifetimeGuard.run((handle) => handle.view().ephemeralTimerSeconds);
        return computeDisappearingStamp(timerSeconds, readAt);
    }

    /**
     * Update the stores that depend on conversation changes:
     *
     * - Update {@link _lastMessageStore} with the last message of the conversation.
     * - Update {@link _lastModificationStore} with the current timestamp.
     */
    private _updateStoresOnConversationUpdate(): void {
        // Note: Update the "last message" store before updating the "last conversation update"
        // store. This way, when subscribing to conversation updates, the last message can be
        // fetched from the "last message" store and will already be correct.
        this._lastMessageStore.set(
            message.getLastMessage(this._services, this._handle, MESSAGE_FACTORY),
        );
        this._lastModificationStore.set(new Date());
    }

    private _updateStatusStoresOnConversationUpdate(): void {
        // Note: Update the "last status message" store before updating the "last conversation update"
        // store. This way, when subscribing to conversation updates, the last message can be
        // fetched from the "last message" store and will already be correct.
        this._lastStatusMessageStore.set(status.getLastStatusMessage(this._services, this._handle));
        this._lastModificationStore.set(new Date());
    }
}

function all(services: ServicesForModel): LocalSetStore<ModelStore<Conversation>> {
    // Note: This may be inefficient. It would be more efficient to get all UIDs, then filter
    // out all UIDs we have cached stores for and then make an aggregated request for the
    // remaining ones.
    return cache.set.derefOrCreate(() => {
        const {db, logging} = services;
        const stores = db.getAllConversationReceivers().map(({receiver}) => {
            const tag = getDebugTagForReceiver(receiver);
            return getByReceiver(services, receiver, Existence.ENSURED, tag);
        });
        const tag = 'conversation[]';
        return new LocalSetStore(new Set(stores), {
            debug: {
                log: logging.logger(`model.${tag}`),
                tag,
            },
        });
    });
}

export class ConversationModelStore extends ModelStore<Conversation> {
    public constructor(
        services: ServicesForModel,
        receiverLookup: DbReceiverLookup,
        conversation: ConversationView,
        uid: DbConversationUid,
        tag: string,
    ) {
        const {logging} = services;
        tag = `${tag}.conversation`;
        super(
            conversation,
            new ConversationModelController(services, receiverLookup, uid, tag),
            uid,
            undefined,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}

/** @inheritdoc */
export class ConversationModelRepository implements ConversationRepository {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public readonly totalUnreadMessageCount: LocalStore<u53>;

    private readonly _log: Logger;

    public constructor(private readonly _services: ServicesForModel) {
        this._log = _services.logging.logger('model.conversation-repository');

        // TODO(DESK-697): This is a ugly workaround to make some tests work,
        // but should be probably a private class attribute (not a trivial change as of now), or maybe be
        // moved down to DB level. This case was the origin of DESK-697.
        this._log.debug('Creating new cache');
        cache = createCache();
        message.recreateCaches();
        status.recreateCaches();

        this.totalUnreadMessageCount = derive(
            [this.getAll()],
            ([{currentValue: conversationModelStoreSet}], getAndSubscribe) => {
                let totalCount = 0;
                for (const conversationModelStore of conversationModelStoreSet) {
                    totalCount += getAndSubscribe(conversationModelStore).view.unreadMessageCount;
                }
                return totalCount;
            },
        );
    }

    /** @inheritdoc */
    public getAll(): LocalSetStore<ModelStore<Conversation>> {
        return all(this._services);
    }

    /** @inheritdoc */
    public getByUid(uid: DbConversationUid): ModelStore<Conversation> | undefined {
        return getByUid(this._services, uid, Existence.UNKNOWN);
    }

    /** @inheritdoc */
    public getForReceiver(receiver: DbReceiverLookup): ModelStore<Conversation> | undefined {
        const tag = getDebugTagForReceiver(receiver);
        return getByReceiver(this._services, receiver, Existence.UNKNOWN, tag);
    }

    /** @inheritdoc */
    public refreshCache(): void {
        // Empty the cache
        recreateCaches();
        all(this._services);
    }
}
