import type {
    DbAudioMessage,
    DbCreateMessage,
    DbMessageCommon,
    DbMessageFor,
    UidOf,
} from '~/common/db';
import {MessageDirection, MessageType} from '~/common/enum';
import {
    InboundBaseMessageModelController,
    markAudioListenOnceConsumed,
    OutboundBaseMessageModelController,
    updateFileBasedMessageCaption,
} from '~/common/model/message';
import {
    loadOrDownloadBlob,
    getFileMessageDataState,
    NO_SENDER,
    uploadBlobs,
    type UploadedBlobBytes,
} from '~/common/model/message/common';
import type {GuardedStoreHandle, ServicesForModel} from '~/common/model/types/common';
import type {Contact} from '~/common/model/types/contact';
import type {ConversationControllerHandle} from '~/common/model/types/conversation';
import type {
    AnyAudioMessageModelStore,
    BaseMessageView,
    CommonBaseMessageView,
    DirectedMessageFor,
    UnifiedEditMessage,
} from '~/common/model/types/message';
import type {
    CommonAudioMessageView,
    InboundAudioMessageBundle,
    InboundAudioMessageController,
    OutboundAudioMessageBundle,
    OutboundAudioMessageController,
} from '~/common/model/types/message/audio';
import {ModelStore} from '~/common/model/utils/model-store';
import {assert, unreachable} from '~/common/utils/assert';
import type {FileBytesAndMediaType} from '~/common/utils/file';
import {AsyncLock} from '~/common/utils/lock';

/**
 * Create and return an audio message in the database.
 */
export function createAudioMessage<TDirection extends MessageDirection>(
    services: ServicesForModel,
    common: Omit<DbMessageCommon<MessageType.AUDIO>, 'uid' | 'type' | 'ordinal'>,
    init: DirectedMessageFor<TDirection, MessageType.AUDIO, 'init'>,
): DbAudioMessage {
    const {db} = services;

    // Create audio message
    const message: DbCreateMessage<DbAudioMessage> = {
        ...common,
        ...init,
    };
    const uid = db.createAudioMessage(message);
    // Cast is ok here because we know this `uid` is an audio message
    return db.getMessageByUid(uid) as DbAudioMessage;
}

/**
 * Return a local model store for the specified audio message.
 */
export function getAudioMessageModelStore<TModelStore extends AnyAudioMessageModelStore>(
    services: ServicesForModel,
    conversation: ConversationControllerHandle,
    message: DbMessageFor<TModelStore['type']>,
    common: BaseMessageView<TModelStore['ctx']>,
    sender: ModelStore<Contact> | typeof NO_SENDER,
): TModelStore {
    const audio: Omit<CommonAudioMessageView, keyof CommonBaseMessageView> = {
        fileName: message.fileName,
        fileSize: message.fileSize,
        caption: message.caption,
        mediaType: message.mediaType,
        thumbnailMediaType: message.thumbnailMediaType,
        blobId: message.blobId,
        thumbnailBlobId: message.thumbnailBlobId,
        encryptionKey: message.encryptionKey,
        fileData: message.fileData,
        thumbnailFileData: message.thumbnailFileData,
        state: getFileMessageDataState(message),
        blobDownloadState: message.blobDownloadState,
        thumbnailBlobDownloadState: message.thumbnailBlobDownloadState,
        downloadFailureReason: message.downloadFailureReason,
        duration: message.duration,
        listenOnce: message.listenOnce,
        listenOnceConsumed: message.listenOnceConsumed,
    };
    switch (common.direction) {
        case MessageDirection.INBOUND: {
            assert(
                sender !== NO_SENDER,
                `Expected sender of inbound ${message.type} message ${message.uid} to exist`,
            );
            return new InboundAudioMessageModelStore(
                services,
                {...common, ...audio},
                message.uid,
                conversation,
                sender,
            ) as TModelStore; // Trivially true as common.direction === TModelStore['ctx']
        }
        case MessageDirection.OUTBOUND: {
            return new OutboundAudioMessageModelStore(
                services,
                {...common, ...audio},
                message.uid,
                conversation,
            ) as TModelStore; // Trivially true as common.direction === TModelStore['ctx']
        }
        default:
            return unreachable(common);
    }
}

/**
 * Controller for inbound file messages.
 */
