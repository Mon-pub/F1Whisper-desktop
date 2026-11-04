import type {u53} from '@threema/ts-utils/integer/u53';

import type {AnyOutboundNonDeletedMessageModelStore} from '~/common/model/types/message';
import type {OutgoingUploadIssue} from '~/common/model/types/message/common';
import type {BlobBackend} from '~/common/network/protocol/blob';
import type {MessageId} from '~/common/network/types';
import type {StoreUnsubscriber} from '~/common/utils/store';

/**
 * F1Whisper fork: keeps the model store of a message alive while it shows an upload issue.
 *
 * The issue ("waiting to retry", or why the upload failed) is transient and lives only on the
 * message's model store. The model cache holds its stores WEAKLY: once nothing displays the message
 * (e.g. another chat is open), the store can be garbage collected, and the next lookup rebuilds it
 * from the database without the issue. The user would then miss why the send failed. So a store
 * that shows an issue is held strongly, and let go of as soon as it does not need to be:
 *
 * - the issue is cleared (the upload went through), or
 * - the waiting hint is cleared because the preparation ended without the message failing
 *   ({@link clearWaiting}: the send was cancelled, or the app is stopping), or
 * - the message is removed (its lifetime ends): a subscription to the lifetime releases the entry
 *   at once, so deleting a failed message or clearing its chat never leaves the store pinned.
 *
 * One instance per backend (see {@link getUploadIssuePins}).
 */
export class UploadIssuePins {
    private readonly _pins = new Map<
        MessageId,
        {
            readonly store: AnyOutboundNonDeletedMessageModelStore;
            readonly unsubscribe: StoreUnsubscriber;
        }
    >();

    /** Number of stores that are currently held. Exposed so tests can prove nothing leaks. */
    public get pinnedCount(): u53 {
        return this._pins.size;
    }

    /**
     * Show {@link issue} on the message (`undefined` clears it) and hold or release its store
     * accordingly.
     */
    public show(
        store: AnyOutboundNonDeletedMessageModelStore,
        issue: OutgoingUploadIssue | undefined,
    ): void {
        const {controller, view} = store.get();
        controller.setUploadIssue(issue);
        const id = view.id;
        if (issue === undefined) {
            this.release(id);
            return;
        }
        if (this._pins.get(id)?.store === store) {
            return;
        }
        this.release(id);
        if (!controller.lifetimeGuard.active.get()) {
            // Already removed: nothing to show, nothing to keep.
            return;
        }
        const unsubscribe = controller.lifetimeGuard.active.subscribe((active) => {
            if (!active) {
                this.release(id);
            }
        });
        this._pins.set(id, {store, unsubscribe});
    }

    /**
     * Clear a "waiting to retry" hint and let go of the store, if the message shows one. A terminal
     * failure is NOT touched: it stays shown (and held) for as long as the message exists.
     */
    public clearWaiting(messageId: MessageId): void {
        const pin = this._pins.get(messageId);
        if (pin === undefined) {
            return;
        }
        const {controller, view} = pin.store.get();
        if (view.uploadIssue?.kind !== 'waiting') {
            return;
        }
        if (controller.lifetimeGuard.active.get()) {
            controller.setUploadIssue(undefined);
        }
        this.release(messageId);
    }

    /** Let go of the store of a message, if held. */
    public release(messageId: MessageId): void {
        const pin = this._pins.get(messageId);
        if (pin === undefined) {
            return;
        }
        this._pins.delete(messageId);
        pin.unsubscribe();
    }
}

const PINS = new WeakMap<BlobBackend, UploadIssuePins>();

/**
 * Get the {@link UploadIssuePins} of a backend (created on first use), keyed by its blob backend
 * like the upload coordinator and the preparation lane.
 */
export function getUploadIssuePins(blob: BlobBackend): UploadIssuePins {
    let pins = PINS.get(blob);
    if (pins === undefined) {
        pins = new UploadIssuePins();
        PINS.set(blob, pins);
    }
    return pins;
}
