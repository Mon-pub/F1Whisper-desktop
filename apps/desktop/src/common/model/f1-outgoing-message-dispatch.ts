import type {u53} from '@threema/ts-utils/integer/u53';

import type {DbConversationUid} from '~/common/db';
import {MessageDirection, MessageType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import {
    getPendingUploadBytes,
    type OutgoingBlobState,
} from '~/common/model/f1-outgoing-blob-readiness';
import {
    getOutgoingPreparationLane,
    type ReleaseUploadSlot,
} from '~/common/model/f1-outgoing-preparation-lane';
import {getUploadIssuePins} from '~/common/model/f1-upload-issue-pins';
import type {ServicesForModel} from '~/common/model/types/common';
import type {AnyOutboundNonDeletedMessageModelStore} from '~/common/model/types/message';
import type {OutgoingUploadIssue} from '~/common/model/types/message/common';
import type {BlobBackend} from '~/common/network/protocol/blob';
import {
    BlobUploadCancelledError,
    getBlobUploadCoordinator,
} from '~/common/network/protocol/f1-blob-upload-coordinator';
import {
    abortableSleep,
    classifyUploadFailure,
    isTransportFailure,
    type UploadFailureReason,
} from '~/common/network/protocol/f1-blob-upload-failure';
import {OutgoingConversationMessageTask} from '~/common/network/protocol/task/csp/outgoing-conversation-message';
import type {MessageId} from '~/common/network/types';

/**
 * F1Whisper fork: hand an outgoing conversation message over for sending.
 *
 * This is the single entry point for the new-message path (`addMessage.fromLocal`) and for the
 * startup recovery of the durable outbox. It enqueues a job in the ordered preparation lane (see
 * `f1-outgoing-preparation-lane.ts`) that
 *
 * 1. uploads the message's blobs OUTSIDE the task manager (single-flight and cancellable through
 *    the upload coordinator), and then
 * 2. schedules the persistent {@link OutgoingConversationMessageTask}, which no longer uploads: it
 *    only checks that the message is still live and ready, and sends it.
 *
 * The durable outbox row stays in place until the send is confirmed, exactly as before. A job that
 * ends without scheduling the task leaves the row alone, except when there is nothing left to send
 * (the message was removed, or already sent), in which case it clears it.
 */
export function dispatchOutgoingMessage(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    log: Logger,
): void {
    const lane = getOutgoingPreparationLane(services.blob);
    if (lane.isShutdown) {
        // The app is going away; the durable outbox row resumes this message on the next launch.
        log.info('Outgoing preparation lane is shut down, leaving message to the outbox');
        return;
    }
    lane.enqueue(
        conversationUid,
        async () => await prepareAndSchedule(services, conversationUid, messageId, log),
        (error) => {
            // Defensive: the job handles its own failures. Never lose the row on a bug.
            log.error('Preparing an outgoing message failed unexpectedly', error);
        },
    );
}

/**
 * Clear the durable outbox row (same effect as `clearOutgoingMessageFromOutbox`, which cannot be
 * imported here because the outbox module imports this one).
 */
function clearOutbox(services: ServicesForModel, messageId: MessageId): void {
    services.db.deleteOutgoingMessageOutboxEntry(messageId);
}

async function prepareAndSchedule(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    log: Logger,
): Promise<void> {
    const lane = getOutgoingPreparationLane(services.blob);

    const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
    if (message === undefined) {
        // Removed, already sent or terminally failed: there is nothing left to send.
        clearOutbox(services, messageId);
        return;
    }

    if (getPendingUploadBytes(getBlobState(message)) !== undefined) {
        const result = await uploadWithRetries(services, conversationUid, messageId, log);
        switch (result) {
            case 'uploaded':
                break;
            case 'gone':
                // Removed or send cancelled: no retry is coming, so no "waiting" hint either (the
                // message may still exist, e.g. after a conversation was cleared softly).
                getUploadIssuePins(services.blob).clearWaiting(messageId);
                clearOutbox(services, messageId);
                return;
            case 'interrupted':
                // Quit or teardown: the outbox row resumes the upload on the next launch, and
                // until then nothing is being retried.
                getUploadIssuePins(services.blob).clearWaiting(messageId);
                return;
            case 'given-up':
                // The send failed terminally and the outbox row is already gone.
                return;
            default: {
                const unhandled: never = result;
                throw new Error(`Unhandled upload result: ${String(unhandled)}`);
            }
        }
    }

    if (lane.isShutdown) {
        return;
    }
    if (resolveLiveOutboundMessage(services, conversationUid, messageId) === undefined) {
        clearOutbox(services, messageId);
        return;
    }

    // Not awaited: the lane only orders the preparation, not the send itself.
    services.taskManager
        .schedule(new OutgoingConversationMessageTask(services, conversationUid, messageId))
        .then(() => {
            // Confirmed transmit (the CSP ack stamped the message's sentAt): clear the durable
            // outbox row so recovery does not reconstruct an already-sent message.
            clearOutbox(services, messageId);
        })
        .catch(() => {
            // Leave the durable outbox row in place: the persistent task normally reschedules
            // itself on reconnect, and if the app dies before completion, startup recovery
            // reconstructs it (never lost).
        });
}

type AttemptOutcome =
    | {readonly kind: 'uploaded'}
    | {readonly kind: 'gone'}
    | {readonly kind: 'interrupted'}
    | {readonly kind: 'failed'; readonly error: unknown};

/**
 * How the upload of a message ended.
 *
 * - `uploaded`: every blob is uploaded.
 * - `gone`: the message was removed or its send was cancelled; nothing is left to send.
 * - `interrupted`: quit or teardown; the outbox resumes the message on the next launch.
 * - `given-up`: the upload failed for good; the send is terminally failed.
 */
type UploadResult = 'uploaded' | 'gone' | 'interrupted' | 'given-up';

/**
 * Upload the blobs of a message, retrying temporary failures with a backoff. Failures where a
 * server answered spend a cumulative budget and end the send when it runs out; failures where
 * nothing answered (offline) are retried for as long as it takes. Holds the head of the
 * conversation's lane the whole time, so messages composed later wait and the order is kept.
 *
 * An upload error is NEVER thrown from here: it is classified, and then it is retried, ends the
 * send, or (for a deliberate cancel) ends the job quietly. That is what keeps a refusal from
 * turning into a reconnect loop in the task manager.
 */
async function uploadWithRetries(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    log: Logger,
): Promise<UploadResult> {
    const lane = getOutgoingPreparationLane(services.blob);
    const timing = lane.retryTiming;
    // Backoff delay already scheduled for failures where a server answered.
    let chargedRetryMs: u53 = 0;
    let showingIssue = false;

    for (let retryIndex = 0; ; retryIndex++) {
        const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
        if (message === undefined) {
            return 'gone';
        }
        const pendingBytes = getPendingUploadBytes(getBlobState(message));
        if (pendingBytes === undefined) {
            // Another caller finished the uploads meanwhile.
            return 'uploaded';
        }

        const slot = await waitForUploadSlot(services, conversationUid, messageId, pendingBytes);
        if (slot.kind !== 'acquired') {
            return slot.kind;
        }
        let outcome: AttemptOutcome;
        try {
            outcome = await attemptUpload(services, conversationUid, messageId, log);
        } finally {
            slot.release();
        }
        if (outcome.kind === 'uploaded') {
            if (showingIssue) {
                setUploadIssue(services, conversationUid, messageId, undefined);
            }
            return 'uploaded';
        }
        if (outcome.kind !== 'failed') {
            return outcome.kind;
        }

        const verdict = classifyUploadFailure(outcome.error);
        switch (verdict.kind) {
            case 'cancelled':
                return 'interrupted';
            case 'terminal':
                giveUp(services, conversationUid, messageId, verdict.reason, outcome.error, log);
                return 'given-up';
            case 'retry':
                break;
            default:
                return unreachableVerdict(verdict);
        }

        // Backoff is computed once per attempt. Only a failure where a server ANSWERED spends the
        // cumulative budget (never reset); a transport failure (offline, DNS, refused, ...) is
        // retried indefinitely at the capped backoff, like a text message waits for connectivity.
        const delayMs = timing.backoffMs(retryIndex);
        if (!isTransportFailure(outcome.error)) {
            if (chargedRetryMs + delayMs > timing.budgetMs) {
                giveUp(services, conversationUid, messageId, 'failed', outcome.error, log);
                return 'given-up';
            }
            chargedRetryMs += delayMs;
        }
        log.warn(
            `Upload failed, retrying in ${delayMs} ms (retry ${retryIndex + 1})`,
            outcome.error,
        );
        setUploadIssue(services, conversationUid, messageId, {kind: 'waiting'});
        showingIssue = true;

        const waited = await waitBeforeRetry(services, conversationUid, messageId, delayMs);
        if (waited !== 'elapsed') {
            return waited;
        }
    }
}

/**
 * Wait for a free upload slot. The wait is registered with the upload coordinator, so a message
 * that is removed (or whose send is cancelled, or on quit or teardown) while it waits leaves the
 * queue AT ONCE and ends its job, instead of holding up every later message of its conversation
 * until a slot happens to free up.
 */
async function waitForUploadSlot(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    pendingBytes: u53,
): Promise<
    | {readonly kind: 'acquired'; readonly release: ReleaseUploadSlot}
    | {readonly kind: 'gone' | 'interrupted'}
> {
    const lane = getOutgoingPreparationLane(services.blob);
    const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
    if (message === undefined) {
        return {kind: 'gone'};
    }
    const {uid, lifetimeGuard} = message.get().controller;
    // Set as soon as the slot is taken, so a cancel that races with the grant can still give it back.
    let held: ReleaseUploadSlot | undefined;
    try {
        const release = await getBlobUploadCoordinator(services.blob).run(
            uid,
            'slot-wait',
            lifetimeGuard.active,
            async (signal) => {
                const acquired = await lane.acquireUploadSlot(pendingBytes, signal);
                held = acquired;
                return acquired;
            },
            conversationUid,
        );
        return {kind: 'acquired', release};
    } catch (error) {
        held?.();
        const cancelled =
            error instanceof BlobUploadCancelledError ? cancelOutcome(error) : undefined;
        if (cancelled === undefined) {
            throw error;
        }
        return {kind: cancelled};
    }
}

/**
 * Sleep before the next attempt. The sleep is registered with the upload coordinator, so every
 * trigger that cancels an upload (message removed, send cancelled, quit, teardown) ends it too.
 * While it lasts, the lane does not count the job as pending work (see `setRetryWait`).
 */
async function waitBeforeRetry(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    delayMs: u53,
): Promise<'elapsed' | 'gone' | 'interrupted'> {
    const lane = getOutgoingPreparationLane(services.blob);
    const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
    if (message === undefined) {
        return 'gone';
    }
    const {uid, lifetimeGuard} = message.get().controller;
    lane.setRetryWait(conversationUid, true);
    try {
        await getBlobUploadCoordinator(services.blob).run(
            uid,
            'retry-wait',
            lifetimeGuard.active,
            async (signal) => await abortableSleep(delayMs, signal),
            conversationUid,
        );
        return lane.isShutdown ? 'interrupted' : 'elapsed';
    } catch (error) {
        const cancelled =
            error instanceof BlobUploadCancelledError ? cancelOutcome(error) : undefined;
        if (cancelled === undefined) {
            throw error;
        }
        return cancelled;
    } finally {
        lane.setRetryWait(conversationUid, false);
    }
}

/**
 * One attempt to upload the blobs of one message. Runs while an upload slot is held, so the
 * message is looked up again: it may have been removed while the job waited for the slot or for
 * the jobs ahead of it.
 */
async function attemptUpload(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    log: Logger,
): Promise<AttemptOutcome> {
    const lane = getOutgoingPreparationLane(services.blob);
    if (lane.isShutdown) {
        return {kind: 'interrupted'};
    }
    const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
    if (message === undefined) {
        return {kind: 'gone'};
    }
    try {
        switch (message.type) {
            case 'file':
            case 'video':
            case 'audio':
                await message.get().controller.uploadBlobs();
                break;
            case 'image': {
                const uploadedBlobBytes = await message.get().controller.uploadBlobs();
                // Now that blobs are uploaded for the recipient (using low resolution/quality to
                // optimize network traffic and server load), re-generate the image thumbnail in a
                // slightly higher resolution, as an optimization for the local user.
                if (
                    uploadedBlobBytes.main !== undefined &&
                    resolveLiveOutboundMessage(services, conversationUid, messageId) !== undefined
                ) {
                    message
                        .get()
                        .controller.regenerateThumbnail(uploadedBlobBytes.main)
                        .catch((error: unknown) =>
                            log.warn(`Failed to regenerate thumbnail: ${String(error)}`),
                        );
                }
                break;
            }
            case 'text':
            case 'poll':
                // Nothing to upload
                break;
            default:
                return unreachableMessageType(message);
        }
        return {kind: 'uploaded'};
    } catch (error) {
        if (error instanceof BlobUploadCancelledError) {
            const cancelled = cancelOutcome(error);
            if (cancelled !== undefined) {
                return {kind: cancelled};
            }
        }
        return {kind: 'failed', error};
    }
}

/**
 * Map a deliberate cancel to what the job does next. `undefined` for a cancel that is not a reason
 * to stop (the sibling blob failed; the failure that caused that is reported instead).
 */
function cancelOutcome(error: BlobUploadCancelledError): 'gone' | 'interrupted' | undefined {
    switch (error.reason) {
        case 'message-removed':
        case 'send-cancelled':
            return 'gone';
        case 'quit':
        case 'teardown':
            return 'interrupted';
        case 'sibling-failed':
            return undefined;
        default:
            return unreachableCancelReason(error.reason);
    }
}

/**
 * End the send of a message terminally: remember why (in memory), mark it failed (red indicator,
 * never recovered), and drop its outbox row.
 */
function giveUp(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    reason: UploadFailureReason,
    error: unknown,
    log: Logger,
): void {
    log.warn(`Giving up on the upload (${reason})`, error);
    const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
    if (message !== undefined) {
        showUploadIssue(services.blob, message, {kind: 'failed', reason});
        message.get().controller.sendFailed(new Date());
    }
    clearOutbox(services, messageId);
}

function setUploadIssue(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
    issue: OutgoingUploadIssue | undefined,
): void {
    const message = resolveLiveOutboundMessage(services, conversationUid, messageId);
    if (message !== undefined) {
        showUploadIssue(services.blob, message, issue);
    }
}

function showUploadIssue(
    blob: BlobBackend,
    message: AnyOutboundNonDeletedMessageModelStore,
    issue: OutgoingUploadIssue | undefined,
): void {
    getUploadIssuePins(blob).show(message, issue);
}

function unreachableVerdict(verdict: never): never {
    throw new Error(
        `Unexpected upload failure verdict: ${String((verdict as {kind: unknown}).kind)}`,
    );
}

function unreachableCancelReason(reason: never): never {
    throw new Error(`Unexpected upload cancel reason: ${String(reason)}`);
}

function unreachableMessageType(message: never): never {
    throw new Error(
        `Unexpected outgoing message type: ${String((message as {type: unknown}).type)}`,
    );
}

/**
 * Resolve the live outbound message by durable identity, or `undefined` if there is nothing (left)
 * to send. Mirrors the checks the send task makes before it touches the message.
 */
function resolveLiveOutboundMessage(
    services: ServicesForModel,
    conversationUid: DbConversationUid,
    messageId: MessageId,
): AnyOutboundNonDeletedMessageModelStore | undefined {
    if (!services.db.hasOutgoingMessageOutboxEntry(messageId)) {
        return undefined;
    }
    const conversation = services.model.conversations.getByUid(conversationUid);
    const message = conversation?.get().controller.getMessage(messageId);
    if (
        message === undefined ||
        message.ctx !== MessageDirection.OUTBOUND ||
        message.type === MessageType.DELETED ||
        message.get().view.sentAt !== undefined ||
        message.get().view.sendFailedAt !== undefined ||
        !message.get().controller.lifetimeGuard.active.get()
    ) {
        return undefined;
    }
    return message as AnyOutboundNonDeletedMessageModelStore;
}

function getBlobState(message: AnyOutboundNonDeletedMessageModelStore): OutgoingBlobState {
    switch (message.type) {
        case 'file':
        case 'image':
        case 'video':
        case 'audio':
            return message.get().view;
        case 'text':
        case 'poll':
            return {};
        default:
            return unreachableMessageType(message);
    }
}
