import {NonceScope} from '@threema/protocol/enum';
import type {MessageWithMetadataBoxLike} from '@threema/protocol/structbuf/csp/payload';
import type {ByteLengthEncoder} from '@threema/ts-utils/byte/byte-encoder';
import {byteJoin} from '@threema/ts-utils/byte/byte-join';
import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import {UTF8} from '@threema/ts-utils/codec/utf8';
import type {f64} from '@threema/ts-utils/float/f64';
import type {u53} from '@threema/ts-utils/integer/u53';
import type {u8} from '@threema/ts-utils/integer/u8';
import {tag} from '@threema/ts-utils/meta/newtype';
import {dateToUnixTimestampMs} from '@threema/ts-utils/number/date-to-unix-timestamp-ms';
import {dateToUnixTimestampS} from '@threema/ts-utils/number/date-to-unix-timestamp-s';
import {intoUnsignedLong} from '@threema/ts-utils/number/into-unsigned-long';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';
import {stub} from 'sinon';

import type {ServicesForBackend} from '~/common/backend';
import {
    ensureNonce,
    NACL_CONSTANTS,
    NONCE_UNGUARDED_SCOPE,
    type Nonce,
    type PlainData,
} from '~/common/crypto';
import {CREATE_BUFFER_TOKEN} from '~/common/crypto/box';
import {deriveMessageMetadataKey} from '~/common/crypto/csp-keys';
import {hashNonce} from '~/common/crypto/nonce';
import {
    AcquaintanceLevel,
    CspE2eContactControlType,
    CspE2eConversationType,
    CspE2eDeliveryReceiptStatus,
    CspE2eGroupControlType,
    CspE2eGroupConversationType,
    CspE2eGroupStatusUpdateType,
    CspE2eMessageReactionType,
    CspE2eMessageUpdateType,
    CspE2eStatusUpdateType,
    CloseCode,
    ConnectionState,
    D2dProtocolVersion,
    MessageDirection,
    MessageFilterInstruction,
    MessageType,
    O2oCallAnswerAction,
    ReceiverType,
    StatusMessageType,
    TransactionScope,
    UnknownContactPolicy,
} from '~/common/enum';
import {F1MessageMetadata} from '~/common/internal-protobuf/f1-message-metadata';
import type {Contact, Conversation} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
import type {AnyTextMessageModelStore, DirectedMessageFor} from '~/common/model/types/message';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {CloseInfo} from '~/common/network';
import * as protobuf from '~/common/network/protobuf';
import {CspPayloadType, D2mPayloadType} from '~/common/network/protocol';
import type {BlobId} from '~/common/network/protocol/blob';
import {
    type CallOfferPayload,
    encodeCallAnswer,
    encodeCallOffer,
} from '~/common/network/protocol/call/o2o-call-signaling';
import {
    BLOB_FILE_NONCE,
    BLOB_THUMBNAIL_NONCE,
    MESSAGE_DATA_PADDING_LENGTH_MIN,
} from '~/common/network/protocol/constants';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import type {
    ActiveTaskCodecHandle,
    PassiveTaskCodecHandle,
    TaskController,
} from '~/common/network/protocol/task';
import {IncomingGroupNameTask} from '~/common/network/protocol/task/csp/group-sync/incoming-group-name';
import {IncomingCallOfferTask} from '~/common/network/protocol/task/csp/incoming-call-offer';
import {IncomingMessageTask} from '~/common/network/protocol/task/csp/incoming-message';
import {OutgoingGroupReceiptToSenderTask} from '~/common/network/protocol/task/csp/outgoing-group-receipt-to-sender';
import {ReflectedIncomingMessageTask} from '~/common/network/protocol/task/d2d/reflected-incoming-message';
import type {ConnectedTaskManager} from '~/common/network/protocol/task/manager';
import {randomCallId, randomGroupId, randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import {encodeDisappearingTimer} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import type {FileRenderingType} from '~/common/network/structbuf/validate/csp/e2e/file';
import {encodeGroupTyping} from '~/common/network/structbuf/validate/csp/e2e/group-typing';
import {
    ensureIdentityString,
    ensureD2mDeviceId,
    ensureMessageId,
    ensureNickname,
    type EmojiReaction,
    type GroupId,
    type IdentityString,
    type MessageId,
    type Nickname,
} from '~/common/network/types';
import type {RawBlobKey} from '~/common/network/types/keys';
import type {Dimensions} from '~/common/types';
import {assert, unreachable, unwrap} from '~/common/utils/assert';
import {Identity} from '~/common/utils/identity';
import {hasPropertyStrict} from '~/common/utils/object';
import {AbortRaiser} from '~/common/utils/signal';
import {
    addTestGroup,
    addTestUserAsContact,
    addTestUserToFakeDirectory,
    createClientKey,
    makeTestServices,
    type NetworkExpectation,
    NetworkExpectationFactory,
    TestHandle,
    TestNonceService,
    type TestServices,
    type TestUser,
} from '~/test/mocha/common/backend-mocks';
import {makeGroup, randomBlobKey} from '~/test/mocha/common/db-backend-tests';
import {
    decodeMessageEncodable,
    decryptContainer,
    reflectAndSendDeliveryReceipt,
    reflectAndSendGroupReceiptToSenderOnly,
    reflectAndSendGroupSyncRequest,
    reflectContactSync,
} from '~/test/mocha/common/network/protocol/task/task-test-helpers';

// eslint-disable-next-line turbo/no-undeclared-env-vars
const IS_CUSTOM_ONPREM = import.meta.env.BUILD_FLAVOR === 'custom-onprem';

/**
 * Create a message from {@link sender} to {@link receiver} and with the {@link innerPayload} used
 * as the inner payload of the legacy message.
 *
 * Certain message properties can be overridden using the {@link overrides}:
 *
 * - `messageId`: Sets the legacy message ID of the message. If not set, a random message ID is
 *   used.
 * - `nickname`: Sets the legacy nickname of the message. If not set, the nickname of the
 *   {@link sender} is used.
 * - `metadata.messageId`: Sets the message ID in the encrypted metadata. If not set, fall back to
 *   the legacy message ID.
 * - `metadata.nickname`: Sets the nickname in the encrypted metadata. If not set, fall back to the
 *   legacy nickname.
 * - `metadata.f1DisappearingTimer`: Sets the local field-100 overlay. Zero is present and explicit.
 */
function createMessage(
    services: ServicesForBackend,
    sender: TestUser,
    receiver: IdentityString,
    type: u8,
    innerPayload: ByteLengthEncoder,
    flags: CspMessageFlags,
    overrides?: {
        readonly messageId?: MessageId;
        readonly messageAndMetadataNonce?: Nonce;
        readonly nickname?: string | undefined;
        readonly metadataPlaintext?: PlainData;
        readonly metadata?: {
            readonly messageId?: MessageId;
            readonly nickname?: string | undefined;
            readonly f1DisappearingTimer?: u53;
        };
    },
): structbuf.csp.payload.MessageWithMetadataBoxLike {
    const {crypto, device} = services;
    const createdAt = new Date();

    const messageId = overrides?.messageId ?? randomMessageId(crypto);

    const legacyNickname =
        overrides !== undefined && hasPropertyStrict(overrides, 'nickname')
            ? overrides.nickname
            : sender.nickname;
    const metadataNickname =
        overrides?.metadata !== undefined && hasPropertyStrict(overrides.metadata, 'nickname')
            ? overrides.metadata.nickname
            : legacyNickname;

    const standardMetadataEncoder = protobuf.utils.encoder(protobuf.csp_e2e.MessageMetadata, {
        padding: new Uint8Array(0),
        nickname: metadataNickname,
        messageId: intoUnsignedLong(overrides?.metadata?.messageId ?? messageId),
        createdAt: intoUnsignedLong(dateToUnixTimestampMs(createdAt)),
    });
    const standardMetadata = standardMetadataEncoder.encode(
        new Uint8Array(standardMetadataEncoder.byteLength()),
    );
    const f1Metadata = F1MessageMetadata.encode({
        f1DisappearingTimer: overrides?.metadata?.f1DisappearingTimer,
    }).finish();
    const metadataPlaintext =
        overrides?.metadataPlaintext ?? (byteJoin(standardMetadata, f1Metadata) as PlainData);
    const metadataEncryptor = deriveMessageMetadataKey(
        {crypto, nonces: new TestNonceService()},
        device.csp.ck,
        sender.ck.public,
    ).encryptor(CREATE_BUFFER_TOKEN, metadataPlaintext);
    const [messageAndMetadataNonce, metadataContainer] =
        overrides?.messageAndMetadataNonce === undefined
            ? metadataEncryptor.encryptWithRandomNonce('incoming-message.spec.ts#createMessage')
            : ([
                  overrides.messageAndMetadataNonce,
                  metadataEncryptor.encryptWithDangerousUnguardedNonce(
                      overrides.messageAndMetadataNonce,
                  ),
              ] as const);
    const messageBox = device.csp.ck
        .getSharedBox(sender.ck.public)
        .encryptor(
            CREATE_BUFFER_TOKEN,
            structbuf.bridge.encoder(structbuf.csp.e2e.Container, {
                type,
                paddedData: structbuf.bridge.pkcs7PaddedEncoder(
                    crypto,
                    MESSAGE_DATA_PADDING_LENGTH_MIN,
                    innerPayload,
                ),
            }),
        )
        .encryptWithDangerousUnguardedNonce(messageAndMetadataNonce);
    return {
        senderIdentity: sender.identity.bytes,
        receiverIdentity: UTF8.encode(receiver),
        messageId,
        createdAt: dateToUnixTimestampS(createdAt),
        flags: flags.toBitmask(),
        reserved: 0x00,
        metadataLength: metadataContainer.byteLength,
        legacySenderNickname: UTF8.encode(legacyNickname ?? ''),
        metadataContainer,
        messageAndMetadataNonce,
        messageBox,
    };
}

/**
 * Get a incoming text message task from a specific user.
 *
 * @returns a task for an incoming message
 */
function createNewIncomingTextMessageTask(
    services: TestServices,
    user: TestUser,
    me: IdentityString,
    messageText = 'this is the secret message',
    messageId?: MessageId,
): IncomingMessageTask {
    const textMessage = createMessage(
        services,
        user,
        me,
        CspE2eConversationType.TEXT,
        structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
            text: UTF8.encode(messageText),
        }),
        CspMessageFlags.fromPartial({sendPushNotification: true}),
        {messageId},
    );

    return new IncomingMessageTask(services, textMessage);
}

/**
 * Get a incoming text message task from a specific user.
 *
 * @returns a task for an incoming message
 */
function createNewIncomingEmojiReactionTask(
    services: TestServices,
    user: TestUser,
    me: IdentityString,
    reactionMessageId: MessageId,
    mode: 'apply' | 'withdraw',
    emojiReaction: EmojiReaction,
): IncomingMessageTask {
    let messageEncoder;
    switch (mode) {
        case 'apply':
            messageEncoder = protobuf.utils.encoder(protobuf.csp_e2e.Reaction, {
                withdraw: undefined,
                apply: UTF8.encode(emojiReaction),
                messageId: intoUnsignedLong(reactionMessageId),
            });
            break;
        case 'withdraw':
            messageEncoder = protobuf.utils.encoder(protobuf.csp_e2e.Reaction, {
                withdraw: UTF8.encode(emojiReaction),
                apply: undefined,
                messageId: intoUnsignedLong(reactionMessageId),
            });
            break;
        default:
            unreachable(mode);
    }
    const reactionMessage = createMessage(
        services,
        user,
        me,
        CspE2eMessageReactionType.REACTION,
        messageEncoder,
        CspMessageFlags.fromPartial({sendPushNotification: false}),
        {messageId: randomMessageId(services.crypto)},
    );

    return new IncomingMessageTask(services, reactionMessage);
}

function createNewEditMessageTask(
    services: TestServices,
    user: TestUser,
    me: IdentityString,
    messageId: MessageId,
    messageText = 'This message was changed',
): IncomingMessageTask {
    const editMessage = createMessage(
        services,
        user,
        me,
        CspE2eMessageUpdateType.EDIT_MESSAGE,
        protobuf.utils.encoder(protobuf.csp_e2e.EditMessage, {
            text: messageText,
            messageId: intoUnsignedLong(messageId),
        }),
        CspMessageFlags.fromPartial({sendPushNotification: true}),
    );

    return new IncomingMessageTask(services, editMessage);
}

function createNewDeleteMessageTask(
    services: TestServices,
    user: TestUser,
    me: IdentityString,
    messageId: MessageId,
): IncomingMessageTask {
    const deleteMessage = createMessage(
        services,
        user,
        me,
        CspE2eMessageUpdateType.DELETE_MESSAGE,
        protobuf.utils.encoder(protobuf.csp_e2e.DeleteMessage, {
            messageId: intoUnsignedLong(messageId),
        }),
        CspMessageFlags.fromPartial({sendPushNotification: true}),
    );

    return new IncomingMessageTask(services, deleteMessage);
}

function createNewDeliveryReceiptMessageTask(
    services: TestServices,
    user: TestUser,
    me: IdentityString,
    messageId: MessageId,
    receipt: CspE2eDeliveryReceiptStatus,
): IncomingMessageTask {
    const deliveryReceiptMessage = createMessage(
        services,
        user,
        me,
        CspE2eStatusUpdateType.DELIVERY_RECEIPT,
        structbuf.bridge.encoder(structbuf.csp.e2e.DeliveryReceipt, {
            messageIds: [messageId],
            status: receipt,
        }),
        CspMessageFlags.fromPartial({sendPushNotification: true}),
    );

    return new IncomingMessageTask(services, deliveryReceiptMessage);
}

/**
 * Test incoming message task.
 */
