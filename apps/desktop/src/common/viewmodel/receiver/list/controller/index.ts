import {NACL_CONSTANTS} from '~/common/crypto';
import type {DbContactUid, DbGroupUid, DbReceiverLookup} from '~/common/db';
import {AcquaintanceLevel, ImageRenderingType, MessageDirection} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {ContactInit, GroupInit} from '~/common/model';
import type {
    AnyFileBasedMessageModelStore,
    AnyNonDeletedMessageModelStore,
    AnyTextMessageModelStore,
} from '~/common/model/types/message';
import type {CommonAudioMessageView} from '~/common/model/types/message/audio';
import type {CommonImageMessageView} from '~/common/model/types/message/image';
import type {CommonVideoMessageView} from '~/common/model/types/message/video';
import {ModelStore} from '~/common/model/utils/model-store';
import {validContactsLookupSteps} from '~/common/network/protocol/task/common/contact-helper';
import {randomMessageId} from '~/common/network/protocol/utils';
import type {IdentityString, MessageId} from '~/common/network/types';
import {wrapRawBlobKey} from '~/common/network/types/keys';
import type {ReadonlyUint8Array} from '~/common/types';
import {assert, assertUnreachable, unreachable} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';
import type {OutboundMessageInitFragment} from '~/common/viewmodel/conversation/main/controller/types';

export type ContactLookupResult =
    | {readonly type: 'me'}
    | {readonly type: 'invalid'}
    | {readonly type: 'exists-direct'}
    | {readonly type: 'exists-in-group'; readonly uid: DbContactUid}
    | {readonly type: 'new'; readonly contactInit: ContactInit};

export interface IReceiverListViewModelController extends ProxyMarked {
    /**
     * Lookup a contact using the `directory` backend and the `work` backend.
     *
     * Returns `invalid` if the identity belongs to an invalid entity, `me` if the identity is the
     * user, `exists-direct/group` if the contact exists in the database already depending on its
     * acquaintance level, or all necessary information to create the contact.
     */
    readonly lookupContact: (identityString: Set<IdentityString>) => Promise<ContactLookupResult[]>;

    /**
     * Update acquaintance level of a contact that exists.
     *
     * @throws if the contact does not exist.
     */
    readonly updateAcquaintanceLevelAndName: (
        uid: DbContactUid,
        nameUpdate: {readonly firstName: string; readonly lastName: string},
    ) => Promise<void>;

    /**
     * Create a contact.
     *
     * Returns the uid if the contact was successfully created, `race` if it has already been
     * created by a synced device before, i.e if there was a race.
     */
    readonly createContact: (contactInit: ContactInit) => Promise<DbContactUid | 'race'>;

    /**
     * Create a group.
     *
     * Returns the uid if the group was successfully created, and undefined if the group could not
     * be created.
     */
    readonly createGroup: (
        groupInit: Pick<GroupInit, 'name'>,
        members: ReadonlySet<DbContactUid>,
        profilePictureBytes: ReadonlyUint8Array | undefined,
    ) => Promise<DbGroupUid | undefined>;

    /**
     * Forward a supported message to a list of receivers.
     *
     * Polls and deleted messages are not supported.
     *
     * @throws If the message does not exist in the conversation provided by the receiver lookup or
     * if a {@link FileStorageError} occurred. Furthermore, this function throws when trying to
     * forward a file that was not yet downloaded from the server.
     */
    readonly forwardMessage: (
        messageToForward: {readonly messageId: MessageId; readonly lookup: DbReceiverLookup},
        receivers: readonly DbReceiverLookup[],
    ) => Promise<void>;
}

