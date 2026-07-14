import {i18n} from '~/app/ui/i18n';
import type {DbReceiverLookup} from '~/common/db';
import type {ActiveConversationViewport} from '~/common/dom/ui/active-conversation-viewport';
import {appVisibility} from '~/common/dom/ui/state';
import {requestShowWindow} from '~/common/dom/ui/window-restore';
import {TRANSFER_HANDLER} from '~/common/index';
import type {MessageId} from '~/common/network/types';
import type {
    CustomNotification,
    DeletedMessageNotification,
    ExtendedNotificationOptions,
    GroupCallStartNotification,
    NotificationCreator,
    NotificationHandle,
    NotificationTag,
    ReactionNotification,
} from '~/common/notification';
import {unreachable} from '~/common/utils/assert';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

class ProxyNotification extends Notification {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public aboutToBeReplaced: boolean = false;

    public constructor(
        title: string,
        options: ExtendedNotificationOptions,
        // This identifier can be used to check which message was last shown in the notification,
        // this allows updating edited message iff the message edited was the message last shown.
        public readonly lastNotificationIdentifier: string,
        private readonly _closeHandler: (notification: ProxyNotification) => void,
    ) {
        super(title, options);
    }

    public registerOnCloseHandler(): void {
        this.addEventListener('close', this._onCloseHandler.bind(this));
    }

    private _onCloseHandler(event: Event): void {
        this._closeHandler(this);
    }
}

/**
 * Generic "open a conversation at a specific message" navigation, invoked when a notification that
 * targets a message is clicked. Implemented in the app shell via the router (F1Whisper fork); built
 * generically so any notification type can reuse it.
 */
export type NotificationNavigator = (target: {
    readonly receiverLookup: DbReceiverLookup;
    readonly messageId: MessageId;
}) => void;

/**
 * Returns a snapshot of the currently-open conversation and the set of message IDs visible in its
 * viewport, or `undefined` if no conversation is open. Used to make reaction-notification
 * suppression viewport-aware (F1Whisper fork).
 */
export type ActiveConversationViewportGetter = () => ActiveConversationViewport | undefined;

export class FrontendNotificationCreator implements NotificationCreator {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _notifications = new Map<NotificationTag, ProxyNotification>();

    public constructor(
        private readonly _navigator?: NotificationNavigator,
        private readonly _getActiveConversationViewport?: ActiveConversationViewportGetter,
    ) {
        // Clear all notifications on 'focus' event.
        //
        // Note: Only one instance of a `FrontendNotificationCreator` should exist for the lifetime
        //       of the app, so we don't need to unsubscribe from the store.
        //
        // TODO(DESK-1081): Move the subscription out of this constructor, e.g. into `globals` to
        // remove the singleton smell.
        appVisibility.subscribe((visibility) => {
            if (visibility === 'focused') {
                for (const notification of this._notifications.values()) {
                    notification.close();
                }
                this._notifications.clear();
            }
        });
    }