export class InboundAudioMessageModelController
    extends InboundBaseMessageModelController<InboundAudioMessageBundle['view']>
    implements InboundAudioMessageController
{
    private readonly _blobLock = new AsyncLock();

    /** @inheritdoc */
    public async blob(): Promise<FileBytesAndMediaType> {
        // F1Whisper fork (listen-once defense-in-depth): once a listen-once voice message has been
        // consumed (burned), refuse to re-fetch its blob so it can never be replayed.
        if (this.lifetimeGuard.run((handle) => handle.view().listenOnceConsumed === true)) {
            throw new Error('Cannot fetch blob of a consumed listen-once audio message');
        }
        const blob = await loadOrDownloadBlob(
            'main',
            MessageType.AUDIO,
            this._sender.ctx,
            this.uid,
            this._conversation,
            this._services,
            this.lifetimeGuard,
            this._blobLock,
            this._log,
        );
        return blob.data;
    }

    /** @inheritdoc */
    public markListenOnceConsumed(): void {
        this.lifetimeGuard.run((handle) => {
            const view = handle.view();
            // No-op for non-listen-once or already-burned messages (idempotent).
            if (view.listenOnce !== true || view.listenOnceConsumed === true) {
                return;
            }
            markAudioListenOnceConsumed(
                this._services,
                this._log,
                this._conversation.uid,
                this.uid,
            );
            handle.update(
                () =>
                    ({
                        listenOnceConsumed: true,
                        // Mirror the model-side burn: both the blob and its pointer are gone, so the
                        // file-sync state is terminal `'failed'`. This suppresses the download
                        // overlay (`isUnsyncedOrSyncingFile` is false for `'failed'`) and the audio
                        // player's re-fetch attempt; the bubble collapses to a localized note.
                        fileData: undefined,
                        blobId: undefined,
                        state: 'failed',
                    }) as Partial<InboundAudioMessageBundle['view']>,
            );
        });
    }

    /** @inheritdoc */
    protected override _editMessage(
        message: GuardedStoreHandle<InboundAudioMessageBundle['view']>,
        editedMessage: UnifiedEditMessage,
    ): void {
        message.update((view) =>
            updateFileBasedMessageCaption(
                this._services,
                MessageType.AUDIO,
                this.uid,
                view,
                editedMessage,
            ),
        );
    }
}

/**
 * Controller for outbound audio messages.
 */
export class OutboundAudioMessageModelController
    extends OutboundBaseMessageModelController<OutboundAudioMessageBundle['view']>
    implements OutboundAudioMessageController
{
    private readonly _blobLock = new AsyncLock();

    /** @inheritdoc */
    public async blob(): Promise<FileBytesAndMediaType> {
        const blob = await loadOrDownloadBlob(
            'main',
            MessageType.AUDIO,
            'me',
            this.uid,
            this._conversation,
            this._services,
            this.lifetimeGuard,
            this._blobLock,
            this._log,
        );
        return blob.data;
    }

    /**
     * F1Whisper fork (listen-once enforcement): burn an outbound listen-once voice message once it
     * has been sent. Mirrors Android's `burnOutgoingListenOnceIfNeeded` (which fires on
     * sent/delivered/read): the sender keeps no replayable copy of a listen-once message it sent.
     *
     * Runs after the base `sent()` bookkeeping. Idempotent and a no-op for non-listen-once or
     * already-consumed messages (matching the inbound guard). Local-only — touches no wire metadata.
     */
    public override sent(sentAt: Date): void {
        super.sent(sentAt);
        this.lifetimeGuard.run((handle) => {
            const view = handle.view();
            if (view.listenOnce !== true || view.listenOnceConsumed === true) {
                return;
            }
            markAudioListenOnceConsumed(
                this._services,
                this._log,
                this._conversation.uid,
                this.uid,
            );
            handle.update(
                () =>
                    ({
                        listenOnceConsumed: true,
                        fileData: undefined,
                        blobId: undefined,
                        state: 'failed',
                    }) as Partial<OutboundAudioMessageBundle['view']>,
            );
        });
    }

    /** @inheritdoc */
    public async uploadBlobs(): Promise<UploadedBlobBytes> {
        const uploadedBlob = await uploadBlobs(
            MessageType.AUDIO,
            this.uid,
            this._conversation,
            this._services,
            this.lifetimeGuard,
        );

        return uploadedBlob;
    }

    /** @inheritdoc */
    protected override _editMessage(
        message: GuardedStoreHandle<OutboundAudioMessageBundle['view']>,
        editedMessage: UnifiedEditMessage,
    ): void {
        message.update((view) =>
            updateFileBasedMessageCaption(
                this._services,
                MessageType.AUDIO,
                this.uid,
                view,
                editedMessage,
            ),
        );
    }
}

export class InboundAudioMessageModelStore extends ModelStore<InboundAudioMessageBundle['model']> {
    public constructor(
        services: ServicesForModel,
        view: InboundAudioMessageBundle['view'],
        uid: UidOf<DbAudioMessage>,
        conversation: ConversationControllerHandle,
        sender: ModelStore<Contact>,
    ) {
        const {logging} = services;
        const tag = `message.inbound.audio.${uid}`;
        super(
            view,
            new InboundAudioMessageModelController(
                services,
                uid,
                MessageType.AUDIO,
                conversation,
                sender,
            ),
            MessageDirection.INBOUND,
            MessageType.AUDIO,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}

export class OutboundAudioMessageModelStore extends ModelStore<
    OutboundAudioMessageBundle['model']
> {
    public constructor(
        services: ServicesForModel,
        view: OutboundAudioMessageBundle['view'],
        uid: UidOf<DbAudioMessage>,
        conversation: ConversationControllerHandle,
    ) {
        const {logging} = services;
        const tag = `message.outbound.audio.${uid}`;
        super(
            view,
            new OutboundAudioMessageModelController(services, uid, MessageType.AUDIO, conversation),
            MessageDirection.OUTBOUND,
            MessageType.AUDIO,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}