export class ReceiverListViewModelController implements IReceiverListViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    private readonly _log: Logger;

    public constructor(private readonly _services: ServicesForViewModel) {
        this._log = this._services.logging.logger('viewmodel.receiver.list');
    }

    /** @inheritdoc */
    public async lookupContact(
        identityStrings: Set<IdentityString>,
    ): Promise<ContactLookupResult[]> {
        const lookupStepsResult = await validContactsLookupSteps(
            this._services,
            identityStrings,
            this._log,
        );

        return Array.from(identityStrings).map((identity) => {
            const lookupResult = lookupStepsResult.get(identity);
            assert(lookupResult !== undefined);

            if (lookupResult instanceof ModelStore) {
                return lookupResult.get().view.acquaintanceLevel === AcquaintanceLevel.DIRECT
                    ? {type: 'exists-direct'}
                    : {type: 'exists-in-group', uid: lookupResult.ctx};
            }
            if (lookupResult === 'invalid' || lookupResult === 'me') {
                return {type: lookupResult};
            }
            return {
                type: 'new',
                contactInit: {
                    ...lookupResult,
                    acquaintanceLevel: AcquaintanceLevel.DIRECT,
                    nickname: undefined,
                },
            };
        });
    }

    /** @inheritdoc */
    public async updateAcquaintanceLevelAndName(
        uid: DbContactUid,
        nameUpdate: {readonly firstName: string; readonly lastName: string},
    ): Promise<void> {
        const contactModelStore = this._services.model.contacts.getByUid(uid);
        assert(contactModelStore !== undefined, 'ContactModelStore must exist when updating it');
        await contactModelStore.get().controller.update.fromLocal({
            ...nameUpdate,
            acquaintanceLevel: AcquaintanceLevel.DIRECT,
        });
    }

    /** @inheritdoc */
    public async createContact(contactInit: ContactInit): Promise<DbContactUid | 'race'> {
        const {modelStore, existed} =
            await this._services.model.contacts.add.fromLocal(contactInit);
        return existed ? 'race' : modelStore.ctx;
    }

    public async createGroup(
        groupInit: Pick<GroupInit, 'name'>,
        members: ReadonlySet<DbContactUid>,
        profilePictureBytes: ReadonlyUint8Array | undefined,
    ): Promise<DbGroupUid | undefined> {
        const memberContacts = [];
        for (const member of members) {
            const contact = this._services.model.contacts.getByUid(member);
            assert(contact !== undefined, 'Contact must exist');
            memberContacts.push(contact);
        }
        const group = await this._services.model.groups.add.fromLocal(
            groupInit,
            memberContacts,
            profilePictureBytes,
        );
        return group?.ctx;
    }

    /** @inheritdoc */
    public async forwardMessage(
        messageToForward: {readonly messageId: MessageId; readonly lookup: DbReceiverLookup},
        receivers: readonly DbReceiverLookup[],
    ): Promise<void> {
        const conversation = this._services.model.conversations.getForReceiver(
            messageToForward.lookup,
        );
        assert(conversation !== undefined, 'Conversation must exist');

        const message = conversation.get().controller.getMessage(messageToForward.messageId);

        assert(message !== undefined, 'Message must exist in the given conversation');

        assert(
            message.type !== 'poll' && message.type !== 'deleted',
            'Deleted messages and polls cannot be forwarded',
        );

        const promises: Promise<AnyNonDeletedMessageModelStore>[] = [];
        for (const lookup of receivers) {
            const conversationToForwardTo =
                this._services.model.conversations.getForReceiver(lookup);
            assert(conversationToForwardTo !== undefined, 'Conversation to forward to must exist');
            const messageInitFragment = this._generateNewMessage(message);
            const promise = conversationToForwardTo
                .get()
                .controller.addMessage.fromLocal({
                    ...messageInitFragment,
                    createdAt: new Date(),
                    id: randomMessageId(this._services.crypto),
                    direction: MessageDirection.OUTBOUND,
                })
                .catch(assertUnreachable);

            promises.push(promise);
        }

        await Promise.all(promises);
    }

    private _generateNewMessage(
        originalMessage: AnyTextMessageModelStore | AnyFileBasedMessageModelStore,
    ): OutboundMessageInitFragment {
        if (originalMessage.type === 'text') {
            const {view} = originalMessage.get();
            return {
                text: view.text,
                type: 'text',
            };
        }

        const {view} = originalMessage.get();

        let messageType;
        switch (originalMessage.type) {
            case 'file':
                messageType = 'file' as const;
                break;
            case 'image':
                messageType = 'image' as const;
                break;
            case 'video':
                messageType = 'video' as const;
                break;
            case 'audio':
                messageType = 'audio' as const;
                break;
            default:
                unreachable(originalMessage);
        }

        // Generate random blob encryption key for the blobs (which will be encrypted and
        // uploaded by the outgoing conversation message task).
        const encryptionKey = wrapRawBlobKey(
            this._services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
        );

        const mediaMessageData = {
            fileName: view.fileName,
            encryptionKey,
            fileSize: view.fileSize,
            mediaType: view.mediaType,
            caption: view.caption,
            thumbnailMediaType: view.thumbnailMediaType,
            fileData: view.fileData,
            thumbnailFileData: view.thumbnailFileData,
        };

        switch (messageType) {
            case 'file':
                return {
                    ...mediaMessageData,
                    type: 'file',
                };
            case 'image':
                return {
                    ...mediaMessageData,
                    type: 'image',
                    renderingType: ImageRenderingType.REGULAR,
                    animated: false, // TODO(DESK-1115)
                    // Cast is fine since we know from above that this is an image.
                    dimensions: (view as CommonImageMessageView).dimensions,
                };
            case 'video':
                return {
                    ...mediaMessageData,
                    type: 'video',
                    dimensions: (view as CommonVideoMessageView).dimensions,
                    duration: (view as CommonVideoMessageView).duration,
                };
            case 'audio':
                return {
                    ...mediaMessageData,
                    type: 'audio',
                    duration: (view as CommonAudioMessageView).duration,
                };
            default:
                return unreachable(messageType);
        }
    }
}