    public create(
        notification: Exclude<CustomNotification, DeletedMessageNotification>,
    ): NotificationHandle | undefined {
        const {options, identifier} = notification;
        const {tag} = options;

        // Decide whether to suppress while the window is focused.
        //
        // For reactions (F1Whisper fork), suppression is viewport-aware: a reaction is only
        // suppressed when the reacted message is actually visible in the currently-open
        // conversation. If the message has scrolled off-screen (or a different / no conversation is
        // open), the notification is shown even while focused, so the user notices reactions on
        // older messages.
        //
        // For all other notification types, keep the original window-focus-only behaviour.
        if (options.creator.ignore === 'if-focused' && appVisibility.get() === 'focused') {
            if (notification.type === 'reaction') {
                if (this._isReactedMessageVisible(notification.navigateTo)) {
                    return undefined;
                }
            } else {
                return undefined;
            }
        }

        // Explicitly close a notification with this tag so it doesn't stick around in notification
        // centers (even after the app is opened).
        this._notifications.get(tag)?.close();

        // Create notification
        let proxyNotification: ProxyNotification;
        switch (notification.type) {
            case 'generic': {
                proxyNotification = new ProxyNotification(
                    notification.title,
                    options,
                    identifier,
                    this._registerOnCloseEventHandler.bind(this),
                );
                break;
            }

            case 'group-call-start':
                proxyNotification = new ProxyNotification(
                    notification.groupName,
                    {
                        ...options,
                        body: this._getGroupCallStartBody(notification.startedByContactName),
                    },
                    identifier,
                    this._registerOnCloseEventHandler.bind(this),
                );
                break;

            case 'new-message': {
                const replacedBody = this._replaceMentionAll(options.body);

                const title = this._getNewMessageTitle(
                    notification.unreadCount,
                    notification.receiverConversation,
                    notification.senderName,
                );
                proxyNotification = new ProxyNotification(
                    title,
                    {...options, body: replacedBody},
                    identifier,
                    this._registerOnCloseEventHandler.bind(this),
                );
                break;
            }

            case 'reaction': {
                proxyNotification = new ProxyNotification(
                    notification.receiverConversation,
                    {...options, body: this._getReactionBody(notification)},
                    identifier,
                    this._registerOnCloseEventHandler.bind(this),
                );
                // Clicking the reaction notification opens the conversation and scrolls to the
                // reacted-to message.
                this._registerNavigateOnClick(proxyNotification, notification.navigateTo);
                break;
            }

            default:
                return unreachable(notification);
        }
        this._notifications.set(tag, proxyNotification);
        proxyNotification.registerOnCloseHandler();
        this._registerRestoreWindowOnClick(proxyNotification);
        return proxyNotification;
    }

    public update(
        notification: Exclude<
            CustomNotification,
            GroupCallStartNotification | ReactionNotification
        >,
    ): NotificationHandle | undefined {
        const {options, identifier} = notification;
        const {tag} = options;

        // Check if we shouldn't show notifications if the application is focused
        if (options.creator.ignore === 'if-focused' && appVisibility.get() === 'focused') {
            return undefined;
        }
        const proxyNotification = this._notifications.get(tag);
        if (proxyNotification?.lastNotificationIdentifier === identifier) {
            // Since we get a new notification with the same (identifier, tag) tuple, we don't want
            // this tag to be deleted from the map. However, we close the notification anyway so
            // that it does not stick around.
            proxyNotification.aboutToBeReplaced = true;
            proxyNotification.close();
            let updatedNotification: ProxyNotification;
            switch (notification.type) {
                case 'generic': {
                    updatedNotification = new ProxyNotification(
                        notification.title,
                        options,
                        identifier,
                        this._registerOnCloseEventHandler.bind(this),
                    );
                    break;
                }

                case 'new-message': {
                    const replacedBody = this._replaceMentionAll(options.body);
                    const title = this._getNewMessageTitle(
                        notification.unreadCount,
                        notification.receiverConversation,
                        notification.senderName,
                    );
                    updatedNotification = new ProxyNotification(
                        title,
                        {...options, body: replacedBody},
                        identifier,
                        this._registerOnCloseEventHandler.bind(this),
                    );
                    break;
                }

                case 'deleted-message': {
                    const title = this._getNewMessageTitle(
                        notification.unreadCount,
                        notification.receiverConversation,
                        notification.senderName,
                    );
                    const body: string = i18n
                        .get()
                        .t(
                            'messaging.prose--notification-deleted-message',
                            'This message was deleted.',
                        );

                    updatedNotification = new ProxyNotification(
                        title,
                        {...options, body},
                        identifier,
                        this._registerOnCloseEventHandler.bind(this),
                    );

                    break;
                }

                default:
                    return unreachable(notification);
            }
            this._notifications.set(tag, updatedNotification);
            updatedNotification.registerOnCloseHandler();
            this._registerRestoreWindowOnClick(updatedNotification);
        }
        return this._notifications.get(tag);
    }

