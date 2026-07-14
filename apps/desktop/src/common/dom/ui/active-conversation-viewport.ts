import type {DbReceiverLookup} from '~/common/db';
import type {MessageId} from '~/common/network/types';
import {WritableStore} from '~/common/utils/store';

/**
 * Snapshot of the conversation that is currently open in the UI, together with the set of message
 * IDs that are currently visible in its viewport.
 *
 * F1Whisper fork: used to make reaction-notification suppression viewport-aware. A reaction is only
 * suppressed (no notification) when its message is actually on screen in the open conversation; if
 * the reacted message has scrolled off-screen, the notification is shown even while the window is
 * focused.
 */
export interface ActiveConversationViewport {
    readonly receiverLookup: DbReceiverLookup;
    readonly visibleMessageIds: ReadonlySet<MessageId>;
}

/**
 * Renderer-global store of the currently-open conversation's viewport.
 *
 * `undefined` when no conversation is open (e.g. the welcome screen or settings).
 */
export const activeConversationViewport = new WritableStore<ActiveConversationViewport | undefined>(
    undefined,
);
