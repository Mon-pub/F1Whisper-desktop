import {expect} from 'chai';

import {NACL_CONSTANTS} from '~/common/crypto';
import {
    AcquaintanceLevel,
    ActivityState,
    CspE2eContactControlType,
    CspPayloadType,
    D2mPayloadType,
    GroupUserState,
} from '~/common/enum';
import {BLOB_ID_LENGTH, ensureBlobId} from '~/common/network/protocol/blob';
import type {ActiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingUserProfilePictureBroadcastTask} from '~/common/network/protocol/task/csp/outgoing-user-profile-picture-broadcast';
import {ensureIdentityString, type Nickname} from '~/common/network/types';
import {wrapRawBlobKey} from '~/common/network/types/keys';
import {UTF8} from '~/common/utils/codec';
import {Identity} from '~/common/utils/identity';
import {assertCspPayloadType, assertD2mPayloadType} from '~/test/mocha/common/assertions';
import {
    addTestGroup,
    addTestUserAsContact,
    createClientKey,
    makeTestServices,
    NetworkExpectationFactory,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {
    decodeMessageEncodable,
    decryptContainer,
} from '~/test/mocha/common/network/protocol/task/task-test-helpers';

/**
 * Test {@link OutgoingUserProfilePictureBroadcastTask} (F1Whisper fork: avatar-change broadcast).
 *
 * The heavy lifting (policy filtering, per-contact distribution cache, CSP message
 * encoding/sending) is already exhaustively covered by `user-profile-distribution-steps.spec.ts`
 * and `outgoing-csp-messages.spec.ts` respectively -- this file only exercises the task's own glue:
 * collecting all contacts, forcing distribution, and mapping the result into outgoing messages.
 */
export function run(): void {
    describe('OutgoingUserProfilePictureBroadcastTask', function () {
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

        let services: TestServices;
        this.beforeEach(function () {
            services = makeTestServices(me);
        });
        this.afterEach(function () {
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        it('broadcasts a SET_PROFILE_PICTURE message to a contact allowed to receive it', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {
                    blob: new Uint8Array([1, 2, 3, 4]),
                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                    key: wrapRawBlobKey(
                        services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    ),
                    lastUploadedAt: new Date(),
                },
                // Default share-with policy is 'everyone'; explicit for clarity.
                profilePictureShareWith: {group: 'everyone'},
            });
            addTestUserAsContact(services.model, user1);

            const task = new OutgoingUserProfilePictureBroadcastTask(services);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(),
                NetworkExpectationFactory.write((m) => {
                    assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    const message = decodeMessageEncodable(m.payload.payload);
                    const messageContainer = decryptContainer(
                        message,
                        services.device.csp.ck.public,
                        user1.ck,
                    );
                    expect(message.senderIdentity).to.deep.equal(UTF8.encode(me));
                    expect(messageContainer.type).to.eq(
                        CspE2eContactControlType.CONTACT_SET_PROFILE_PICTURE,
                    );
                }),
                NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                    services,
                    user1.identity.string,
                ),
            ]);
            await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
        });

        it('broadcasts a DELETE_PROFILE_PICTURE message when there is no profile picture', async function () {
            // No profile picture set: `profilePictureDistributionSteps` treats this as a removal
            // for every allowed contact.
            addTestUserAsContact(services.model, user1);

            const task = new OutgoingUserProfilePictureBroadcastTask(services);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(),
                NetworkExpectationFactory.write((m) => {
                    assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    const message = decodeMessageEncodable(m.payload.payload);
                    const messageContainer = decryptContainer(
                        message,
                        services.device.csp.ck.public,
                        user1.ck,
                    );
                    expect(message.senderIdentity).to.deep.equal(UTF8.encode(me));
                    expect(messageContainer.type).to.eq(
                        CspE2eContactControlType.CONTACT_DELETE_PROFILE_PICTURE,
                    );
                }),
                NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                    services,
                    user1.identity.string,
                ),
            ]);
            await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
        });

        it('is a no-op when there are no contacts', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {
                    blob: new Uint8Array([1, 2, 3, 4]),
                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                    key: wrapRawBlobKey(
                        services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    ),
                    lastUploadedAt: new Date(),
                },
            });

            const task = new OutgoingUserProfilePictureBroadcastTask(services);
            const handle = new TestHandle(services, []);
            await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
        });

        it('does not broadcast to a contact whose share policy is nobody', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {
                    blob: new Uint8Array([1, 2, 3, 4]),
                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                    key: wrapRawBlobKey(
                        services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    ),
                    lastUploadedAt: new Date(),
                },
                profilePictureShareWith: {group: 'nobody'},
            });
            addTestUserAsContact(services.model, user1);

            const task = new OutgoingUserProfilePictureBroadcastTask(services);
            // Nobody-policy + no prior "removed" cache entry still yields a remove message per
            // `profilePictureDistributionSteps` step 6 (it doesn't yet know the receiver never had a
            // picture); assert no SET message is sent instead.
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(),
                NetworkExpectationFactory.write((m) => {
                    assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    const message = decodeMessageEncodable(m.payload.payload);
                    const messageContainer = decryptContainer(
                        message,
                        services.device.csp.ck.public,
                        user1.ck,
                    );
                    expect(messageContainer.type).to.eq(
                        CspE2eContactControlType.CONTACT_DELETE_PROFILE_PICTURE,
                    );
                }),
                NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                    services,
                    user1.identity.string,
                ),
            ]);
            await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
        });

        it('PR3-H05: sends SET to a group acquaintance who only created an active common group', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {
                    blob: new Uint8Array([1, 2, 3, 4]),
                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                    key: wrapRawBlobKey(
                        services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    ),
                    lastUploadedAt: new Date(),
                },
                profilePictureShareWith: {group: 'everyone'},
            });
            const creator = addTestUserAsContact(services.model, {
                ...user1,
                acquaintanceLevel: AcquaintanceLevel.GROUP_OR_DELETED,
            });
            addTestGroup(services.model, {
                creator,
                members: [],
                userState: GroupUserState.MEMBER,
            });

            const task = new OutgoingUserProfilePictureBroadcastTask(services);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.reflectSingle(),
                NetworkExpectationFactory.write((m) => {
                    assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    const message = decodeMessageEncodable(m.payload.payload);
                    const messageContainer = decryptContainer(
                        message,
                        services.device.csp.ck.public,
                        user1.ck,
                    );
                    expect(messageContainer.type).to.equal(
                        CspE2eContactControlType.CONTACT_SET_PROFILE_PICTURE,
                    );
                }),
                NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                    services,
                    user1.identity.string,
                ),
            ]);

            await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
        });

        // U-H04 regressions (review's ack-based commit + blocked/invalid test matrix).
        describe('U-H04: per-contact ack-based cache commit', function () {
            this.beforeEach(function () {
                services.model.user.profileSettings.get().controller.update.direct({
                    profilePicture: {
                        blob: new Uint8Array([1, 2, 3, 4]),
                        blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                        key: wrapRawBlobKey(
                            services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                        ),
                        lastUploadedAt: new Date(),
                    },
                    profilePictureShareWith: {group: 'everyone'},
                });
            });

            it('commits only the acked contact when a later contact fails (fail-after-first-ack)', async function () {
                addTestUserAsContact(services.model, user1);
                addTestUserAsContact(services.model, user2);
                // User2 is excluded via the allow-list, putting it in the `remove` category; user1
                // stays in the `set` category. `OutgoingUserProfilePictureBroadcastTask` always
                // processes ALL `remove` contacts before ANY `set` contact, so this gives a
                // deterministic send order (user2 first, user1 second) without depending on
                // `Set`-iteration order among same-category contacts (which is not guaranteed stable
                // across environments).
                services.model.user.profileSettings.get().controller.update.direct({
                    profilePictureShareWith: {
                        group: 'allowList',
                        allowList: [user1.identity.string],
                    },
                });

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                const handle = new TestHandle(services, [
                    // User2 (remove, processed first): the write itself fails (simulated network
                    // failure) -- its ack is never reached, and the per-contact send/commit for user2
                    // must not affect user1's.
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write(() => {
                        throw new Error('simulated network failure sending to user2');
                    }),
                    // User1 (set, processed second): sent + acked successfully.
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user1.identity.string,
                    ),
                ]);

                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                const user2State =
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user2.identity.string,
                    );
                expect(
                    user2State,
                    'user2 never sent/acked successfully and must remain pending (uncommitted)',
                ).to.be.undefined;

                const user1State =
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    );
                expect(user1State?.type, 'user1 was acked and must be committed').to.eq(
                    'profile-picture',
                );
                expect(
                    services.persistentProtocolState
                        .getPendingUserProfileDistributions()
                        .map(({receiverIdentity}) => receiverIdentity),
                    'only the failed recipient must remain durably pending',
                ).to.deep.equal([user2.identity.string]);
            });

            it('sends privacy deletion to a blocked contact without sharing the picture', async function () {
                addTestUserAsContact(services.model, user1);
                addTestUserAsContact(services.model, user2);
                services.model.user.privacySettings.get().controller.update({
                    blockedIdentities: {identities: [user2.identity.string]},
                });

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                // Deletes are processed before sets. Blocking user2 must revoke its prior picture,
                // while the unblocked user1 still receives the current picture.
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                        const message = decodeMessageEncodable(m.payload.payload);
                        const messageContainer = decryptContainer(
                            message,
                            services.device.csp.ck.public,
                            user2.ck,
                        );
                        expect(messageContainer.type).to.eq(
                            CspE2eContactControlType.CONTACT_DELETE_PROFILE_PICTURE,
                        );
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user2.identity.string,
                    ),
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write(),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user1.identity.string,
                    ),
                ]);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user2.identity.string,
                    )?.type,
                    'a blocked contact must be recorded as having received privacy deletion',
                ).to.equal('removed');
            });

            it('excludes an invalid contact entirely, leaving no cache mark', async function () {
                addTestUserAsContact(services.model, user1);
                addTestUserAsContact(services.model, {
                    ...user2,
                    activityState: ActivityState.INVALID,
                });

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user1.identity.string,
                    ),
                ]);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user2.identity.string,
                    ),
                    'an invalid contact must never get a distribution cache mark',
                ).to.be.undefined;
            });
        });

        // FU-H07 regressions: a picture/policy change mid-broadcast must neither reach a contact
        // that has not been sent to yet nor be recorded as distributed. These are load-bearing
        // fault-injection tests: they mutate the generation (picture bytes or sharing policy) DURING
        // a send, and each asserts the guard aborts. Removing an `isStale` guard from the broadcast
        // makes the corresponding test fail (an unexpected SET write, or a stale cache commit).
        describe('FU-H07: generation revalidation aborts a superseded broadcast', function () {
            this.beforeEach(function () {
                services.model.user.profileSettings.get().controller.update.direct({
                    profilePicture: {
                        blob: new Uint8Array([1, 2, 3, 4]),
                        blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                        key: wrapRawBlobKey(
                            services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                        ),
                        lastUploadedAt: new Date(),
                    },
                    profilePictureShareWith: {group: 'everyone'},
                });
            });

            it('never sends the old picture to a later contact after a mid-broadcast policy change to nobody', async function () {
                addTestUserAsContact(services.model, user1);
                addTestUserAsContact(services.model, user2);
                // Put user2 in the `remove` category (allow-list excludes it) and user1 in the `set`
                // category. Removes are always processed before sets, so user2 is deterministically
                // first and user1 (the SET) is second.
                services.model.user.profileSettings.get().controller.update.direct({
                    profilePictureShareWith: {
                        group: 'allowList',
                        allowList: [user1.identity.string],
                    },
                });

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                // Only user2's remove is expected. While it is being written, the sharing policy is
                // flipped to `nobody`; user1's SET must then be aborted at its pre-send guard, so NO
                // SET write for user1 is provided -- an unexpected write would fail the test.
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                        const message = decodeMessageEncodable(m.payload.payload);
                        const messageContainer = decryptContainer(
                            message,
                            services.device.csp.ck.public,
                            user2.ck,
                        );
                        expect(messageContainer.type).to.eq(
                            CspE2eContactControlType.CONTACT_DELETE_PROFILE_PICTURE,
                        );
                        // Fault injection: the user restricts sharing to nobody mid-broadcast.
                        services.model.user.profileSettings.get().controller.update.direct({
                            profilePictureShareWith: {group: 'nobody'},
                        });
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user2.identity.string,
                    ),
                ]);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    ),
                    'user1 was never sent to (policy changed before its send), so it must have no cache mark',
                ).to.be.undefined;
            });

            it('never sends the old picture to a later contact after a mid-broadcast picture replace', async function () {
                addTestUserAsContact(services.model, user1);
                addTestUserAsContact(services.model, user2);
                // Same deterministic ordering trick: user2 = remove (first), user1 = set (second).
                services.model.user.profileSettings.get().controller.update.direct({
                    profilePictureShareWith: {
                        group: 'allowList',
                        allowList: [user1.identity.string],
                    },
                });

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                        // Fault injection: the user replaces the picture mid-broadcast.
                        services.model.user.profileSettings.get().controller.update.direct({
                            profilePicture: {
                                blob: new Uint8Array([9, 9, 9, 9]),
                                blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                                key: wrapRawBlobKey(
                                    services.crypto.randomBytes(
                                        new Uint8Array(NACL_CONSTANTS.KEY_LENGTH),
                                    ),
                                ),
                                lastUploadedAt: new Date(),
                            },
                        });
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user2.identity.string,
                    ),
                ]);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    ),
                    'user1 was never sent to (picture replaced before its send), so it must have no cache mark',
                ).to.be.undefined;
            });

            it('does not commit a contact as distributed when the picture is replaced during its own send', async function () {
                addTestUserAsContact(services.model, user1);

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                // User1's SET passes the pre-send guard (still current), is written and acked, but the
                // picture is replaced during the write -> the pre-commit guard must skip the cache
                // commit so the picture is never recorded as distributed to user1.
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                        const message = decodeMessageEncodable(m.payload.payload);
                        const messageContainer = decryptContainer(
                            message,
                            services.device.csp.ck.public,
                            user1.ck,
                        );
                        expect(messageContainer.type).to.eq(
                            CspE2eContactControlType.CONTACT_SET_PROFILE_PICTURE,
                        );
                        // Fault injection: the user replaces the picture while this send is in flight.
                        services.model.user.profileSettings.get().controller.update.direct({
                            profilePicture: {
                                blob: new Uint8Array([9, 9, 9, 9]),
                                blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                                key: wrapRawBlobKey(
                                    services.crypto.randomBytes(
                                        new Uint8Array(NACL_CONSTANTS.KEY_LENGTH),
                                    ),
                                ),
                                lastUploadedAt: new Date(),
                            },
                        });
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user1.identity.string,
                    ),
                ]);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    ),
                    'the picture was superseded before commit, so user1 must not be recorded as distributed',
                ).to.be.undefined;
            });

            it('suppresses the CSP write when reflection invalidates the generation', async function () {
                addTestUserAsContact(services.model, user1);

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(() => {
                        services.model.user.profileSettings.get().controller.update.direct({
                            profilePictureShareWith: {group: 'nobody'},
                        });
                    }),
                ]);

                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    ),
                    'a control invalidated between reflection and CSP must not be ACK-cached',
                ).to.be.undefined;
                expect(
                    services.persistentProtocolState.getPendingUserProfileDistributions(),
                    'the skipped control must remain durable',
                ).to.have.length(1);
            });

            it('suppresses an old SET when reflected metadata replaces the blob for identical bytes', async function () {
                addTestUserAsContact(services.model, user1);

                const task = new OutgoingUserProfilePictureBroadcastTask(services);
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(() => {
                        const current =
                            services.model.user.profileSettings.get().view.profilePicture;
                        services.model.user.profileSettings.get().controller.update.direct({
                            profilePicture: {
                                blob: new Uint8Array(current?.blob ?? []),
                                blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(9)),
                                key: wrapRawBlobKey(
                                    services.crypto.randomBytes(
                                        new Uint8Array(NACL_CONSTANTS.KEY_LENGTH),
                                    ),
                                ),
                                lastUploadedAt: new Date(),
                            },
                        });
                    }),
                ]);

                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    ),
                    'the superseded blob ID must not be sent or ACK-cached',
                ).to.be.undefined;
                expect(
                    services.persistentProtocolState.getPendingUserProfileDistributions(),
                ).to.have.length(1);
            });

            it('re-plans a failed SET as a privacy DELETE on durable retry', async function () {
                addTestUserAsContact(services.model, user1);
                // A prior acknowledged DELETE must not suppress the retry DELETE: the failed SET
                // below may still have crossed the CSP boundary before its failure/unknown ACK.
                services.persistentProtocolState.setLastUserProfileDistributionState(
                    user1.identity.string,
                    {type: 'removed'},
                    new Date(),
                );

                const firstAttempt = new OutgoingUserProfilePictureBroadcastTask(services);
                const failedHandle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write(() => {
                        throw new Error('simulated SET failure');
                    }),
                ]);
                await firstAttempt.run(
                    failedHandle as unknown as ActiveTaskCodecHandle<'persistent'>,
                );
                failedHandle.finish();

                const [pending] =
                    services.persistentProtocolState.getPendingUserProfileDistributions();
                expect(pending?.receiverIdentity).to.equal(user1.identity.string);

                // Change current privacy policy without invoking another outgoing message or eager
                // broadcast. Recovery must derive DELETE rather than replaying the stale SET.
                services.model.user.profileSettings.get().controller.update.direct({
                    profilePictureShareWith: {group: 'nobody'},
                });

                const retry = new OutgoingUserProfilePictureBroadcastTask(services, {
                    receiverIdentity: user1.identity.string,
                    pendingGeneration: pending?.generation ?? 0,
                });
                const retryHandle = new TestHandle(services, [
                    NetworkExpectationFactory.reflectSingle(),
                    NetworkExpectationFactory.write((m) => {
                        assertD2mPayloadType(m.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(m.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                        const message = decodeMessageEncodable(m.payload.payload);
                        const messageContainer = decryptContainer(
                            message,
                            services.device.csp.ck.public,
                            user1.ck,
                        );
                        expect(messageContainer.type).to.equal(
                            CspE2eContactControlType.CONTACT_DELETE_PROFILE_PICTURE,
                        );
                    }),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        user1.identity.string,
                    ),
                ]);
                await retry.run(retryHandle as unknown as ActiveTaskCodecHandle<'persistent'>);
                retryHandle.finish();

                expect(
                    services.persistentProtocolState.getLastUserProfileDistributionState(
                        user1.identity.string,
                    )?.type,
                ).to.equal('removed');
                expect(services.persistentProtocolState.getPendingUserProfileDistributions()).to.be
                    .empty;
            });
        });
    });
}