    private _getNewMessageTitle(
        unreadCount: number,
        recipientName: string,
        senderName: string | undefined,
    ): string {
        // In the rare case that `unreadCount` is 0, we just display it as if it were a normal new
        // notification. This can happen when a sender edits/deletes a message that was already read
        // on mobile.
        if (senderName === undefined) {
            return i18n
                .get()
                .t(
                    'messaging.prose--notification-title-single',
                    '{n, plural, =0 {New message} =1 {New message} other {{n} new messages}} from {recipientName}',
                    {
                        n: unreadCount.toString(),
                        recipientName,
                    },
                );
        }

        return i18n
            .get()
            .t(
                'messaging.prose--notification-title-group',
                '{n, plural, =0 {New message from {senderName}} =1 {New message from {senderName}} other {{n} new messages}} in group {recipientName}',
                {
                    n: unreadCount.toString(),
                    senderName,
                    recipientName,
                },
            );
    }

    private _getReactionBody(notification: ReactionNotification): string {
        const {emoji, reactorName, isGroup} = notification;

        // Private conversations suppress the emoji glyph; show a generic reaction body instead.
        if (emoji === '') {
            return i18n
                .get()
                .t('messaging.prose--notification-reaction-generic', 'Reacted to your message');
        }

        if (isGroup) {
            return i18n
                .get()
                .t(
                    'messaging.prose--notification-reaction-group',
                    '{reactorName} reacted with {emoji} to your message',
                    {reactorName, emoji},
                );
        }

        return i18n
            .get()
            .t('messaging.prose--notification-reaction', 'Reacted with {emoji} to your message', {
                emoji,
            });
    }

    private _getGroupCallStartBody(startedByContactName: string | undefined): string {
        if (startedByContactName === undefined) {
            return i18n
                .get()
                .t(
                    'messaging.prose--notification-group-call-start-body-generic',
                    'A group call started',
                );
        }

        return i18n
            .get()
            .t(
                'messaging.prose--notification-group-call-start-body',
                'A group call was started by {name}',
                {
                    name: startedByContactName,
                },
            );
    }

    private _replaceMentionAll(body: string | undefined): string | undefined {
        if (body === undefined) {
            return body;
        }
        return body.replaceAll('@[@@@@@@@@]', `@${i18n.get().t('messaging.label--mention-all')}`);
    }

    private _registerOnCloseEventHandler(notification: ProxyNotification): void {
        const tag = notification.tag as NotificationTag;
        if (
            this._notifications.get(tag)?.lastNotificationIdentifier ===
                notification.lastNotificationIdentifier &&
            !notification.aboutToBeReplaced
        ) {
            this._notifications.delete(tag);
        }
    }

    /**
     * Whether the reacted-to message is currently visible in the open conversation's viewport.
     *
     * Returns `true` only when the active conversation matches the reaction target AND the reacted
     * message is in the viewport's visible set. Returns `false` (i.e. "show the notification") when
     * no viewport getter was provided, no conversation is open, a different conversation is open, or
     * the message has scrolled off-screen.
     */
    private _isReactedMessageVisible(target: {
        readonly receiverLookup: DbReceiverLookup;
        readonly messageId: MessageId;
    }): boolean {
        const active = this._getActiveConversationViewport?.();
        if (active === undefined) {
            return false;
        }
        const sameConversation =
            active.receiverLookup.type === target.receiverLookup.type &&
            active.receiverLookup.uid === target.receiverLookup.uid;
        return sameConversation && active.visibleMessageIds.has(target.messageId);
    }

    /**
     * Make clicking a notification navigate to the target message. No-op if no navigator was
     * provided. Window restore/focus is handled by the universal click handler in `create()`.
     */
    private _registerNavigateOnClick(
        notification: ProxyNotification,
        target: {readonly receiverLookup: DbReceiverLookup; readonly messageId: MessageId},
    ): void {
        const navigator = this._navigator;
        if (navigator === undefined) {
            return;
        }
        notification.addEventListener('click', () => {
            navigator(target);
        });
    }

    /**
     * Restore the main window when the notification is clicked. The app closes to the system tray
     * (the window is hidden, not destroyed) on Windows/Linux, so a plain `window.focus()` cannot
     * un-hide it — we go through the main process via `requestShowWindow()`. Registered for every
     * notification (in both `create` and `update`); the reaction handler additionally navigates.
     */
    private _registerRestoreWindowOnClick(notification: ProxyNotification): void {
        notification.addEventListener('click', () => {
            requestShowWindow();
            window.focus();
        });
    }
}
