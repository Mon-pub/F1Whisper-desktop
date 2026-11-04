import type {u53} from '@threema/ts-utils/integer/u53';

import type {DbConversationUid} from '~/common/db';
import {MessageDirection, MessageType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import {dispatchOutgoingMessage} from '~/common/model/f1-outgoing-message-dispatch';
import type {ServicesForModel} from '~/common/model/types/common';
import type {MessageId} from '~/common/network/types';

/**
 * F1Whisper fork (P-H12): the durable outgoing-message outbox.
 *
 * Ordinary outgoing conversation messages are persisted (their message row) and then handed to an
 * in-memory, fire-and-forget send task. A quit, crash, or profile switch between persistence and the
 * server ack lost that in-memory task with no way to reconstruct it, stranding the message forever.
 *
 * The durable outbox closes that gap: a row keyed by the message id is enrolled BEFORE the in-memory
 * task is scheduled and cleared only once transmission is confirmed (the message's `sentAt` is
 * stamped after the CSP ack). On startup {@link recoverOutgoingMessageOutbox} turns every surviving,
 * not-yet-sent row back into a send task.
 *
 * ## Idempotency semantics
 *
 * - Enroll ({@link enrollOutgoingMessageInOutbox}) happens BEFORE the send task. The tiny window
 *   where a row exists without its message (a crash between enroll and message persistence) is
 *   harmless: recovery finds no message and drops the row.
 * - Clear ({@link clearOutgoingMessageFromOutbox}) happens on confirmed transmit. If the app dies
 *   after the ack (so `sentAt` is persisted) but before the clear, recovery sees `sentAt` set and
 *   drops the row WITHOUT re-sending -> transmit-exactly-once in the normal case.
 * - The residual at-least-once window (server received the message but the ack never reached us) is
 *   unavoidable; the receiver dedupes by message id, so a re-sent message is harmless.
 */

/**
 * Enroll a durable outbox entry for an outgoing conversation message. Call this BEFORE scheduling
 * the in-memory send task, keyed by the message's id.
 */
export function enrollOutgoingMessageInOutbox(
    services: Pick<ServicesForModel, 'db'>,
    entry: {readonly messageId: MessageId; readonly conversationUid: DbConversationUid},
): void {
    services.db.createOutgoingMessageOutboxEntry({
        messageId: entry.messageId,
        conversationUid: entry.conversationUid,
        createdAt: new Date(),
    });
}

/**
 * Clear the durable outbox entry for a message once its transmission is confirmed (or it no longer
 * needs sending). Safe to call for a message that was never enrolled or was already cleared.
 */
export function clearOutgoingMessageFromOutbox(
    services: Pick<ServicesForModel, 'db'>,
    messageId: MessageId,
): void {
    services.db.deleteOutgoingMessageOutboxEntry(messageId);
}

/**
 * Outcome of a {@link recoverOutgoingMessageOutbox} pass.
 */
export interface OutboxRecoveryResult {
    /** Number of surviving outbox entries turned back into send tasks. */
    readonly recovered: u53;
    /** Number of stale entries dropped (conversation/message gone, or already transmitted). */
    readonly dropped: u53;
}

/**
 * Reconstruct a send task for every durable outbox entry whose message has not yet been transmitted.
 * Call once at backend startup.
 *
 * Stale entries are dropped in place:
 * - the conversation no longer exists (guarded; `ON DELETE CASCADE` normally removes the row),
 * - the message was deleted,
 * - the message is not a live outbound message, or
 * - the message was already transmitted (`sentAt` set) -> idempotent cleanup, never re-sent.
 *
 * Reconstructed tasks are persistent: while offline they queue and run on the next connect, so this
 * is safe to call before a connection exists.
 */
export function recoverOutgoingMessageOutbox(
    services: ServicesForModel,
    log: Logger,
): OutboxRecoveryResult {
    const {db, model} = services;
    const entries = db.getAllOutgoingMessageOutboxEntries();

    let recovered = 0;
    let dropped = 0;

    for (const entry of entries) {
        const conversation = model.conversations.getByUid(entry.conversationUid);
        if (conversation === undefined) {
            db.deleteOutgoingMessageOutboxEntry(entry.messageId);
            dropped += 1;
            continue;
        }

        const controller = conversation.get().controller;
        const messageStore = controller.getMessage(entry.messageId);
        if (messageStore === undefined) {
            // Message was deleted while its send was still pending.
            db.deleteOutgoingMessageOutboxEntry(entry.messageId);
            dropped += 1;
            continue;
        }
        if (messageStore.ctx !== MessageDirection.OUTBOUND) {
            // Should never happen (only outbound messages are ever enrolled).
            db.deleteOutgoingMessageOutboxEntry(entry.messageId);
            dropped += 1;
            continue;
        }
        if (messageStore.type === MessageType.DELETED) {
            db.deleteOutgoingMessageOutboxEntry(entry.messageId);
            dropped += 1;
            continue;
        }
        if (messageStore.get().view.sentAt !== undefined) {
            // Already transmitted: the ack landed but the row was not cleared before the last quit.
            db.deleteOutgoingMessageOutboxEntry(entry.messageId);
            dropped += 1;
            continue;
        }
        if (messageStore.get().view.sendFailedAt !== undefined) {
            // Terminal local failure was persisted before a crash could clear the outbox row.
            db.deleteOutgoingMessageOutboxEntry(entry.messageId);
            dropped += 1;
            continue;
        }

        // F1Whisper fork: recovery goes through the same ordered preparation lane as a new message,
        // so a recovered large upload also runs outside the task manager and in conversation order.
        dispatchOutgoingMessage(services, entry.conversationUid, entry.messageId, log);
        recovered += 1;
    }

    if (recovered > 0 || dropped > 0) {
        log.info(
            `Durable outbox recovery: reconstructed ${recovered} send task(s), dropped ${dropped} stale entry(ies)`,
        );
    }

    return {recovered, dropped};
}