export function run(): void {
    describe('IncomingMessageTask', function () {
        const me = ensureIdentityString('MEMEMEME');
        const user1 = {
            identity: new Identity(ensureIdentityString('USER0001')),
            nickname: 'user1' as Nickname,
            ck: createClientKey(),
        };
        const user2 = {
            identity: new Identity(ensureIdentityString('USER0002')),
            nickname: 'user2' as Nickname,
            ck: createClientKey(),
        };

        // Set up services and log printing
        let services: TestServices;
        this.beforeEach(function () {
            services = makeTestServices(me);
            // Make sure the tasks have no side effects
            services.persistentProtocolState.setLastUserProfileDistributionState(
                user1.identity.string,
                {
                    type: 'removed',
                },
                new Date(),
            );

            services.persistentProtocolState.setLastUserProfileDistributionState(
                user2.identity.string,
                {
                    type: 'removed',
                },
                new Date(),
            );
        });
        this.afterEach(function () {
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        describe('validation', function () {
            it('discard messages that appear to be sent by ourselves', async function () {
                const {device, model} = services;

                // Encode and encrypt message
                const message = createMessage(
                    services,
                    {
                        identity: new Identity(me),
                        ck: device.csp.ck,
                        nickname: 'me myself' as Nickname,
                    },
                    me,
                    CspE2eGroupControlType.GROUP_LEAVE,
                    structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                        text: UTF8.encode('hello from myself'),
                    }),
                    CspMessageFlags.none(),
                );

                // Run task
                const task = new IncomingMessageTask(services, message);
                const expectations: NetworkExpectation[] = [
                    // We expect the message to be dropped because it's invalid
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                // Ensure that no text message was created
                const contactForOwnIdentity = model.contacts.getByIdentity(me);
                expect(contactForOwnIdentity, 'Contact for own identity should not exist').to.be
                    .undefined;
            });

            it('discard messages where the message id of the metadata does not match', async function () {
                if (IS_CUSTOM_ONPREM) {
                    this.skip();
                }
                const {model} = services;

                // Add contacts
                const user1Contact = addTestUserAsContact(model, user1);

                // Get user conversation
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);

                // Encode and encrypt message
                const message = createMessage(
                    services,
                    {
                        identity: user1.identity,
                        ck: user1.ck,
                        nickname: 'some user' as Nickname,
                    },
                    me,
                    CspE2eConversationType.TEXT,
                    structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                        text: UTF8.encode('hi'),
                    }),
                    CspMessageFlags.none(),
                    {
                        messageId: ensureMessageId(123456n),
                        metadata: {
                            messageId: ensureMessageId(123457n),
                        },
                    },
                );

                // Run task
                const task = new IncomingMessageTask(services, message);
                const expectations: NetworkExpectation[] = [
                    // We expect the message to be dropped because the metadata message ID mismatches
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                // Ensure that no text message was created
                const contactForOwnIdentity = model.contacts.getByIdentity(me);
                expect(contactForOwnIdentity, 'Contact for own identity should not exist').to.be
                    .undefined;
            });

            it('discards authenticated malformed metadata outside custom-onprem', async function () {
                if (IS_CUSTOM_ONPREM) {
                    this.skip();
                }
                const {model} = services;
                const contact = addTestUserAsContact(model, user1);
                const conversation = contact.get().controller.conversation();
                assert(services.nonces instanceof TestNonceService);
                services.nonces.enablePersistence(
                    {
                        crypto: services.crypto,
                        db: services.model.db,
                        logging: services.logging,
                    },
                    services.device.identity,
                );
                const message = createMessage(
                    services,
                    user1,
                    me,
                    CspE2eConversationType.TEXT,
                    structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                        text: UTF8.encode('valid body'),
                    }),
                    CspMessageFlags.none(),
                    {metadataPlaintext: new Uint8Array([0xff]) as PlainData},
                );
                const nonceHash = hashNonce(
                    services.device.identity,
                    message.messageAndMetadataNonce as Nonce,
                );
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.write((outbound) => {
                        assert(outbound.type === D2mPayloadType.PROXY);
                        assert(outbound.payload.type === CspPayloadType.INCOMING_MESSAGE_ACK);
                        expect(services.model.db.hasNonce(NonceScope.CSP, nonceHash)).not.to.be
                            .undefined;
                    }),
                ]);

                await new IncomingMessageTask(services, message).run(handle);
                handle.finish();

                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);
            });
        });

        describe('per-message disappearing metadata ordering', function () {
            this.beforeEach(function () {
                if (!IS_CUSTOM_ONPREM) {
                    this.skip();
                }
            });

            function makeTextCopies(
                advertisedTimer?: u53,
                messageId = randomMessageId(services.crypto),
                metadataMessageId = messageId,
                messageAndMetadataNonce = ensureNonce(
                    services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH)),
                ),
                metadataPlaintext?: PlainData,
            ): {
                readonly csp: MessageWithMetadataBoxLike;
                readonly reflected: protobuf.d2d.IncomingMessage;
                readonly messageId: MessageId;
            } {
                const textEncoder = structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                    text: UTF8.encode(`timer-${String(advertisedTimer)}`),
                });
                const csp = createMessage(
                    services,
                    user1,
                    me,
                    CspE2eConversationType.TEXT,
                    textEncoder,
                    CspMessageFlags.fromPartial({dontSendDeliveryReceipts: true}),
                    {
                        messageId,
                        messageAndMetadataNonce,
                        metadata: {
                            messageId: metadataMessageId,
                            f1DisappearingTimer: advertisedTimer,
                        },
                        metadataPlaintext,
                    },
                );
                return {
                    csp,
                    messageId,
                    reflected: {
                        senderIdentity: user1.identity.string,
                        messageId: intoUnsignedLong(messageId),
                        createdAt: intoUnsignedLong(dateToUnixTimestampMs(new Date())),
                        type: CspE2eConversationType.TEXT,
                        body: textEncoder.encode(new Uint8Array(textEncoder.byteLength())),
                        nonce: csp.messageAndMetadataNonce,
                    },
                };
            }

            async function runReflected(
                reflected: protobuf.d2d.IncomingMessage,
                promotedToLeader = false,
            ): Promise<void> {
                const task = new ReflectedIncomingMessageTask(
                    services,
                    reflected,
                    ensureD2mDeviceId(42n),
                    new Date(),
                    D2dProtocolVersion.UNSPECIFIED,
                );
                const handle = new TestHandle(services, [], {promotedToLeader});
                await task.run(handle as PassiveTaskCodecHandle);
                handle.finish();
            }

            async function runDirect(
                csp: MessageWithMetadataBoxLike,
                promotedToLeader = false,
                beforeAck?: () => void,
            ): Promise<void> {
                const handle = new TestHandle(
                    services,
                    [
                        beforeAck === undefined
                            ? NetworkExpectationFactory.writeIncomingMessageAck()
                            : NetworkExpectationFactory.write((message) => {
                                  assert(message.type === D2mPayloadType.PROXY);
                                  assert(
                                      message.payload.type === CspPayloadType.INCOMING_MESSAGE_ACK,
                                  );
                                  beforeAck();
                              }),
                    ],
                    {promotedToLeader},
                );
                await new IncomingMessageTask(services, csp).run(handle);
                handle.finish();
            }

            function setupConversation(): {
                readonly contact: ModelStore<Contact>;
                readonly conversation: ModelStore<Conversation>;
            } {
                const contact = addTestUserAsContact(services.model, user1);
                const conversation = contact.get().controller.conversation();
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 300});
                return {contact, conversation};
            }

            function getInboundMessage(
                conversation: ModelStore<Conversation>,
                messageId: MessageId,
            ): AnyTextMessageModelStore {
                const message = conversation.get().controller.getMessage(messageId);
                assert(message?.ctx === MessageDirection.INBOUND);
                assert(message.type === MessageType.TEXT);
                return message;
            }

            function enablePersistentNonceTracking(): void {
                assert(services.nonces instanceof TestNonceService);
                services.nonces.enablePersistence(
                    {
                        crypto: services.crypto,
                        db: services.model.db,
                        logging: services.logging,
                    },
                    services.device.identity,
                );
            }

            function setupStaleMembershipGroupCopies(): {
                readonly conversation: ModelStore<Conversation>;
                readonly csp: MessageWithMetadataBoxLike;
                readonly messageId: MessageId;
                readonly reflected: protobuf.d2d.IncomingMessage;
                readonly senderContact: ModelStore<Contact>;
            } {
                enablePersistentNonceTracking();

                const creatorContact = addTestUserAsContact(services.model, user1);
                const senderContact = addTestUserAsContact(services.model, user2);
                const groupId = randomGroupId(services.crypto);
                const group = addTestGroup(services.model, {
                    creator: creatorContact,
                    groupId,
                    members: [creatorContact],
                    name: 'Stale membership group',
                });
                const conversation = group.get().controller.conversation();
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 300});

                const textEncoder = structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                    text: UTF8.encode('stale-membership timer race'),
                });
                const groupEncoder = structbuf.bridge.encoder(
                    structbuf.csp.e2e.GroupMemberContainer,
                    {
                        creatorIdentity: user1.identity.bytes,
                        groupId,
                        innerData: textEncoder,
                    },
                );
                const messageId = randomMessageId(services.crypto);
                const messageAndMetadataNonce = ensureNonce(
                    services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH)),
                );
                const csp = createMessage(
                    services,
                    user2,
                    me,
                    CspE2eGroupConversationType.GROUP_TEXT,
                    groupEncoder,
                    CspMessageFlags.fromPartial({dontSendDeliveryReceipts: true}),
                    {
                        messageAndMetadataNonce,
                        messageId,
                        metadata: {f1DisappearingTimer: 30},
                    },
                );

                return {
                    conversation,
                    csp,
                    messageId,
                    reflected: {
                        body: groupEncoder.encode(new Uint8Array(groupEncoder.byteLength())),
                        createdAt: intoUnsignedLong(dateToUnixTimestampMs(new Date())),
                        messageId: intoUnsignedLong(messageId),
                        nonce: messageAndMetadataNonce,
                        senderIdentity: user2.identity.string,
                        type: CspE2eGroupConversationType.GROUP_TEXT,
                    },
                    senderContact,
                };
            }

            async function withConnectedFollower(
                executor: (context: {
                    readonly connected: ConnectedTaskManager;
                    readonly controller: TaskController;
                    readonly promote: () => void;
                }) => Promise<void>,
            ): Promise<void> {
                const baseController = new TestHandle(services, [], {
                    promotedToLeader: false,
                }).controller;
                const promotedToLeader = new ResolvablePromise<void>({uncaught: 'default'});
                const controller: TaskController = {
                    ...baseController,
                    csp: {...baseController.csp, authenticated: ResolvablePromise.resolve()},
                    d2m: {
                        ...baseController.d2m,
                        authenticated: ResolvablePromise.resolve(),
                        promotedToLeader,
                    },
                };
                const connected = services.taskManager.replace(ConnectionState.CONNECTING);
                assert(connected !== undefined);
                const abort = new AbortRaiser<CloseInfo>();
                const protocolLoop = connected
                    .run(services, controller, abort)
                    .catch(() => undefined);
                try {
                    await executor({
                        connected,
                        controller,
                        promote: () => promotedToLeader.resolve(),
                    });
                } finally {
                    abort.raise({code: CloseCode.NORMAL, origin: 'local', reason: 'Test complete'});
                    await protocolLoop;
                }
            }

            async function consumeOutgoingReflection(
                connected: ConnectedTaskManager,
            ): Promise<number> {
                const queued = await connected.dispatch.encoder.get();
                assert(queued.value.type === D2mPayloadType.REFLECT);
                const encoder = queued.value.payload;
                const reflect = structbuf.d2m.payload.Reflect.decode(
                    encoder.encode(new Uint8Array(encoder.byteLength())),
                );
                queued.consume();
                return reflect.reflectId;
            }

            async function acknowledgeOutgoingReflection(
                connected: ConnectedTaskManager,
                reflectId: number,
            ): Promise<void> {
                const encoder = structbuf.bridge.encoder(structbuf.d2m.payload.ReflectAck, {
                    reflectId,
                    reserved: new Uint8Array(4),
                    timestamp: dateToUnixTimestampMs(new Date()),
                });
                await connected.dispatch.decoder.put({
                    type: D2mPayloadType.REFLECT_ACK,
                    payload: structbuf.d2m.payload.ReflectAck.decode(
                        encoder.encode(new Uint8Array(encoder.byteLength())),
                    ),
                });
            }

            async function consumeAndAcknowledgeGroupSyncRequest(
                connected: ConnectedTaskManager,
            ): Promise<void> {
                const queued = await connected.dispatch.encoder.get();
                assert(queued.value.type === D2mPayloadType.PROXY);
                assert(queued.value.payload.type === CspPayloadType.OUTGOING_MESSAGE);
                const outgoing = decodeMessageEncodable(queued.value.payload.payload);
                expect(outgoing.receiverIdentity).to.deep.equal(user1.identity.bytes);
                expect(
                    decryptContainer(outgoing, services.device.csp.ck.public, user1.ck).type,
                ).to.equal(CspE2eGroupControlType.GROUP_SYNC_REQUEST);
                queued.consume();

                const ackEncoder = structbuf.bridge.encoder(structbuf.csp.payload.MessageAck, {
                    identity: outgoing.receiverIdentity,
                    messageId: ensureMessageId(outgoing.messageId),
                });
                await connected.dispatch.decoder.put({
                    type: D2mPayloadType.PROXY,
                    payload: {
                        type: CspPayloadType.OUTGOING_MESSAGE_ACK,
                        payload: structbuf.csp.payload.MessageAck.decode(
                            ackEncoder.encode(new Uint8Array(ackEncoder.byteLength())),
                        ),
                    },
                });
            }

            async function consumeDirectAck(
                connected: ConnectedTaskManager,
                messageId: MessageId,
                beforeConsume?: () => void,
            ): Promise<void> {
                const queued = await connected.dispatch.encoder.get();
                assert(queued.value.type === D2mPayloadType.PROXY);
                assert(queued.value.payload.type === CspPayloadType.INCOMING_MESSAGE_ACK);
                const encoder = queued.value.payload.payload;
                const ack = structbuf.csp.payload.MessageAck.decode(
                    encoder.encode(new Uint8Array(encoder.byteLength())),
                );
                expect(ack.identity).to.deep.equal(user2.identity.bytes);
                expect(ack.messageId).to.equal(messageId);
                beforeConsume?.();
                queued.consume();
            }

            async function dispatchReflectedAndConsumeAck(
                connected: ConnectedTaskManager,
                controller: TaskController,
                reflected: protobuf.d2d.IncomingMessage,
                reflectedId: number,
            ): Promise<void> {
                const envelopeEncoder = protobuf.utils.encoder(protobuf.d2d.Envelope, {
                    outgoingMessage: undefined,
                    outgoingMessageUpdate: undefined,
                    incomingMessage: reflected as unknown as protobuf.utils.ProtobufInstanceOf<
                        typeof protobuf.d2d.IncomingMessage
                    >,
                    incomingMessageUpdate: undefined,
                    userProfileSync: undefined,
                    contactSync: undefined,
                    groupSync: undefined,
                    distributionListSync: undefined,
                    settingsSync: undefined,
                    mdmParameterSync: undefined,
                    deviceId: intoUnsignedLong(42n),
                    padding: new Uint8Array(),
                    protocolVersion: D2dProtocolVersion.UNSPECIFIED,
                });
                const envelopeNonce = ensureNonce(
                    services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH)),
                );
                const encryptedEnvelope = controller.d2d.dgrk
                    .encryptor(CREATE_BUFFER_TOKEN, envelopeEncoder)
                    .encryptWithDangerousUnguardedNonce(envelopeNonce);
                const reflectedEncoder = structbuf.bridge.encoder(structbuf.d2m.payload.Reflected, {
                    envelope: byteJoin(envelopeNonce, encryptedEnvelope),
                    flags: 0,
                    headerLength: 16,
                    reflectedId,
                    reserved: 0,
                    timestamp: dateToUnixTimestampMs(new Date()),
                });
                await connected.dispatch.decoder.put({
                    type: D2mPayloadType.REFLECTED,
                    payload: structbuf.d2m.payload.Reflected.decode(
                        reflectedEncoder.encode(new Uint8Array(reflectedEncoder.byteLength())),
                    ),
                });

                const reflectedAck = await connected.dispatch.encoder.get();
                expect(reflectedAck.value.type).to.equal(D2mPayloadType.REFLECTED_ACK);
                reflectedAck.consume();
            }

            it('keeps a follower reflection pending through read and promotion until positive metadata resolves', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(30);
                await runReflected(reflected);

                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.true;

                const readAt = new Date();
                await conversation.get().controller.read.fromLocal(readAt);
                expect(message.get().view.readAt).to.eql(readAt);
                expect(message.get().view.expireStartedAt).to.be.undefined;
                expect(message.get().view.expiresAt).to.be.undefined;

                await runDirect(csp, true);

                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.expireStartedAt).to.eql(readAt);
                expect(message.get().view.expiresAt).to.eql(new Date(readAt.getTime() + 30 * 1000));
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('keeps a direct-first row resolved when the matching reflection arrives later', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(30);

                await runDirect(csp);
                await runReflected(reflected);

                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('does not resurrect a processed direct message after local purge', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(30);
                const nonceHash = hashNonce(
                    services.device.identity,
                    csp.messageAndMetadataNonce as Nonce,
                );

                await runDirect(csp);
                expect(
                    services.model.db.hasIncomingMessageDiscardDisposition(
                        user1.identity.string,
                        messageId,
                        nonceHash,
                    ),
                ).to.be.true;
                const message = getInboundMessage(conversation, messageId);
                message
                    .get()
                    .controller.read.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        new Date(),
                    );
                conversation.get().controller.removeMessage.direct(messageId);

                await runReflected(reflected);

                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);
                expect(conversation.get().controller.getMessage(messageId)).to.be.undefined;
            });

            it('resolves a reflection inserted while direct contact synchronization is paused', async function () {
                const contact = addTestUserAsContact(services.model, {
                    ...user1,
                    nickname: ensureNickname('oldnick'),
                });
                const conversation = contact.get().controller.conversation();
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 300});
                const {csp, reflected, messageId} = makeTextCopies(30);
                const update = stub(contact.get().controller.update, 'fromRemote').callsFake(
                    async () => {
                        await runReflected(reflected);
                    },
                );

                try {
                    await runDirect(csp);
                } finally {
                    update.restore();
                }

                const message = getInboundMessage(conversation, messageId);
                expect(update.calledOnce).to.be.true;
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('resolves a reflected envelope that bypasses a paused direct TaskCodec read', async function () {
                const contact = addTestUserAsContact(services.model, {
                    ...user1,
                    nickname: ensureNickname('oldnick'),
                });
                const conversation = contact.get().controller.conversation();
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 300});
                const {csp, reflected, messageId} = makeTextCopies(30);
                const paused = new ResolvablePromise<void>({uncaught: 'default'});
                const baseController = new TestHandle(services, [], {
                    promotedToLeader: false,
                }).controller;
                const controller: TaskController = {
                    ...baseController,
                    csp: {
                        ...baseController.csp,
                        authenticated: ResolvablePromise.resolve(),
                    },
                    d2m: {
                        ...baseController.d2m,
                        authenticated: ResolvablePromise.resolve(),
                    },
                };
                const connected = services.taskManager.replace(ConnectionState.CONNECTING);
                assert(connected !== undefined);
                const abort = new AbortRaiser<CloseInfo>();
                const protocolLoop = connected
                    .run(services, controller, abort)
                    .catch(() => undefined);
                const update = stub(contact.get().controller.update, 'fromRemote').callsFake(
                    async (handle) => {
                        paused.resolve();
                        await handle.read(() => MessageFilterInstruction.ACCEPT);
                    },
                );

                try {
                    const direct = connected.schedule(new IncomingMessageTask(services, csp));
                    await paused;

                    const envelope = controller.d2d.dgrk
                        .encryptor(
                            CREATE_BUFFER_TOKEN,
                            protobuf.utils.encoder(protobuf.d2d.Envelope, {
                                outgoingMessage: undefined,
                                outgoingMessageUpdate: undefined,
                                incomingMessage:
                                    reflected as unknown as protobuf.utils.ProtobufInstanceOf<
                                        typeof protobuf.d2d.IncomingMessage
                                    >,
                                incomingMessageUpdate: undefined,
                                userProfileSync: undefined,
                                contactSync: undefined,
                                groupSync: undefined,
                                distributionListSync: undefined,
                                settingsSync: undefined,
                                mdmParameterSync: undefined,
                                deviceId: intoUnsignedLong(42n),
                                padding: new Uint8Array(),
                                protocolVersion: D2dProtocolVersion.UNSPECIFIED,
                            }),
                        )
                        .encryptWithRandomNonceAhead('incoming-message-race-test');
                    const reflectedEncoder = structbuf.bridge.encoder(
                        structbuf.d2m.payload.Reflected,
                        {
                            headerLength: 16,
                            reserved: 0,
                            flags: 0,
                            reflectedId: 1,
                            timestamp: dateToUnixTimestampMs(new Date()),
                            envelope,
                        },
                    );
                    await connected.dispatch.decoder.put({
                        type: D2mPayloadType.REFLECTED,
                        payload: structbuf.d2m.payload.Reflected.decode(
                            reflectedEncoder.encode(new Uint8Array(reflectedEncoder.byteLength())),
                        ),
                    });

                    const reflectedAck = await connected.dispatch.encoder.get();
                    expect(reflectedAck.value.type).to.equal(D2mPayloadType.REFLECTED_ACK);
                    reflectedAck.consume();
                    expect(
                        getInboundMessage(conversation, messageId).get().view
                            .remoteDisappearingTimerPending,
                    ).to.be.true;

                    const directEncoder = structbuf.bridge.encoder(
                        structbuf.csp.payload.MessageWithMetadataBox,
                        csp,
                    );
                    await connected.dispatch.decoder.put({
                        type: D2mPayloadType.PROXY,
                        payload: {
                            type: CspPayloadType.INCOMING_MESSAGE,
                            payload: structbuf.csp.payload.MessageWithMetadataBox.decode(
                                directEncoder.encode(new Uint8Array(directEncoder.byteLength())),
                            ),
                        },
                    });
                    const directAck = await connected.dispatch.encoder.get();
                    expect(directAck.value.type).to.equal(D2mPayloadType.PROXY);
                    directAck.consume();
                    await direct;
                } finally {
                    update.restore();
                    abort.raise({code: CloseCode.NORMAL, origin: 'local', reason: 'Test complete'});
                    await protocolLoop;
                }

                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('reconciles a follower reflection during a stale-membership discard', async function () {
                const {conversation, csp, messageId, reflected} = setupStaleMembershipGroupCopies();
                const readAt = new Date();

                await withConnectedFollower(async ({connected, controller}) => {
                    const direct = connected.schedule(new IncomingMessageTask(services, csp));

                    // The non-member path sends a group-sync-request and waits for its reflection
                    // ACK. Inject the matching phone reflection through the real TaskCodec bypass
                    // while the direct task still owns the runtime-only CSP nonce guard.
                    const groupSyncReflectId = await consumeOutgoingReflection(connected);
                    await dispatchReflectedAndConsumeAck(connected, controller, reflected, 101);

                    const pendingMessage = getInboundMessage(conversation, messageId);
                    expect(pendingMessage.get().view.disappearingTimerSeconds).to.equal(300);
                    expect(pendingMessage.get().view.remoteDisappearingTimerPending).to.be.true;
                    pendingMessage
                        .get()
                        .controller.read.fromSync(
                            undefined as unknown as PassiveTaskCodecHandle,
                            readAt,
                        );
                    expect(pendingMessage.get().view.readAt).to.eql(readAt);
                    expect(pendingMessage.get().view.expireStartedAt).to.be.undefined;
                    expect(pendingMessage.get().view.expiresAt).to.be.undefined;

                    await acknowledgeOutgoingReflection(connected, groupSyncReflectId);
                    await consumeAndAcknowledgeGroupSyncRequest(connected);
                    await consumeDirectAck(connected, messageId);
                    await direct;
                });

                const message = getInboundMessage(conversation, messageId);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.readAt).to.eql(readAt);
                expect(message.get().view.expireStartedAt).to.eql(readAt);
                expect(message.get().view.expiresAt).to.eql(new Date(readAt.getTime() + 30 * 1000));
            });

            it('does not insert an exact reflection after discard and later promotion', async function () {
                const {conversation, csp, messageId, reflected, senderContact} =
                    setupStaleMembershipGroupCopies();
                const nonceHash = hashNonce(
                    services.device.identity,
                    csp.messageAndMetadataNonce as Nonce,
                );

                await withConnectedFollower(async ({connected, controller, promote}) => {
                    const direct = connected.schedule(new IncomingMessageTask(services, csp));
                    const groupSyncReflectId = await consumeOutgoingReflection(connected);
                    await acknowledgeOutgoingReflection(connected, groupSyncReflectId);
                    await consumeAndAcknowledgeGroupSyncRequest(connected);
                    await consumeDirectAck(connected, messageId, () => {
                        expect(
                            services.model.db.hasIncomingMessageDiscardDisposition(
                                user2.identity.string,
                                messageId,
                                nonceHash,
                            ),
                            'exact disposition must exist when the direct ACK is handed off',
                        ).to.be.true;
                        expect(
                            services.model.db.hasNonce(NonceScope.CSP, nonceHash),
                            'generic nonce must exist when the direct ACK is handed off',
                        ).not.to.be.undefined;
                    });
                    await direct;

                    expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);

                    promote();
                    await dispatchReflectedAndConsumeAck(connected, controller, reflected, 102);
                });

                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);
                expect(conversation.get().controller.getMessage(messageId)).to.be.undefined;
                expect(
                    services.model.db.getPendingMessageByRemoteDisappearingTimerNonce(
                        senderContact.ctx,
                        messageId,
                        nonceHash,
                    ),
                ).to.be.undefined;
            });

            it('binds incoming-discard suppression to the exact sender, message, and nonce', async function () {
                const {conversation, csp, messageId, reflected} = setupStaleMembershipGroupCopies();
                const nonceHash = hashNonce(
                    services.device.identity,
                    csp.messageAndMetadataNonce as Nonce,
                );
                services.model.db.recordIncomingMessageDiscardDisposition(
                    user2.identity.string,
                    messageId,
                    nonceHash,
                );
                services.model.db.addNonce(NonceScope.CSP, nonceHash);

                await runReflected(reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);

                const differentMessageId = randomMessageId(services.crypto);
                await runReflected({
                    ...reflected,
                    messageId: intoUnsignedLong(differentMessageId),
                });
                const differentMessage = getInboundMessage(conversation, differentMessageId);
                expect(differentMessage.get().view.remoteDisappearingTimerPending).to.be.true;
                conversation.get().controller.removeMessage.direct(differentMessageId);

                await runReflected({
                    ...reflected,
                    senderIdentity: user1.identity.string,
                });
                const differentSender = getInboundMessage(conversation, messageId);
                expect(differentSender.get().view.remoteDisappearingTimerPending).to.be.true;
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('rechecks an exact discard disposition at the final reflected insertion boundary', async function () {
                const {conversation, csp, messageId, reflected} = setupStaleMembershipGroupCopies();
                const nonceHash = hashNonce(
                    services.device.identity,
                    csp.messageAndMetadataNonce as Nonce,
                );
                const conversationController = conversation.get().controller;
                const originalHasMessage =
                    conversationController.hasMessage.bind(conversationController);
                const hasMessage = stub(conversationController, 'hasMessage').callsFake((id) => {
                    const result = originalHasMessage(id);
                    services.model.db.recordIncomingMessageDiscardDisposition(
                        user2.identity.string,
                        messageId,
                        nonceHash,
                    );
                    return result;
                });

                try {
                    await runReflected(reflected);
                } finally {
                    hasMessage.restore();
                }

                expect(hasMessage.called).to.be.true;
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);
            });

            it('reconciles a replayed reflection whose nonce was already persisted', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const {csp, messageId, reflected} = makeTextCopies(30);
                await runReflected(reflected);
                conversation.get().controller.removeMessage.direct(messageId);

                await runReflected(reflected);
                const replayed = getInboundMessage(conversation, messageId);
                expect(replayed.get().view.disappearingTimerSeconds).to.equal(300);
                expect(replayed.get().view.remoteDisappearingTimerPending).to.be.true;
                const readAt = new Date();
                replayed
                    .get()
                    .controller.read.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        readAt,
                    );

                await runDirect(csp);

                expect(replayed.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(replayed.get().view.disappearingTimerSeconds).to.equal(30);
                expect(replayed.get().view.expireStartedAt).to.eql(readAt);
                expect(replayed.get().view.expiresAt).to.eql(
                    new Date(readAt.getTime() + 30 * 1000),
                );
            });

            it('reconciles a fresh reflection received after promotion', async function () {
                const {conversation} = setupConversation();
                const {csp, messageId, reflected} = makeTextCopies(30);
                await runReflected(reflected, true);

                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.true;
                const readAt = new Date();
                message
                    .get()
                    .controller.read.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        readAt,
                    );

                await runDirect(csp, true);

                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.expireStartedAt).to.eql(readAt);
                expect(message.get().view.expiresAt).to.eql(new Date(readAt.getTime() + 30 * 1000));
            });

            it('retains a valid direct body with fallback after mismatched metadata', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const messageId = randomMessageId(services.crypto);
                const nonce = ensureNonce(
                    services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH)),
                );
                const mismatched = makeTextCopies(
                    30,
                    messageId,
                    randomMessageId(services.crypto),
                    nonce,
                );
                await runDirect(mismatched.csp);
                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(
                    services.model.db.hasIncomingMessageDiscardDisposition(
                        user1.identity.string,
                        messageId,
                        hashNonce(services.device.identity, nonce),
                    ),
                ).to.be.true;

                await runReflected(mismatched.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
                expect(getInboundMessage(conversation, messageId)).to.equal(message);
            });

            it('retains a valid direct body with fallback after invalid metadata', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const invalid = makeTextCopies(30);

                await runDirect({
                    ...invalid.csp,
                    metadataContainer: services.crypto.randomBytes(
                        new Uint8Array(invalid.csp.metadataContainer.byteLength),
                    ),
                });

                const message = getInboundMessage(conversation, invalid.messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                await runReflected(invalid.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('commits the body nonce and suppresses replay after authenticated malformed metadata', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const malformed = makeTextCopies(
                    30,
                    undefined,
                    undefined,
                    undefined,
                    new Uint8Array([0xff]) as PlainData,
                );
                const nonceHash = hashNonce(
                    services.device.identity,
                    malformed.csp.messageAndMetadataNonce as Nonce,
                );

                await runDirect(malformed.csp, false, () => {
                    const message = getInboundMessage(conversation, malformed.messageId);
                    expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                    expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                    expect(
                        services.model.db.hasIncomingMessageDiscardDisposition(
                            user1.identity.string,
                            malformed.messageId,
                            nonceHash,
                        ),
                    ).to.be.true;
                    expect(
                        services.model.db.hasNonce(NonceScope.CSP, nonceHash),
                        'body nonce must be durable when the successful ACK is handed off',
                    ).not.to.be.undefined;
                });
                expect(services.model.db.hasNonce(NonceScope.CSP, nonceHash)).not.to.be.undefined;

                conversation.get().controller.removeMessage.direct(malformed.messageId);
                await runReflected(malformed.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);
            });

            it('commits the body nonce and suppresses replay when metadata is absent', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const missing = makeTextCopies(30);
                const csp = {
                    ...missing.csp,
                    metadataLength: 0,
                    metadataContainer: new Uint8Array(),
                };
                const nonceHash = hashNonce(
                    services.device.identity,
                    csp.messageAndMetadataNonce as Nonce,
                );

                await runDirect(csp, false, () => {
                    const message = getInboundMessage(conversation, missing.messageId);
                    expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                    expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                    expect(
                        services.model.db.hasIncomingMessageDiscardDisposition(
                            user1.identity.string,
                            missing.messageId,
                            nonceHash,
                        ),
                    ).to.be.true;
                });
                expect(services.model.db.hasNonce(NonceScope.CSP, nonceHash)).not.to.be.undefined;

                conversation.get().controller.removeMessage.direct(missing.messageId);
                await runReflected(missing.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);
            });

            it('rechecks when reflection wins after the direct duplicate boundary', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(30);
                const addMessageFromRemote = conversation.get().controller.addMessage.fromRemote;
                const addMessage = stub(
                    conversation.get().controller.addMessage,
                    'fromRemote',
                ).callsFake(async (handle, init) => {
                    await runReflected(reflected);
                    return await addMessageFromRemote(handle, init);
                });

                try {
                    await runDirect(csp);
                } finally {
                    addMessage.restore();
                }

                const message = getInboundMessage(conversation, messageId);
                expect(addMessage.calledOnce).to.be.true;
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('logs an absent field 100 as shared-field when fallback is enabled', async function () {
                const {conversation} = setupConversation();
                const {csp, messageId} = makeTextCopies();

                await runDirect(csp);

                expect(
                    getInboundMessage(conversation, messageId).get().view.disappearingTimerSeconds,
                ).to.equal(300);
                expect(
                    services.logging.hasLogLine(
                        `Disappearing: froze incoming message ${messageId} at 300s from shared-field`,
                    ),
                ).to.be.true;
                expect(
                    services.logging.hasLogLine(
                        `Disappearing: froze incoming message ${messageId} at 300s from metadata`,
                    ),
                ).to.be.false;
            });

            it('logs an absent field 100 as none when fallback is disabled', async function () {
                const {conversation} = setupConversation();
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 0});
                const {csp, messageId} = makeTextCopies();

                await runDirect(csp);

                expect(
                    getInboundMessage(conversation, messageId).get().view.disappearingTimerSeconds,
                ).to.equal(0);
                expect(
                    services.logging.hasLogLine(
                        `Disappearing: froze incoming message ${messageId} at 0s from none`,
                    ),
                ).to.be.true;
                expect(
                    services.logging.hasLogLine(
                        `Disappearing: froze incoming message ${messageId} at 0s from metadata`,
                    ),
                ).to.be.false;
            });

            it('resolves explicit zero by clearing expiry and consuming the marker', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(0);
                await runReflected(reflected);
                const message = getInboundMessage(conversation, messageId);
                const readAt = new Date();
                message
                    .get()
                    .controller.read.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        readAt,
                    );
                expect(message.get().view.expireStartedAt).to.be.undefined;
                expect(message.get().view.expiresAt).to.be.undefined;

                await runDirect(csp);

                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(message.get().view.disappearingTimerSeconds).to.equal(0);
                expect(message.get().view.readAt).to.eql(readAt);
                expect(message.get().view.expireStartedAt).to.be.undefined;
                expect(message.get().view.expiresAt).to.be.undefined;
            });

            it('survives cache reload and resolves absent metadata from the persisted reflection-time fallback', async function () {
                const {contact, conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies();
                await runReflected(reflected);
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 30});
                services.model.conversations.refreshCache();
                const reloadedConversation = services.model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: contact.ctx,
                });
                assert(reloadedConversation !== undefined);
                const message = getInboundMessage(reloadedConversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.true;

                await runDirect(csp);

                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                const readAt = new Date();
                message
                    .get()
                    .controller.read.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        readAt,
                    );
                expect(message.get().view.expireStartedAt).to.eql(readAt);
                expect(message.get().view.expiresAt).to.eql(
                    new Date(readAt.getTime() + 300 * 1000),
                );
            });

            it('binds resolution to the exact nonce and never rewrites a resolved row on same/new nonce duplicates', async function () {
                const {conversation} = setupConversation();
                const original = makeTextCopies(30);
                await runReflected(original.reflected);
                const message = getInboundMessage(conversation, original.messageId);
                const wrongNonce = makeTextCopies(0, original.messageId);

                await runDirect(wrongNonce.csp);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.true;
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);

                await runDirect(original.csp);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);

                await runDirect(original.csp);
                await runDirect(makeTextCopies(0, original.messageId).csp);
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
            });

            it('does not let an unauthenticated direct body suppress a later valid reflection', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(30);
                const nonceHash = hashNonce(
                    services.device.identity,
                    csp.messageAndMetadataNonce as Nonce,
                );
                await runDirect({
                    ...csp,
                    messageBox: services.crypto.randomBytes(
                        new Uint8Array(csp.messageBox.byteLength),
                    ),
                });

                expect(
                    services.model.db.hasIncomingMessageDiscardDisposition(
                        user1.identity.string,
                        messageId,
                        nonceHash,
                    ),
                ).to.be.false;

                await runReflected(reflected);

                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.true;
            });

            it('recovers authenticated metadata without decrypting a corrupt CSP body', async function () {
                const {conversation} = setupConversation();
                const {csp, reflected, messageId} = makeTextCopies(30);
                await runReflected(reflected);
                const corruptBody = {
                    ...csp,
                    messageBox: services.crypto.randomBytes(
                        new Uint8Array(csp.messageBox.byteLength),
                    ),
                };

                await runDirect(corruptBody);

                const message = getInboundMessage(conversation, messageId);
                expect(message.get().view.disappearingTimerSeconds).to.equal(30);
                expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
            });

            it('resolves a pending reflected row to fallback before acknowledging invalid metadata', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const invalid = makeTextCopies(
                    30,
                    undefined,
                    undefined,
                    undefined,
                    new Uint8Array([0xff]) as PlainData,
                );
                await runReflected(invalid.reflected);
                const message = getInboundMessage(conversation, invalid.messageId);
                expect(conversation.get().view.unreadMessageCount).to.equal(1);
                const nonceHash = hashNonce(
                    services.device.identity,
                    invalid.csp.messageAndMetadataNonce as Nonce,
                );
                await runDirect(invalid.csp, false, () => {
                    expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                    expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                    expect(
                        services.model.db.hasIncomingMessageDiscardDisposition(
                            user1.identity.string,
                            invalid.messageId,
                            nonceHash,
                        ),
                    ).to.be.true;
                    expect(services.model.db.hasNonce(NonceScope.CSP, nonceHash)).not.to.be
                        .undefined;
                });
                await runReflected(invalid.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
                expect(conversation.get().view.unreadMessageCount).to.equal(1);
            });

            it('starts fallback expiry before acknowledging missing metadata', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const missing = makeTextCopies(30);
                await runReflected(missing.reflected);
                const missingMessage = getInboundMessage(conversation, missing.messageId);
                const readAt = new Date();
                missingMessage
                    .get()
                    .controller.read.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        readAt,
                    );
                expect(conversation.get().view.unreadMessageCount).to.equal(0);
                const nonceHash = hashNonce(
                    services.device.identity,
                    missing.csp.messageAndMetadataNonce as Nonce,
                );
                await runDirect(
                    {
                        ...missing.csp,
                        metadataLength: 0,
                        metadataContainer: new Uint8Array(),
                    },
                    false,
                    () => {
                        expect(missingMessage.get().view.remoteDisappearingTimerPending).to.be
                            .undefined;
                        expect(missingMessage.get().view.expireStartedAt).to.eql(readAt);
                        expect(missingMessage.get().view.expiresAt).to.eql(
                            new Date(readAt.getTime() + 300 * 1000),
                        );
                        expect(
                            services.model.db.hasIncomingMessageDiscardDisposition(
                                user1.identity.string,
                                missing.messageId,
                                nonceHash,
                            ),
                        ).to.be.true;
                        expect(services.model.db.hasNonce(NonceScope.CSP, nonceHash)).not.to.be
                            .undefined;
                    },
                );
                await runReflected(missing.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
            });

            it('resolves a pending reflected row to fallback before acknowledging mismatched metadata', async function () {
                enablePersistentNonceTracking();
                const {conversation} = setupConversation();
                const messageId = randomMessageId(services.crypto);
                const nonce = ensureNonce(
                    services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH)),
                );
                const mismatched = makeTextCopies(
                    30,
                    messageId,
                    randomMessageId(services.crypto),
                    nonce,
                );
                await runReflected(mismatched.reflected);
                const message = getInboundMessage(conversation, mismatched.messageId);
                expect(conversation.get().view.unreadMessageCount).to.equal(1);
                const nonceHash = hashNonce(
                    services.device.identity,
                    mismatched.csp.messageAndMetadataNonce as Nonce,
                );
                await runDirect(mismatched.csp, false, () => {
                    expect(message.get().view.remoteDisappearingTimerPending).to.be.undefined;
                    expect(message.get().view.disappearingTimerSeconds).to.equal(300);
                    expect(
                        services.model.db.hasIncomingMessageDiscardDisposition(
                            user1.identity.string,
                            mismatched.messageId,
                            nonceHash,
                        ),
                    ).to.be.true;
                    expect(services.model.db.hasNonce(NonceScope.CSP, nonceHash)).not.to.be
                        .undefined;
                });
                await runReflected(mismatched.reflected);
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(1);
                expect(conversation.get().view.unreadMessageCount).to.equal(1);
            });

            it('clears the pending marker when a reflected message is tombstoned', async function () {
                const {conversation} = setupConversation();
                const {reflected, messageId} = makeTextCopies(30);
                await runReflected(reflected);
                const message = getInboundMessage(conversation, messageId);
                const messageUid = message.get().controller.uid;

                conversation
                    .get()
                    .controller.markMessageAsDeleted.fromSync(
                        undefined as unknown as PassiveTaskCodecHandle,
                        messageId,
                        new Date(),
                    );

                expect(
                    services.model.db.getMessageByUid(messageUid)
                        ?.pendingRemoteDisappearingTimerNonceHash,
                ).to.be.undefined;
            });
        });

        describe('contact management', function () {
            it('updates nickname for existing contacts', async function () {
                const {model} = services;

                const oldNickname = ensureNickname('oldnick');
                const newNickname = ensureNickname('newnick');

                // Add contact with old nickname
                const user1Contact = addTestUserAsContact(model, {...user1, nickname: oldNickname});
                expect(user1Contact.get().view.nickname).to.equal(oldNickname);

                async function processMessageWithNickname(
                    legacyNickname: Nickname | '',
                    metadataNickname: Nickname | '' | undefined,
                    expectContactReflection: boolean,
                ): Promise<void> {
                    // Create message from user 1 with the specified nickname
                    const textMessage = createMessage(
                        services,
                        user1,
                        me,
                        CspE2eConversationType.TEXT,
                        structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                            text: UTF8.encode('message'),
                        }),
                        CspMessageFlags.fromPartial({sendPushNotification: true}),
                        {nickname: legacyNickname, metadata: {nickname: metadataNickname}},
                    );

                    // Run task
                    const task = new IncomingMessageTask(services, textMessage);
                    const handle = new TestHandle(services, [
                        // Reflect contact update if requested
                        ...(expectContactReflection ? reflectContactSync(user1, 'update') : []),

                        // Reflect and ack incoming text message
                        NetworkExpectationFactory.reflectSingle((payload) => {
                            expect(payload.incomingMessage).not.to.be.undefined;
                            const incomingMessage = unwrap(payload.incomingMessage);
                            expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                            expect(incomingMessage.type).to.equal(
                                protobuf.common.CspE2eMessageType.TEXT,
                            );
                        }),
                        NetworkExpectationFactory.writeIncomingMessageAck(),

                        // Send delivery receipt
                        ...reflectAndSendDeliveryReceipt(
                            services,
                            user1,
                            CspE2eDeliveryReceiptStatus.RECEIVED,
                        ),
                    ]);
                    await task.run(handle);
                    handle.finish();
                }

                // When the nickname is unchanged, no contact update should be reflected
                await processMessageWithNickname(oldNickname, oldNickname, false);
                expect(user1Contact.get().view.nickname).to.equal(oldNickname);

                // When the nickname is changed, a contact update should be reflected
                await processMessageWithNickname(newNickname, newNickname, true);
                expect(user1Contact.get().view.nickname).to.equal(newNickname);

                // When the nickname is cleared, a contact update should be reflected...
                await processMessageWithNickname('', '', true);
                expect(user1Contact.get().view.nickname).to.be.undefined;

                // ...but only if nickname isn't already undefined.
                await processMessageWithNickname('', '', false);
                expect(user1Contact.get().view.nickname).to.be.undefined;

                // If both legacy and encrypted metadata nickname are set, the latter wins
                await processMessageWithNickname(oldNickname, newNickname, true);
                expect(user1Contact.get().view.nickname).to.be.equal(newNickname);
            });

            it("creates a new contact for an unknown contact's text message", async function () {
                const {model, directory} = services;

                addTestUserToFakeDirectory(directory, user1);

                // Verify contact absence
                const user1ContactBefore = model.contacts.getByIdentity(user1.identity.string);
                expect(
                    user1ContactBefore,
                    'Contact user1 should not exist before textmessage was sent.',
                ).to.be.undefined;

                // Create incoming text message
                const task = createNewIncomingTextMessageTask(services, user1, me);
                const expectations = [
                    NetworkExpectationFactory.startTransaction(42, TransactionScope.CONTACT_SYNC),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.contactSync).not.to.be.undefined;
                        expect(payload.contactSync?.create).not.to.be.undefined;
                        expect(payload.contactSync?.create?.contact).not.to.be.undefined;
                        const newContact = unwrap(payload.contactSync?.create?.contact);
                        expect(newContact.identity).to.equal(user1.identity.string);
                    }),

                    // Reflect and ack incoming text message
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),

                    // Reflect and send delivery receipt
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                // Get newly created contact
                const user1Contact = model.contacts.getByIdentity(user1.identity.string);
                expect(user1Contact, 'Contact user1 shoult exist after the textmessage was sent.')
                    .not.to.be.undefined;

                expect(expectations, 'Not all expectations consumed').to.be.empty;
            });

            it('upgrades acquaintanceLevel to DIRECT for an existing GROUP_OR_DELETED contact on an incoming text message', async function () {
                const {model} = services;

                // Add a contact that is only known through a shared group, not DIRECT
                const user1Contact = addTestUserAsContact(model, {
                    ...user1,
                    acquaintanceLevel: AcquaintanceLevel.GROUP_OR_DELETED,
                });
                expect(user1Contact.get().view.acquaintanceLevel).to.equal(
                    AcquaintanceLevel.GROUP_OR_DELETED,
                );

                // Create incoming text message with an unchanged nickname, so only the
                // acquaintance level update is reflected (not an additional nickname update)
                const task = createNewIncomingTextMessageTask(services, user1, me);

                const handle = new TestHandle(services, [
                    // Acquaintance level is upgraded to DIRECT and reflected
                    ...reflectContactSync(user1, 'update'),

                    // Reflect and ack incoming text message
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.TEXT,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),

                    // Reflect and send delivery receipt
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ]);
                await task.run(handle);
                handle.finish();

                expect(user1Contact.get().view.acquaintanceLevel).to.equal(
                    AcquaintanceLevel.DIRECT,
                );
            });

            it('does not upgrade acquaintanceLevel when the message type does not create implicit direct contacts', async function () {
                const {model} = services;

                // Add a contact that is only known through a shared group, not DIRECT
                const user1Contact = addTestUserAsContact(model, {
                    ...user1,
                    acquaintanceLevel: AcquaintanceLevel.GROUP_OR_DELETED,
                });

                // Delivery receipts use `missingContactHandling: 'discard'`, so they must not
                // upgrade the acquaintance level of an existing contact
                const task = createNewDeliveryReceiptMessageTask(
                    services,
                    user1,
                    me,
                    randomMessageId(services.crypto),
                    CspE2eDeliveryReceiptStatus.RECEIVED,
                );

                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);
                await task.run(handle);
                handle.finish();

                expect(user1Contact.get().view.acquaintanceLevel).to.equal(
                    AcquaintanceLevel.GROUP_OR_DELETED,
                );
            });
        });

        describe('text messages', function () {
            it('stores a text message from a known contact', async function () {
                const {model} = services;

                // Add contacts
                const user1Contact = addTestUserAsContact(model, user1);

                // Get user conversation
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);

                // Create incoming text message
                const messageText = 'this is the secret! message';
                const task = createNewIncomingTextMessageTask(services, user1, me, messageText);

                // Run task
                const handle = new TestHandle(services, [
                    // Reflect and ack incoming text message
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.TEXT,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),

                    // Reflect and send delivery receipt
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ]);
                await task.run(handle);
                handle.finish();

                // Text message should be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(1);
                const message = unwrap(messages[0]);
                assert(
                    message.type === MessageType.TEXT,
                    `Expected message type to be text, but was ${message.type}`,
                );
                expect(message.get().view.text).to.equal(messageText);
            });

            it('freezes legacy fallback before reflection can change the shared timer', async function () {
                const user1Contact = addTestUserAsContact(services.model, user1);
                const conversation = user1Contact.get().controller.conversation();
                conversation.get().controller.update.direct({ephemeralTimerSeconds: 25});

                const task = createNewIncomingTextMessageTask(
                    services,
                    user1,
                    me,
                    'receive-time timer freeze',
                );
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(() => {
                        conversation.get().controller.update.direct({ephemeralTimerSeconds: 90});
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ]);
                await task.run(handle);
                handle.finish();

                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages).to.have.length(1);
                const message = unwrap(messages[0]);
                assert(message.type === MessageType.TEXT);
                expect(message.get().view.disappearingTimerSeconds).to.equal(25);
            });

            it('stores a text message from an unknown contact', async function () {
                const {model, directory} = services;

                addTestUserToFakeDirectory(directory, user1);

                // Create incoming text message
                const task = createNewIncomingTextMessageTask(services, user1, me);
                const handle = new TestHandle(services, [
                    // Contact creation
                    NetworkExpectationFactory.startTransaction(42, TransactionScope.CONTACT_SYNC),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        const newContact = unwrap(payload.contactSync?.create?.contact);
                        expect(newContact.identity).to.equal(user1.identity.string);
                    }),

                    // Reflect and ack incoming text message
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.TEXT,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),

                    // Reflect and send delivery receipt
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ]);
                await task.run(handle);
                handle.finish();

                // Get newly created contact
                const user1Contact = model.contacts.getByIdentity(user1.identity.string);
                expect(user1Contact, 'Contact user1 shoult exist after the textmessage was sent.')
                    .not.to.be.undefined;
                assert(user1Contact !== undefined);

                // Get user conversation
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');
                expect(
                    conversation.get().controller.getAllMessages().get().size,
                    'stored message set size',
                ).to.equal(1);

                // Text message should be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(1);
                const message = unwrap(messages[0]);
                assert(
                    message.type === MessageType.TEXT,
                    `Expected message type to be text, but was ${message.type}`,
                );
            });
        });

        describe('file messages', function () {
            async function setupFileMessageTest(): Promise<{
                fileBlobId: BlobId;
                thumbnailBlobId: BlobId;
                encryptionKey: RawBlobKey;
                conversation: ModelStore<Conversation>;
            }> {
                const {blob, crypto, model} = services;

                // Add contacts
                const user1Contact = addTestUserAsContact(model, user1);

                // Get user conversation
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);

                // Register test blobs
                const encryptionKey = randomBlobKey();
                const encryptionSecretBox = crypto.getSecretBox(
                    encryptionKey,
                    NONCE_UNGUARDED_SCOPE,
                    undefined,
                );
                const plainFileBlobBytes = new Uint8Array([1, 2, 9, 8, 5, 5]) as PlainData;
                const plainThumbnailBlobBytes = new Uint8Array([9, 8, 9]) as PlainData;
                const encryptedFileBlobBytes = encryptionSecretBox
                    .encryptor(CREATE_BUFFER_TOKEN, plainFileBlobBytes)
                    .encryptWithDangerousUnguardedNonce(BLOB_FILE_NONCE);
                await blob.upload('public-volatile', encryptedFileBlobBytes);
                const encryptedThumbnailBlobBytes = encryptionSecretBox
                    .encryptor(CREATE_BUFFER_TOKEN, plainThumbnailBlobBytes)
                    .encryptWithDangerousUnguardedNonce(BLOB_THUMBNAIL_NONCE);
                const fileBlobId = await blob.upload('public-volatile', encryptedFileBlobBytes);
                const thumbnailBlobId = await blob.upload(
                    'public-volatile',
                    encryptedThumbnailBlobBytes,
                );

                return {
                    fileBlobId,
                    thumbnailBlobId,
                    encryptionKey,
                    conversation,
                };
            }

            function createFileBasedMessage(
                encryptionKey: RawBlobKey,
                fileBlobId: BlobId,
                thumbnailBlobId: BlobId | undefined,
                fileProperties: {
                    fileName: string;
                    fileMediaType: string;
                    thumbnailMediaType: string | undefined;
                    fileSizeBytes: u53;
                    renderingType: FileRenderingType;
                    metadata: Record<string, unknown>;
                },
            ): MessageWithMetadataBoxLike {
                const encryptionKeyHex = bytesToHex(encryptionKey.unwrap());
                let i, j;
                switch (fileProperties.renderingType) {
                    case 'file':
                        i = j = 0;
                        break;
                    case 'media':
                        i = j = 1;
                        break;
                    case 'sticker':
                        i = 1;
                        j = 2;
                        break;
                    default:
                        unreachable(fileProperties.renderingType);
                }
                return createMessage(
                    services,
                    user1,
                    me,
                    CspE2eConversationType.FILE,
                    structbuf.bridge.encoder(structbuf.csp.e2e.File, {
                        file: UTF8.encode(
                            JSON.stringify({
                                // Blob IDs
                                b: bytesToHex(fileBlobId),
                                ...(thumbnailBlobId === undefined
                                    ? {}
                                    : {
                                          t: bytesToHex(thumbnailBlobId),
                                      }),
                                // Encryption key
                                k: encryptionKeyHex,
                                // Media
                                m: fileProperties.fileMediaType,
                                p: fileProperties.thumbnailMediaType,
                                // Name
                                n: fileProperties.fileName,
                                // Size
                                s: fileProperties.fileSizeBytes,
                                // Correlation ID
                                c: '6c9e78d01f5235a7da752df188e48924',
                                // Metadata
                                x: fileProperties.metadata,
                                // Rendering type
                                i,
                                j,
                            }),
                        ),
                    }),
                    CspMessageFlags.fromPartial({sendPushNotification: true}),
                );
            }

            async function runIncomingFileMessageTask(
                fileMessage: MessageWithMetadataBoxLike,
            ): Promise<void> {
                const task = new IncomingMessageTask(services, fileMessage);
                const handle = new TestHandle(services, [
                    // Reflect and ack incoming file message
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.FILE,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),

                    // Reflect and send delivery receipt
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ]);
                await task.run(handle);
                handle.finish();
            }

            it('stores a raw file message from a known contact', async function () {
                const {fileBlobId, thumbnailBlobId, encryptionKey, conversation} =
                    await setupFileMessageTest();

                // Create incoming file message
                const fileMediaType = 'application/pdf';
                const thumbnailMediaType = 'image/png';
                const fileName = 'document.pdf';
                const fileSizeBytes = 12342345;
                const fileMessage = createFileBasedMessage(
                    encryptionKey,
                    fileBlobId,
                    thumbnailBlobId,
                    {
                        fileMediaType,
                        thumbnailMediaType,
                        fileName,
                        fileSizeBytes,
                        renderingType: 'file',
                        metadata: {},
                    },
                );

                // Run task
                await runIncomingFileMessageTask(fileMessage);

                // File message should be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(1);
                const message = unwrap(messages[0]);
                assert(
                    message.type === MessageType.FILE,
                    `Expected message type to be file, but was ${message.type}`,
                );
                const view = message.get().view;
                expect(view.blobId).to.deep.equal(fileBlobId);
                expect(view.thumbnailBlobId).to.deep.equal(thumbnailBlobId);
                expect(view.encryptionKey).to.deep.equal(encryptionKey);
                expect(view.mediaType).to.equal(fileMediaType);
                expect(view.thumbnailMediaType).to.equal(thumbnailMediaType);
                expect(view.fileName).to.equal(fileName);
                expect(view.fileSize).to.equal(fileSizeBytes);
            });

            async function imageMessageTest(
                animated: boolean,
                dimensions: Dimensions | undefined,
            ): Promise<void> {
                const {fileBlobId, thumbnailBlobId, encryptionKey, conversation} =
                    await setupFileMessageTest();

                // Create incoming image message
                const fileMediaType = 'image/jpeg';
                const thumbnailMediaType = 'image/png';
                const fileName = 'hello.jpg';
                const fileSizeBytes = 23523;
                const fileMessage = createFileBasedMessage(
                    encryptionKey,
                    fileBlobId,
                    thumbnailBlobId,
                    {
                        fileMediaType,
                        thumbnailMediaType,
                        fileName,
                        fileSizeBytes,
                        renderingType: 'media',
                        metadata: {
                            a: animated,
                            ...(dimensions === undefined
                                ? {}
                                : {
                                      w: dimensions.width,
                                      h: dimensions.height,
                                  }),
                        },
                    },
                );

                // Run task
                await runIncomingFileMessageTask(fileMessage);

                // Image message should be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(1);
                const message = unwrap(messages[0]);
                assert(
                    message.type === MessageType.IMAGE,
                    `Expected message type to be image, but was ${message.type}`,
                );
                const view = message.get().view;
                expect(view.blobId).to.deep.equal(fileBlobId);
                expect(view.thumbnailBlobId).to.deep.equal(thumbnailBlobId);
                expect(view.encryptionKey).to.deep.equal(encryptionKey);
                expect(view.mediaType).to.equal(fileMediaType);
                expect(view.thumbnailMediaType).to.equal(thumbnailMediaType);
                expect(view.fileName).to.equal(fileName);
                expect(view.fileSize).to.equal(fileSizeBytes);
                expect(view.animated).to.equal(animated);
                expect(view.dimensions).to.deep.equal(dimensions);
            }

            for (const animated of [true, false]) {
                for (const dimensions of [{width: 123, height: 35}, undefined]) {
                    it(`stores an ${animated ? 'animated' : 'non-animated'} image message ${
                        dimensions === undefined ? 'without' : 'with'
                    } dimensions from a known contact`, async function () {
                        await imageMessageTest(animated, dimensions);
                    });
                }
            }

            async function videoMessageTest(
                duration: f64 | undefined,
                dimensions: Dimensions | undefined,
            ): Promise<void> {
                const {fileBlobId, thumbnailBlobId, encryptionKey, conversation} =
                    await setupFileMessageTest();

                // Create incoming video message
                const fileMediaType = 'video/mp4';
                const thumbnailMediaType = 'image/png';
                const fileName = 'hello.mp4';
                const fileSizeBytes = 23523;
                const fileMessage = createFileBasedMessage(
                    encryptionKey,
                    fileBlobId,
                    thumbnailBlobId,
                    {
                        fileMediaType,
                        thumbnailMediaType,
                        fileName,
                        fileSizeBytes,
                        renderingType: 'media',
                        metadata: {
                            d: duration,
                            ...(dimensions === undefined
                                ? {}
                                : {
                                      w: dimensions.width,
                                      h: dimensions.height,
                                  }),
                        },
                    },
                );

                // Run task
                await runIncomingFileMessageTask(fileMessage);

                // Video message should be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(1);
                const message = unwrap(messages[0]);
                assert(
                    message.type === MessageType.VIDEO,
                    `Expected message type to be video, but was ${message.type}`,
                );
                const view = message.get().view;
                expect(view.blobId).to.deep.equal(fileBlobId);
                expect(view.thumbnailBlobId).to.deep.equal(thumbnailBlobId);
                expect(view.encryptionKey).to.deep.equal(encryptionKey);
                expect(view.mediaType).to.equal(fileMediaType);
                expect(view.thumbnailMediaType).to.equal(thumbnailMediaType);
                expect(view.fileName).to.equal(fileName);
                expect(view.fileSize).to.equal(fileSizeBytes);
                expect(view.duration).to.equal(duration);
                expect(view.dimensions).to.deep.equal(dimensions);
            }

            for (const duration of [0.123, undefined]) {
                for (const dimensions of [{width: 123, height: 35}, undefined]) {
                    it(`stores a video message ${
                        duration === undefined ? 'without' : 'with'
                    } duration and ${
                        dimensions === undefined ? 'without' : 'with'
                    } dimensions from a known contact`, async function () {
                        await videoMessageTest(duration, dimensions);
                    });
                }
            }

            async function audioMessageTest(duration: f64 | undefined): Promise<void> {
                const {fileBlobId, encryptionKey, conversation} = await setupFileMessageTest();

                // Create incoming audio message
                const fileMediaType = 'audio/x-m4a';
                const thumbnailMediaType = undefined;
                const fileName = 'recordAudio-2023-09-11_11-57-58.m4a';
                const fileSizeBytes = 23523;
                const fileMessage = createFileBasedMessage(encryptionKey, fileBlobId, undefined, {
                    fileMediaType,
                    thumbnailMediaType,
                    fileName,
                    fileSizeBytes,
                    renderingType: 'media',
                    metadata: {
                        d: duration,
                    },
                });

                // Run task
                await runIncomingFileMessageTask(fileMessage);

                // Audio message should be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(1);
                const message = unwrap(messages[0]);
                assert(
                    message.type === MessageType.AUDIO,
                    `Expected message type to be audio, but was ${message.type}`,
                );
                const view = message.get().view;
                expect(view.blobId).to.deep.equal(fileBlobId);
                expect(view.thumbnailBlobId).to.equal(undefined);
                expect(view.encryptionKey).to.deep.equal(encryptionKey);
                expect(view.mediaType).to.equal(fileMediaType);
                expect(view.thumbnailMediaType).to.equal(undefined);
                expect(view.fileName).to.equal(fileName);
                expect(view.fileSize).to.equal(fileSizeBytes);
                expect(view.duration).to.equal(duration);
            }

            for (const duration of [0.123, undefined]) {
                it(`stores an audio message ${
                    duration === undefined ? 'without' : 'with'
                } duration from a known contact`, async function () {
                    await audioMessageTest(duration);
                });
            }
        });

        describe('group messages', () => {
            it('only accepts group text messages from members', async function () {
                const {model} = services;

                // Add contacts
                const contact1 = addTestUserAsContact(model, user1);
                addTestUserAsContact(model, user2);

                // Group created by user1
                const groupUid = makeGroup(model.db, {creatorUid: contact1.ctx});
                const group = unwrap(model.groups.getByUid(groupUid));
                const groupConversation = group.get().controller.conversation();
                group.get().controller.setMembers.direct([contact1], new Date());

                function makeGroupMessage(
                    sender: TestUser,
                    messageText: string,
                ): structbuf.csp.payload.MessageWithMetadataBoxLike {
                    return createMessage(
                        services,
                        sender,
                        me,
                        CspE2eGroupConversationType.GROUP_TEXT,
                        structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                            creatorIdentity: UTF8.encode(
                                getIdentityString(services.device, group.get().view.creator),
                            ),
                            groupId: group.get().view.groupId,
                            innerData: structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                                text: UTF8.encode(messageText),
                            }),
                        }),
                        CspMessageFlags.none(),
                    );
                }

                // Conversation is empty
                {
                    const messages = groupConversation.get().controller.getAllMessages().get();
                    expect(messages.size).to.equal(0);
                }

                // Process group message from user1 (member)
                {
                    const message = makeGroupMessage(user1, 'hello from user1');
                    const task = new IncomingMessageTask(services, message);
                    const expectations: NetworkExpectation[] = [
                        // We expect the message to be reflected
                        NetworkExpectationFactory.reflectSingle((payload) => {
                            expect(payload.incomingMessage).not.to.be.undefined;
                            expect(payload.incomingMessage?.senderIdentity).to.equal(
                                user1.identity.string,
                            );
                            expect(payload.incomingMessage?.type).to.equal(
                                CspE2eGroupConversationType.GROUP_TEXT,
                            );
                        }),

                        // Message is acked after processing
                        NetworkExpectationFactory.writeIncomingMessageAck(),

                        // F1Whisper fork: a group DELIVERED receipt is sent to the SENDER (user1)
                        // ONLY — never broadcast to the group.
                        ...reflectAndSendGroupReceiptToSenderOnly(
                            services,
                            user1,
                            {
                                groupId: group.get().view.groupId,
                                creatorIdentity: getIdentityString(
                                    services.device,
                                    group.get().view.creator,
                                ),
                            },
                            CspE2eDeliveryReceiptStatus.RECEIVED,
                        ),
                    ];
                    const handle = new TestHandle(services, expectations);
                    await task.run(handle);
                    expect(expectations, 'Not all expectations consumed').to.be.empty;
                }

                // Text message should have been created
                {
                    const messages = groupConversation.get().controller.getAllMessages().get();
                    expect(messages.size).to.equal(1);
                }

                // Process group message from user2 (non-member)
                {
                    const message = makeGroupMessage(user2, 'hello from user2');
                    const task = new IncomingMessageTask(services, message);
                    console.warn('A');
                    const expectations: NetworkExpectation[] = [
                        // We expect a group-sync-request to be reflected and sent
                        ...reflectAndSendGroupSyncRequest(services, user1),
                        // Message is acked after processing
                        NetworkExpectationFactory.writeIncomingMessageAck(),
                    ];
                    const handle = new TestHandle(services, expectations);
                    await task.run(handle);
                    expect(expectations, 'Not all expectations consumed').to.be.empty;
                    console.warn('B');
                }

                // Ensure that no additional text message was created
                {
                    const messages = groupConversation.get().controller.getAllMessages().get();
                    expect(messages.size).to.equal(1);
                }
            });

            // Regression: the F1Whisper Android fork sends group DELIVERED/READ receipts (reusing
            // 0x81 to the sender for the "Read by"/"Delivered to" feature). Previously these hit a
            // `default` branch in `_getInstructionsForMessage` that threw and dropped the whole
            // message. They must now be processed (and ack'd) without throwing.
            async function expectGroupDeliveryReceiptNotThrown(
                status: CspE2eDeliveryReceiptStatus,
            ): Promise<void> {
                const {model} = services;

                // Add user1 as a contact and a group with user1 as a member.
                const contact1 = addTestUserAsContact(model, user1);
                const groupUid = makeGroup(model.db, {creatorUid: contact1.ctx});
                const group = unwrap(model.groups.getByUid(groupUid));
                group.get().controller.setMembers.direct([contact1], new Date());

                // Build a group delivery receipt (GroupMemberContainer wrapping a DeliveryReceipt)
                // for the given status, referencing an arbitrary (not necessarily existing)
                // message id.
                const receiptMessage = createMessage(
                    services,
                    user1,
                    me,
                    CspE2eGroupStatusUpdateType.GROUP_DELIVERY_RECEIPT,
                    structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                        creatorIdentity: UTF8.encode(
                            getIdentityString(services.device, group.get().view.creator),
                        ),
                        groupId: group.get().view.groupId,
                        innerData: structbuf.bridge.encoder(structbuf.csp.e2e.DeliveryReceipt, {
                            messageIds: [randomMessageId(services.crypto)],
                            status,
                        }),
                    }),
                    CspMessageFlags.none(),
                );
                const task = new IncomingMessageTask(services, receiptMessage);

                // The message must be processed (reflected to the mediator) and ack'd, never
                // thrown/dropped.
                const expectations: NetworkExpectation[] = [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage?.type).to.equal(
                            CspE2eGroupStatusUpdateType.GROUP_DELIVERY_RECEIPT,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                expect(expectations, 'Not all expectations consumed').to.be.empty;
            }

            it('does not throw on a group delivery receipt of type RECEIVED', async function () {
                await expectGroupDeliveryReceiptNotThrown(CspE2eDeliveryReceiptStatus.RECEIVED);
            });

            it('does not throw on a group delivery receipt of type READ', async function () {
                await expectGroupDeliveryReceiptNotThrown(CspE2eDeliveryReceiptStatus.READ);
            });
        });

        describe('disappearing-messages timer (1:1, 0x85)', function () {
            it('applies an incoming timer locally and does NOT echo an outgoing message', async function () {
                const {model} = services;

                // Add user1 as a contact so the incoming control message has a known sender.
                const contact = addTestUserAsContact(model, user1);
                const conversation = contact.get().controller.conversation();
                expect(conversation.get().view.ephemeralTimerSeconds).to.be.undefined;

                // Build a 1:1 disappearing-timer control message (bare 4-byte LE uint32 body).
                const timerMessage = createMessage(
                    services,
                    user1,
                    me,
                    CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER,
                    encodeDisappearingTimer(3600),
                    CspMessageFlags.none(),
                );
                const task = new IncomingMessageTask(services, timerMessage);

                // CRITICAL echo-loop guard: the message is ack'd, but there must be NO reflect (it is
                // local-only / not reflected) and NO outgoing message echoed back to the sender. The
                // TestHandle fails on any unexpected operation, so providing ONLY the ack expectation
                // asserts that nothing else (no echo) happened.
                const expectations: NetworkExpectation[] = [
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                expect(expectations, 'Not all expectations consumed').to.be.empty;

                // The timer was applied locally.
                expect(conversation.get().view.ephemeralTimerSeconds).to.equal(3600);

                // A local disappearing-timer status row was appended.
                const statusMessages = conversation.get().controller.getAllStatusMessages().get();
                const disappearingStatus = [...statusMessages].find(
                    (s) => s.type === StatusMessageType.DISAPPEARING_TIMER_CHANGED,
                );
                assert(
                    disappearingStatus !== undefined,
                    'Expected a disappearing-timer status row',
                );
            });
        });

        describe('group typing indicator (0x84)', function () {
            it('sets a member as typing locally and does NOT echo an outgoing message', async function () {
                const {model} = services;

                // Add user1 as a contact + a group with user1 as a member.
                const contact1 = addTestUserAsContact(model, user1);
                const groupUid = makeGroup(model.db, {creatorUid: contact1.ctx});
                const group = unwrap(model.groups.getByUid(groupUid));
                group.get().controller.setMembers.direct([contact1], new Date());
                const groupConversation = group.get().controller.conversation();
                expect(groupConversation.get().view.typingMembers ?? []).to.be.empty;

                // Build a group-typing message (raw 17-byte body) from user1.
                const creatorIdentity = getIdentityString(
                    services.device,
                    group.get().view.creator,
                );
                const typingMessage = createMessage(
                    services,
                    user1,
                    me,
                    CspE2eGroupStatusUpdateType.GROUP_TYPING,
                    encodeGroupTyping(creatorIdentity, group.get().view.groupId, true),
                    CspMessageFlags.none(),
                );
                const task = new IncomingMessageTask(services, typingMessage);

                // Echo-loop guard: ack only, NO reflect (ephemeral/local-only), NO outgoing echo.
                const expectations: NetworkExpectation[] = [
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                expect(expectations, 'Not all expectations consumed').to.be.empty;

                // The member is now marked as typing in the group conversation.
                expect(groupConversation.get().view.typingMembers).to.deep.equal([
                    user1.identity.string,
                ]);
            });
        });

        describe('group receipt to sender only (privacy)', function () {
            it('sends a group READ receipt to the message sender ONLY (not the group)', async function () {
                const {model} = services;

                // Group with user1 (sender) + user2 (another member). Both are contacts.
                const contact1 = addTestUserAsContact(model, user1);
                addTestUserAsContact(model, user2);
                const groupUid = makeGroup(model.db, {creatorUid: contact1.ctx});
                const group = unwrap(model.groups.getByUid(groupUid));
                const creatorIdentity = getIdentityString(
                    services.device,
                    group.get().view.creator,
                );

                // Send a group READ receipt for a message authored by user1.
                const task = new OutgoingGroupReceiptToSenderTask(
                    services,
                    contact1.get(),
                    {groupId: group.get().view.groupId, creatorIdentity},
                    CspE2eDeliveryReceiptStatus.READ,
                    new Date(),
                    [randomMessageId(services.crypto)],
                );

                // The receipt's transport recipient must be EXACTLY user1 (the sender) — never the
                // group, never user2. `reflectAndSendGroupReceiptToSenderOnly` asserts the
                // receiverIdentity equals user1 only.
                const expectations: NetworkExpectation[] = reflectAndSendGroupReceiptToSenderOnly(
                    services,
                    user1,
                    {groupId: group.get().view.groupId, creatorIdentity},
                    CspE2eDeliveryReceiptStatus.READ,
                );
                // The TestHandle is a full codec mock; the volatile/persistent distinction is only a
                // type-level persistence token, so cast for this persistent task.
                const handle = new TestHandle(
                    services,
                    expectations,
                ) as unknown as ActiveTaskCodecHandle<'persistent'>;
                await task.run(handle);
                expect(expectations, 'Not all expectations consumed').to.be.empty;
            });
        });

        describe('contact blocking', function () {
            it('creates no new contact and discards message if block unknown is active', async function () {
                const {model, directory} = services;

                addTestUserToFakeDirectory(directory, user1);

                // Set privacy to block unknown
                model.user.privacySettings.get().controller.update({
                    unknownContactPolicy: UnknownContactPolicy.BLOCK_UNKNOWN,
                });

                // Verify contact absence
                const user1ContactBefore = model.contacts.getByIdentity(user1.identity.string);
                expect(
                    user1ContactBefore,
                    'Contact user1 should not exist before textmessage was sent.',
                ).to.be.undefined;

                // Create incoming text message
                const task = createNewIncomingTextMessageTask(services, user1, me);
                const expectations = [NetworkExpectationFactory.writeIncomingMessageAck()];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                // Verify contact absence
                const user1ContactAfter = model.contacts.getByIdentity(user1.identity.string);
                expect(
                    user1ContactAfter,
                    'Contact user1 should not exist after textmessage was sent.',
                ).to.be.undefined;

                expect(expectations, 'Not all expectations consumed').to.be.empty;
            });

            it('discards group text message if member contact is blocked', async function () {
                const {model} = services;

                // Add contacts
                const contact1 = addTestUserAsContact(model, user1);
                const contact2 = addTestUserAsContact(model, user2);

                // Block user2
                model.user.privacySettings.get().controller.update({
                    blockedIdentities: {identities: [user2.identity.string]},
                });

                // Group created by user1
                const groupUid = makeGroup(model.db, {creatorUid: contact1.ctx}, [contact2.ctx]);
                const group = unwrap(model.groups.getByUid(groupUid));
                const groupConversation = group.get().controller.conversation();
                group.get().controller.setMembers.direct([contact1], new Date());

                function makeGroupMessage(
                    sender: TestUser,
                    messageText: string,
                ): structbuf.csp.payload.MessageWithMetadataBoxLike {
                    return createMessage(
                        services,
                        sender,
                        me,
                        CspE2eGroupConversationType.GROUP_TEXT,
                        structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                            creatorIdentity: UTF8.encode(
                                getIdentityString(services.device, group.get().view.creator),
                            ),
                            groupId: group.get().view.groupId,
                            innerData: structbuf.bridge.encoder(structbuf.csp.e2e.Text, {
                                text: UTF8.encode(messageText),
                            }),
                        }),
                        CspMessageFlags.none(),
                    );
                }

                // Conversation is empty
                {
                    const messages = groupConversation.get().controller.getAllMessages().get();
                    expect(messages.size).to.equal(0);
                }

                // Process group message from user1 (member)
                {
                    const message = makeGroupMessage(user1, 'hello from user1');
                    const task = new IncomingMessageTask(services, message);
                    const expectations: NetworkExpectation[] = [
                        // We expect the message to be reflected
                        NetworkExpectationFactory.reflectSingle((payload) => {
                            expect(payload.incomingMessage).not.to.be.undefined;
                            const incomingMessage = unwrap(payload.incomingMessage);
                            expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        }),
                        // Message is acked after processing
                        NetworkExpectationFactory.writeIncomingMessageAck(),
                        // F1Whisper fork: DELIVERED receipt sent to the SENDER (user1) only.
                        ...reflectAndSendGroupReceiptToSenderOnly(
                            services,
                            user1,
                            {
                                groupId: group.get().view.groupId,
                                creatorIdentity: getIdentityString(
                                    services.device,
                                    group.get().view.creator,
                                ),
                            },
                            CspE2eDeliveryReceiptStatus.RECEIVED,
                        ),
                    ];
                    const handle = new TestHandle(services, expectations);
                    await task.run(handle);
                    expect(expectations, 'Not all expectations consumed').to.be.empty;
                }

                // Text message should have been created
                {
                    const messages = groupConversation.get().controller.getAllMessages().get();
                    expect(messages.size).to.equal(1);
                }

                // Process group message from user2 (blocked). A blocked sender's message is acked +
                // dropped, and crucially NO delivery receipt is sent (only the ack below).
                {
                    const message = makeGroupMessage(user2, 'hello from user2');
                    const task = new IncomingMessageTask(services, message);
                    const expectations: NetworkExpectation[] = [
                        // Message is acked and dropped, since it comes from user2
                        NetworkExpectationFactory.writeIncomingMessageAck(),
                    ];
                    const handle = new TestHandle(services, expectations);
                    await task.run(handle);
                    expect(expectations, 'Not all expectations consumed').to.be.empty;
                }

                // Ensure that no additional text message was created
                {
                    const messages = groupConversation.get().controller.getAllMessages().get();
                    expect(messages.size).to.equal(1);
                }
            });

            it('processes group control messages if contact is blocked', async function () {
                const {crypto, model} = services;

                // Add creator contact
                const creator = user1;
                const creatorContact = addTestUserAsContact(model, creator);

                // Add group
                const groupId = randomGroupId(crypto);
                const group = addTestGroup(model, {
                    groupId,
                    creator: creatorContact,
                    name: 'AAA',
                    members: [creatorContact],
                });

                // Ensure that group name is AAA
                expect(model.groups.getByUid(group.ctx)?.get().view.name).to.equal('AAA');

                // Block creator contact
                model.user.privacySettings.get().controller.update({
                    blockedIdentities: {identities: [creator.identity.string]},
                });

                // Prepare payload
                const container = {
                    groupId,
                    creatorIdentity: creator.identity.string,
                    innerData: new Uint8Array(0),
                };
                const name = {
                    name: 'BBB',
                };

                // Run task
                const task = new IncomingGroupNameTask(
                    services,
                    randomMessageId(crypto),
                    creatorContact,
                    container,
                    name,
                    new Date(),
                );
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.startTransaction(0, TransactionScope.GROUP_SYNC),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('groupSync');
                        const outgoingMessage = unwrap(
                            payload.groupSync,
                            'Group sync is undefined',
                        );
                        const parsedMessage = protobuf.validate.d2d.GroupSync.SCHEMA.parse({
                            ...outgoingMessage,
                            action: 'update',
                        });
                        const newName = parsedMessage.update?.group.name;

                        expect(newName).to.equal('BBB');
                    }),
                ]);
                await task.run(handle);
                handle.finish();

                // Ensure that group name was updated
                expect(model.groups.getByUid(group.ctx)?.get().view.name).to.equal('BBB');
            });

            it('discards 1:1 conversation text message if contact is blocked', async function () {
                const {model} = services;

                // Add contact and get conversation
                const user1Contact = addTestUserAsContact(model, user1);
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');
                expect(conversation.get().controller.getAllMessages().get().size).to.equal(0);

                // Block contact
                model.user.privacySettings.get().controller.update({
                    blockedIdentities: {identities: [user1.identity.string]},
                });

                // Create incoming text message
                const task = createNewIncomingTextMessageTask(services, user1, me);
                const expectations = [NetworkExpectationFactory.writeIncomingMessageAck()];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                // Text message should *not* be part of the 1:1 conversation
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length).to.equal(0);

                expect(expectations, 'Not all expectations consumed').to.be.empty;
            });
        });

        describe('group setup blocking', function () {
            function makeGroupSetupMessage(
                creator: TestUser,
                groupId: GroupId,
                members: readonly IdentityString[],
            ): structbuf.csp.payload.MessageWithMetadataBoxLike {
                return createMessage(
                    services,
                    creator,
                    me,
                    CspE2eGroupControlType.GROUP_SETUP,
                    structbuf.bridge.encoder(structbuf.csp.e2e.GroupCreatorContainer, {
                        groupId,
                        innerData: structbuf.bridge.encoder(structbuf.csp.e2e.GroupSetup, {
                            members: members.map((identity) => UTF8.encode(identity)),
                        }),
                    }),
                    CspMessageFlags.none(),
                );
            }

            it('discards a group-setup message from a blocked creator when the group does not exist locally yet', async function () {
                const {model} = services;

                addTestUserAsContact(model, user1);

                // Block creator
                model.user.privacySettings.get().controller.update({
                    blockedIdentities: {identities: [user1.identity.string]},
                });

                const groupId = randomGroupId(services.crypto);
                const message = makeGroupSetupMessage(user1, groupId, [me]);
                const task = new IncomingMessageTask(services, message);
                const expectations: NetworkExpectation[] = [
                    // Message is acked and dropped, since the group is unknown and the creator
                    // is blocked
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                expect(expectations, 'Not all expectations consumed').to.be.empty;
                expect(model.groups.getByGroupIdAndCreator(groupId, user1.identity.string)).to.be
                    .undefined;
            });

            it('processes a group-setup message from a blocked creator when the group already exists locally', async function () {
                const {model} = services;

                const creatorContact = addTestUserAsContact(model, user1);
                addTestUserAsContact(model, user2);

                const groupId = randomGroupId(services.crypto);
                const group = addTestGroup(model, {
                    groupId,
                    creator: creatorContact,
                    members: [],
                });

                // Block creator only *after* the group was created locally
                model.user.privacySettings.get().controller.update({
                    blockedIdentities: {identities: [user1.identity.string]},
                });

                const message = makeGroupSetupMessage(user1, groupId, [user2.identity.string, me]);
                const task = new IncomingMessageTask(services, message);
                const expectations: NetworkExpectation[] = [
                    NetworkExpectationFactory.startTransaction(0, TransactionScope.GROUP_SYNC),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('groupSync');
                    }),
                    // Reflect the CSP message for backwards compatibility
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('incomingMessage');
                        expect(payload.incomingMessage?.type).to.equal(
                            CspE2eGroupControlType.GROUP_SETUP,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                expect(expectations, 'Not all expectations consumed').to.be.empty;

                const view = group.get().view;
                expect([...view.members].map((m) => m.get().view.identity)).to.have.members([
                    user2.identity.string,
                ]);
            });

            it('processes a group-setup message from a non-blocked creator, creating a new group', async function () {
                const {model} = services;

                addTestUserAsContact(model, user1);

                const groupId = randomGroupId(services.crypto);
                const message = makeGroupSetupMessage(user1, groupId, [me]);
                const task = new IncomingMessageTask(services, message);
                const expectations: NetworkExpectation[] = [
                    NetworkExpectationFactory.startTransaction(0, TransactionScope.GROUP_SYNC),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('groupSync');
                        expect(payload.groupSync?.create?.group).not.to.be.undefined;
                    }),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('incomingMessage');
                        expect(payload.incomingMessage?.type).to.equal(
                            CspE2eGroupControlType.GROUP_SETUP,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                expect(expectations, 'Not all expectations consumed').to.be.empty;
                expect(model.groups.getByGroupIdAndCreator(groupId, user1.identity.string)).not.to
                    .be.undefined;
            });

            it('upgrades acquaintanceLevel to DIRECT for a GROUP_OR_DELETED creator sending a new group-setup message', async function () {
                const {model} = services;

                const creatorContact = addTestUserAsContact(model, {
                    ...user1,
                    acquaintanceLevel: AcquaintanceLevel.GROUP_OR_DELETED,
                });

                const groupId = randomGroupId(services.crypto);
                const message = makeGroupSetupMessage(user1, groupId, [me]);
                const task = new IncomingMessageTask(services, message);
                const expectations: NetworkExpectation[] = [
                    // Acquaintance level is upgraded to DIRECT and reflected
                    ...reflectContactSync(user1, 'update'),

                    NetworkExpectationFactory.startTransaction(0, TransactionScope.GROUP_SYNC),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('groupSync');
                        expect(payload.groupSync?.create?.group).not.to.be.undefined;
                    }),
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.content).to.equal('incomingMessage');
                        expect(payload.incomingMessage?.type).to.equal(
                            CspE2eGroupControlType.GROUP_SETUP,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const handle = new TestHandle(services, expectations);
                await task.run(handle);
                handle.finish();

                expect(expectations, 'Not all expectations consumed').to.be.empty;
                expect(creatorContact.get().view.acquaintanceLevel).to.equal(
                    AcquaintanceLevel.DIRECT,
                );
            });
        });

        describe('edit message', function () {
            services = makeTestServices(me);

            const {crypto, model} = services;
            const messageId = randomMessageId(crypto);

            const messageTask = createNewIncomingTextMessageTask(
                services,
                user1,
                me,
                'This is a secret message',
                messageId,
            );
            const messageExpectations: NetworkExpectation[] = [
                NetworkExpectationFactory.reflectSingle((payload) => {
                    expect(payload.incomingMessage).not.to.be.undefined;
                    const incomingMessage = unwrap(payload.incomingMessage);
                    expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                    expect(incomingMessage.type).to.equal(protobuf.common.CspE2eMessageType.TEXT);
                }),
                NetworkExpectationFactory.writeIncomingMessageAck(),

                // Send delivery receipt
                ...reflectAndSendDeliveryReceipt(
                    services,
                    user1,
                    CspE2eDeliveryReceiptStatus.RECEIVED,
                ),
            ];
            const messageHandle = new TestHandle(services, messageExpectations);
            const editHandle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle((payload) => {
                    expect(payload.incomingMessage).not.to.be.undefined;
                    const incomingMessage = unwrap(payload.incomingMessage);
                    expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                    expect(incomingMessage.type).to.equal(
                        protobuf.common.CspE2eMessageType.EDIT_MESSAGE,
                    );
                }),
                NetworkExpectationFactory.writeIncomingMessageAck(),
            ]);

            const updateText = 'This secret message was edited';
            const editMessageTask = createNewEditMessageTask(
                services,
                user1,
                me,
                messageId,
                updateText,
            );

            const user1Contact = addTestUserAsContact(model, user1);

            it('receives a standard, correct edit message', async function () {
                await messageTask.run(messageHandle);

                await editMessageTask.run(editHandle);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const updatedMessage = conversation?.get().controller.getMessage(messageId);

                assert(updatedMessage !== undefined, 'Message should not be undefined');

                expect(updatedMessage.get().view.lastEditedAt).to.not.equal(
                    undefined,
                    'The message should have a lastEditedAt flag',
                );

                const updatedMessageAsTextMessage = updatedMessage as AnyTextMessageModelStore;
                expect(updatedMessageAsTextMessage.get().view.text).to.equal(
                    'This secret message was edited',
                );
            });

            it('receives an edit message to a message that does not exist', async function () {
                const newMessageId = ensureMessageId(BigInt(messageId) + BigInt(1));
                const editMessageTask2 = createNewEditMessageTask(
                    services,
                    user1,
                    me,
                    newMessageId,
                );
                const editHandle2 = new TestHandle(services, [
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);
                await editMessageTask2.run(editHandle2);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const updatedMessage = conversation?.get().controller.getMessage(newMessageId);

                expect(updatedMessage, 'No message wit this ID should exist').to.be.undefined;
            });
        });

        describe('delete message', function () {
            services = makeTestServices(me);

            const {crypto, model} = services;
            const messageId = randomMessageId(crypto);
            const user1Contact = addTestUserAsContact(model, user1);

            const messageTask = createNewIncomingTextMessageTask(
                services,
                user1,
                me,
                'This is a secret message',
                messageId,
            );
            const messageExpectations: NetworkExpectation[] = [
                NetworkExpectationFactory.reflectSingle((payload) => {
                    expect(payload.incomingMessage).not.to.be.undefined;
                    const incomingMessage = unwrap(payload.incomingMessage);
                    expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                    expect(incomingMessage.type).to.equal(protobuf.common.CspE2eMessageType.TEXT);
                }),
                NetworkExpectationFactory.writeIncomingMessageAck(),

                // Send delivery receipt
                ...reflectAndSendDeliveryReceipt(
                    services,
                    user1,
                    CspE2eDeliveryReceiptStatus.RECEIVED,
                ),
            ];

            const messageHandle = new TestHandle(services, messageExpectations);
            const deleteHandle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(() => {}),
                NetworkExpectationFactory.writeIncomingMessageAck(),
            ]);

            const deleteMessageTask = createNewDeleteMessageTask(services, user1, me, messageId);

            const secondMessageId = ensureMessageId(BigInt(messageId) + BigInt(8));

            const user3 = {
                identity: new Identity(ensureIdentityString('USER0003')),
                nickname: 'user3' as Nickname,
                ck: createClientKey(),
            };

            const user3Contact = addTestUserAsContact(model, user3);

            const messageTask3 = createNewIncomingTextMessageTask(
                services,
                user3,
                me,
                'This is a secret message',
                secondMessageId,
            );
            const messageExpectations3: NetworkExpectation[] = [
                NetworkExpectationFactory.reflectSingle((payload) => {
                    expect(payload.incomingMessage).not.to.be.undefined;
                    const incomingMessage = unwrap(payload.incomingMessage);
                    expect(incomingMessage.senderIdentity).to.equal(user3.identity.string);
                    expect(incomingMessage.type).to.equal(protobuf.common.CspE2eMessageType.TEXT);
                }),
                NetworkExpectationFactory.writeIncomingMessageAck(),

                // Send delivery receipt
                ...reflectAndSendDeliveryReceipt(
                    services,
                    user3,
                    CspE2eDeliveryReceiptStatus.RECEIVED,
                ),
            ];

            const messageHandle3 = new TestHandle(services, messageExpectations3);
            const editHandle3 = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle((payload) => {
                    expect(payload.incomingMessage).not.to.be.undefined;
                    const incomingMessage = unwrap(payload.incomingMessage);
                    expect(incomingMessage.senderIdentity).to.equal(user3.identity.string);
                    expect(incomingMessage.type).to.equal(
                        protobuf.common.CspE2eMessageType.EDIT_MESSAGE,
                    );
                }),
                NetworkExpectationFactory.writeIncomingMessageAck(),
            ]);

            const deleteMessageTask3 = createNewDeleteMessageTask(
                services,
                user3,
                me,
                secondMessageId,
            );

            const deleteHandle3 = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(() => {}),
                NetworkExpectationFactory.writeIncomingMessageAck(),
            ]);

            const updateText = 'This secret message was edited';
            const editMessageTask3 = createNewEditMessageTask(
                services,
                user3,
                me,
                secondMessageId,
                updateText,
            );

            it('receives a standard, correct delete message', async function () {
                await messageTask.run(messageHandle);
                messageHandle.finish();

                await deleteMessageTask.run(deleteHandle);
                messageHandle.finish();

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const deletedMessage = conversation?.get().controller.getMessage(messageId);

                assert(deletedMessage !== undefined, 'Message should not be undefined');
                expect(deletedMessage.get().view.deletedAt).to.not.equal(
                    undefined,
                    'The message should have a deletedAt flag',
                );

                expect(deletedMessage.get().type).to.equal(MessageType.DELETED);
            });

            it('receives an edit on an already deleted message', async function () {
                const editMessageTask2 = createNewEditMessageTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'bli bla blub',
                );

                const editHandle2 = new TestHandle(services, [
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);

                await editMessageTask2.run(editHandle2);
                editHandle2.finish();
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                const deletedMessage = conversation?.get().controller.getMessage(messageId);

                assert(deletedMessage !== undefined, 'Message should not be undefined');
                expect(deletedMessage.get().view.deletedAt).to.not.equal(
                    undefined,
                    'The message should have a deletedAt flag',
                );

                expect(deletedMessage.get().type).to.equal(MessageType.DELETED);
            });

            it('receives a delete on a message that does not exist', async function () {
                const newMessageId = ensureMessageId(BigInt(messageId) + BigInt(4));

                const deleteMessageTask2 = createNewDeleteMessageTask(
                    services,
                    user1,
                    me,
                    newMessageId,
                );

                const deleteHandle2 = new TestHandle(services, [
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);

                await deleteMessageTask2.run(deleteHandle2);
                deleteHandle2.finish();
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                const deletedMessage = conversation?.get().controller.getMessage(newMessageId);

                assert(deletedMessage === undefined, 'Message should not be defined');
            });

            it('receives a delete that makes version history disappear', async function () {
                await messageTask3.run(messageHandle3);

                messageHandle3.finish();

                await editMessageTask3.run(editHandle3);
                editHandle3.finish();
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user3Contact.ctx,
                });

                const editedMessage = conversation?.get().controller.getMessage(secondMessageId);

                expect(
                    editedMessage?.get().view.history.length,
                    'Version history must have two members',
                ).to.eql(2);

                await deleteMessageTask3.run(deleteHandle3);
                deleteHandle3.finish();

                const deletedMessage = conversation?.get().controller.getMessage(secondMessageId);

                expect(
                    deletedMessage?.get().view.history.length,
                    'Version history must be empty',
                ).to.eql(0);
            });
        });

        describe('emoji reactions', function () {
            let messageId: MessageId;
            let user1Contact: ModelStore<Contact>;
            this.beforeEach(async () => {
                messageId = randomMessageId(services.crypto);
                user1Contact = addTestUserAsContact(services.model, user1);

                const messageTask = createNewIncomingTextMessageTask(
                    services,
                    user1,
                    me,
                    'This is a secret message',
                    messageId,
                );
                const messageExpectations: NetworkExpectation[] = [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.TEXT,
                        );
                    }),

                    NetworkExpectationFactory.writeIncomingMessageAck(),

                    // Send delivery receipt
                    ...reflectAndSendDeliveryReceipt(
                        services,
                        user1,
                        CspE2eDeliveryReceiptStatus.RECEIVED,
                    ),
                ];
                const messageHandle = new TestHandle(services, messageExpectations);
                await messageTask.run(messageHandle);
                messageHandle.finish();
            });
            it('receive a standard, correct emoji reaction message', async function () {
                const {model} = services;

                const reactionHandle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.REACTION,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);

                const incomingReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'apply',
                    tag<EmojiReaction>('🍷'),
                );

                await incomingReactionTask.run(reactionHandle);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const message = conversation?.get().controller.getMessage(messageId);

                assert(message !== undefined, 'Message should not be undefined');
                assert(message.type !== MessageType.DELETED);
                expect(message.get().view.reactions.length).to.eq(1);
                expect(
                    message.get().view.reactions.map((emojiReaction) => ({
                        senderIdentity: emojiReaction.senderIdentity,
                        reaction: emojiReaction.reaction,
                    }))[0],
                ).to.deep.equal({
                    senderIdentity: user1.identity.string,
                    reaction: '🍷',
                });
            });
            it('receive an emoji reaction on a message that does not exist', async function () {
                const {model} = services;

                const newMessageId = randomMessageId(services.crypto);

                const reactionHandle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);

                const incomingReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    newMessageId,
                    'apply',
                    tag<EmojiReaction>('🍷'),
                );

                await incomingReactionTask.run(reactionHandle);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const message = conversation?.get().controller.getMessage(messageId);

                expect(
                    message?.get().view.reactions.length,
                    'Reaction should not have been added to any message',
                ).to.eq(0);

                expect(
                    conversation?.get().controller.getMessage(newMessageId),
                    'Message should not exist',
                ).to.be.undefined;
            });

            it('receive an emoji reaction message on a deleted message', async function () {
                const {model} = services;

                const deleteHandle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(() => {}),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);

                const deleteMessageTask = createNewDeleteMessageTask(
                    services,
                    user1,
                    me,
                    messageId,
                );

                await deleteMessageTask.run(deleteHandle);

                const reactionHandle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(() => {}),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);

                const incomingReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'apply',
                    tag<EmojiReaction>('🏁'),
                );

                await incomingReactionTask.run(reactionHandle);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const message = conversation?.get().controller.getMessage(messageId);

                assert(message !== undefined, 'Message should not be undefined');
                assert(message.type === MessageType.DELETED);
                expect(message.get().view.reactions.length).to.eq(0);
            });

            it('receive an emoji withdraw message on a reaction that exists', async function () {
                const {model} = services;

                const expectations = [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.REACTION,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const reactionHandle = new TestHandle(services, expectations);

                const withdrawHandle = new TestHandle(services, [...expectations]);

                const incomingReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'apply',
                    tag<EmojiReaction>('🌞'),
                );

                await incomingReactionTask.run(reactionHandle);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const message = conversation?.get().controller.getMessage(messageId);

                assert(message !== undefined, 'Message should not be undefined');
                assert(message.type !== MessageType.DELETED);
                expect(message.get().view.reactions.length).to.eq(1);
                expect(
                    message.get().view.reactions.map((emojiReaction) => ({
                        senderIdentity: emojiReaction.senderIdentity,
                        reaction: emojiReaction.reaction,
                    }))[0],
                ).to.deep.equal({
                    senderIdentity: user1.identity.string,
                    reaction: '🌞',
                });

                const incomingWithdrawReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'withdraw',
                    tag<EmojiReaction>('🌞'),
                );

                await incomingWithdrawReactionTask.run(withdrawHandle);

                expect(message.get().view.reactions.length, 'Reaction should be withdrawn').to.eq(
                    0,
                );
            });

            it('receive a withdraw message on a reaction that does not exist', async function () {
                const {model} = services;

                addTestUserAsContact(model, user2);

                const expectations = [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.REACTION,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const reactionHandle = new TestHandle(services, expectations);

                const withdrawExpectations = [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];

                const incomingReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'apply',
                    tag<EmojiReaction>('🌞'),
                );

                await incomingReactionTask.run(reactionHandle);

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                expect(conversation).to.not.equal(undefined, 'Conversation should exist');

                const message = conversation?.get().controller.getMessage(messageId);

                const incomingWithdrawReactionTask = createNewIncomingEmojiReactionTask(
                    services,
                    user1,
                    me,
                    messageId,
                    'withdraw',
                    tag<EmojiReaction>('🌚'),
                );

                const withdrawHandle = new TestHandle(services, [...withdrawExpectations]);

                // Withdraw a different reaction from the same sender

                await incomingWithdrawReactionTask.run(withdrawHandle);

                expect(
                    message?.get().view.reactions.length,
                    'Message should have one reaction',
                ).to.eq(1);

                expect(message?.get().view.reactions[0]?.reaction).to.eq('🌞');
            });

            it('receive a legacy reaction message', async function () {
                const {model} = services;

                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });

                assert(conversation !== undefined);

                const outgoingMessageId = randomMessageId(services.crypto);

                const init: DirectedMessageFor<
                    MessageDirection.OUTBOUND,
                    MessageType.TEXT,
                    'init'
                > = {
                    direction: MessageDirection.OUTBOUND,
                    type: MessageType.TEXT,
                    text: 'Du hier?',
                    id: outgoingMessageId,
                    createdAt: new Date(),
                };

                // Fake an outgoing message
                const message = conversation.get().controller.addMessage.direct(init);

                const expectations = [
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            CspE2eStatusUpdateType.DELIVERY_RECEIPT,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ];
                const legacyAckRectionHandle = new TestHandle(services, [...expectations]);

                const deliveryReceiptTaskAcknowledge = createNewDeliveryReceiptMessageTask(
                    services,
                    user1,
                    me,
                    outgoingMessageId,
                    CspE2eDeliveryReceiptStatus.ACKNOWLEDGED,
                );

                await deliveryReceiptTaskAcknowledge.run(legacyAckRectionHandle);

                expect(
                    message.get().view.reactions.length,
                    'Message should have one reaction',
                ).to.eq(1);

                expect(
                    message.get().view.reactions[0]?.reaction,
                    'Message should be acknowledged',
                ).to.eq('👍');

                // Now receive a thumbs down
                const legacyDecReactionHandle = new TestHandle(services, [...expectations]);

                const deliveryReceiptTaskDecline = createNewDeliveryReceiptMessageTask(
                    services,
                    user1,
                    me,
                    outgoingMessageId,
                    CspE2eDeliveryReceiptStatus.DECLINED,
                );

                await deliveryReceiptTaskDecline.run(legacyDecReactionHandle);

                expect(
                    message.get().view.reactions.length,
                    'Message should have one reaction',
                ).to.eq(1);

                expect(
                    message.get().view.reactions[0]?.reaction,
                    'Message should be acknowledged',
                ).to.eq('👎');
            });
        });

        describe('call signaling', function () {
            /**
             * Create an incoming call offer message task from a specific user.
             *
             * @returns a task for an incoming `CALL_OFFER` message.
             */
            function createNewIncomingCallOfferMessageTask(
                testServices: TestServices,
                user: TestUser,
                receiver: IdentityString,
            ): IncomingMessageTask {
                const callOfferMessage = createMessage(
                    testServices,
                    user,
                    receiver,
                    CspE2eConversationType.CALL_OFFER,
                    structbuf.bridge.encoder(structbuf.csp.e2e.CallOffer, {
                        // Valid JSON call-offer payload (the current decoder parses + validates it).
                        offer: encodeCallOffer({
                            callId: randomCallId(testServices.crypto),
                            offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
                        }),
                    }),
                    CspMessageFlags.fromPartial({
                        sendPushNotification: true,
                        immediateDeliveryRequired: true,
                    }),
                );

                return new IncomingMessageTask(testServices, callOfferMessage);
            }

            /**
             * Create an incoming call answer message task from a specific user.
             *
             * @returns a task for an incoming `CALL_ANSWER` message.
             */
            function createNewIncomingCallAnswerMessageTask(
                testServices: TestServices,
                user: TestUser,
                receiver: IdentityString,
            ): IncomingMessageTask {
                const callAnswerMessage = createMessage(
                    testServices,
                    user,
                    receiver,
                    CspE2eConversationType.CALL_ANSWER,
                    structbuf.bridge.encoder(structbuf.csp.e2e.CallAnswer, {
                        // Valid JSON call-answer payload (accept) matching the current decoder.
                        answer: encodeCallAnswer({
                            callId: randomCallId(testServices.crypto),
                            action: O2oCallAnswerAction.ACCEPT,
                            answer: {sdpType: 'answer', sdp: 'v=0\r\n'},
                        }),
                    }),
                    CspMessageFlags.fromPartial({
                        sendPushNotification: true,
                        immediateDeliveryRequired: true,
                    }),
                );

                return new IncomingMessageTask(testServices, callAnswerMessage);
            }

            it('decodes and delegates a valid CALL_OFFER to the o2o call handler', async function () {
                const {model} = services;

                // Add contact
                const user1Contact = addTestUserAsContact(model, user1);

                // Get user conversation
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');

                // Create incoming `CALL_OFFER` message.
                const task = createNewIncomingCallOfferMessageTask(services, user1, me);

                // Stub the o2o call handler: this test covers decode + reflect/ack + delegation, not
                // the WebRTC/ringing state machine.
                const handleIncomingOffer = stub(
                    services.model.call.o2o,
                    'handleIncomingOffer',
                ).resolves();

                // Run task
                const handle = new TestHandle(services, [
                    // Reflect incoming `CALL_OFFER` message.
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.CALL_OFFER,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);
                await task.run(handle);
                handle.finish();

                // The valid payload decoded and the offer was delegated to the o2o call handler
                // (a leader, the default TestHandle is promoted). Now that call signaling is
                // HANDLED (no longer "unhandled"), the generic unhandled-message lastUpdate bump no
                // longer applies to it.
                expect(handleIncomingOffer.calledOnce, 'CALL_OFFER delegated to the handler').to.be
                    .true;

                // Call signaling creates no visible message in the conversation.
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length, 'No visible message should be created').to.equal(0);
            });

            it('does not bump lastUpdate for CALL_ANSWER message', async function () {
                const {model} = services;

                // Add contact
                const user1Contact = addTestUserAsContact(model, user1);

                // Get user conversation
                const conversation = model.conversations.getForReceiver({
                    type: ReceiverType.CONTACT,
                    uid: user1Contact.ctx,
                });
                assert(conversation !== undefined, 'Conversation with user 1 not found');

                // Verify that `lastUpdate` is initially `undefined`.
                expect(conversation.get().view.lastUpdate).to.be.undefined;

                // Create incoming `CALL_ANSWER` message.
                const task = createNewIncomingCallAnswerMessageTask(services, user1, me);

                // Stub the o2o call handler (see the CALL_OFFER test above).
                stub(services.model.call.o2o, 'handleIncomingAnswer').resolves();

                // Run task
                const handle = new TestHandle(services, [
                    // Reflect incoming `CALL_ANSWER` message.
                    NetworkExpectationFactory.reflectSingle((payload) => {
                        expect(payload.incomingMessage).not.to.be.undefined;
                        const incomingMessage = unwrap(payload.incomingMessage);
                        expect(incomingMessage.senderIdentity).to.equal(user1.identity.string);
                        expect(incomingMessage.type).to.equal(
                            protobuf.common.CspE2eMessageType.CALL_ANSWER,
                        );
                    }),
                    NetworkExpectationFactory.writeIncomingMessageAck(),
                ]);
                await task.run(handle);
                handle.finish();

                // Verify that `lastUpdate` remains `undefined`, as `CALL_ANSWER` has
                // `bumpLastUpdate: false`.
                expect(
                    conversation.get().view.lastUpdate,
                    'lastUpdate should remain undefined after CALL_ANSWER',
                ).to.be.undefined;

                // No message should be stored, as unhandled messages don't create visible messages.
                const messages = [...conversation.get().controller.getAllMessages().get()];
                expect(messages.length, 'No visible message should be created').to.equal(0);
            });

            it('does NOT process an incoming call offer on a linked follower (P-H13)', async function () {
                const {crypto, model} = services;
                addTestUserAsContact(model, user1);
                const handleIncomingOffer = stub(model.call.o2o, 'handleIncomingOffer').resolves();

                const payload: CallOfferPayload = {
                    callId: randomCallId(crypto),
                    offer: {sdpType: 'offer', sdp: 'v=0\r\n'},
                };
                const task = new IncomingCallOfferTask(
                    services,
                    randomMessageId(crypto),
                    user1.identity.string,
                    payload,
                );

                // Linked follower (non-leader): the offer is discarded, never rung.
                await task.run(new TestHandle(services, [], {promotedToLeader: false}));
                expect(handleIncomingOffer.called, 'a follower must not ring for a call').to.be
                    .false;

                // Standalone/leader (default): the offer IS processed.
                await task.run(new TestHandle(services, []));
                expect(handleIncomingOffer.calledOnce, 'a leader processes the incoming call').to.be
                    .true;
            });
        });
    });
}
