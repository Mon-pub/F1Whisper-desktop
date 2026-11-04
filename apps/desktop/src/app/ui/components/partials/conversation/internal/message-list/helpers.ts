import {TIMER} from '@threema/ts-utils/timer/global-timer';

import type {Reaction} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/internal/emoji-reactions-strip/props';
import type {Logger} from '~/common/logging';
import type {MessageId, StatusMessageId} from '~/common/network/types';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';
/**
 * This object tracks the messages currently visible in the viewport and debounces notifications
 * to the controller.
 */
export class Viewport {
    private static readonly _DEBOUNCE_MS = 100;

    private readonly _messages = new Set<MessageId | StatusMessageId>();

    private readonly _notifyController = TIMER.debounce(
        () => {
            // Note: The debounce timer cannot be cancelled, so a notification scheduled before this
            // instance was destroyed has to be dropped here instead.
            if (this._isDestroyed) {
                return;
            }

            this._setCurrentViewportMessagesHandler(new Set(this._messages)).catch(
                (error: unknown) =>
                    this._log.error(`Failed to set current viewport messages: ${error}`),
            );
        },
        Viewport._DEBOUNCE_MS,
        false,
    );

    private _isDestroyed = false;

    public constructor(
        private readonly _log: Logger,
        private readonly _setCurrentViewportMessagesHandler: (
            ids: Set<MessageId | StatusMessageId>,
        ) => Promise<unknown>,
        initiallyVisibleMessageId?: MessageId | StatusMessageId,
    ) {
        if (initiallyVisibleMessageId !== undefined) {
            this._setCurrentViewportMessagesHandler(new Set([initiallyVisibleMessageId])).catch(
                (error: unknown) =>
                    this._log.error(`Failed to set initial viewport message: ${error}`),
            );
        }
    }

    /**
     * Mark a message ID as visible in the viewport.
     */
    public addMessage(id: MessageId | StatusMessageId): void {
        if (this._isDestroyed) {
            return;
        }

        this._messages.add(id);
        this._notifyController();
    }

    /**
     * Remove a message ID from the visible messages in the viewport.
     */
    public deleteMessage(id: MessageId | StatusMessageId): void {
        if (this._isDestroyed) {
            return;
        }

        this._messages.delete(id);
        this._notifyController();
    }

    /**
     * Permanently deactivate this `Viewport`, so that it will not notify the controller anymore.
     */
    public destroy(): void {
        this._isDestroyed = true;
        this._messages.clear();
    }
}

/**
 * Returns whether the given `emoji` is contained in `messageEmojiReactions` as an outbound reaction
 * (i.e., a reaction from the user themself).
 */
export function hasOutboundEmojiReaction(
    emoji: SingleUnicodeEmoji,
    messageEmojiReactions: Reaction[],
): boolean {
    return (
        messageEmojiReactions.find(
            (reaction) => reaction.sender.type === 'self' && emoji === reaction.emoji,
        ) !== undefined
    );
}
