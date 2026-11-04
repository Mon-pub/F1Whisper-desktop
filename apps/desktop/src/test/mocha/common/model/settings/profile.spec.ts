import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';
import {restore, stub} from 'sinon';

import {NACL_CONSTANTS, type EncryptedData} from '~/common/crypto';
import {TransactionScope} from '~/common/enum';
import * as protobuf from '~/common/network/protobuf';
import {
    BLOB_ID_LENGTH,
    encryptAndUploadBlobWithEncryptionKey,
    ensureBlobId,
    type BlobDownloadResult,
    type BlobId,
} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import type {ActiveTaskCodecHandle, PassiveTaskCodecHandle} from '~/common/network/protocol/task';
import {profilePictureDistributionActionForContact} from '~/common/network/protocol/task/common/user-profile-distribution';
import {OutgoingUserProfilePictureBroadcastTask} from '~/common/network/protocol/task/csp/outgoing-user-profile-picture-broadcast';
import {getDeltaImageMessage} from '~/common/network/protocol/task/d2d';
import {ReflectUserProfilePictureSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync-transaction';
import {ReflectedUserProfileSyncTask} from '~/common/network/protocol/task/d2d/reflected-user-profile-sync';
import {ensureD2mDeviceId, ensureIdentityString} from '~/common/network/types';
import {wrapRawBlobKey} from '~/common/network/types/keys';
import {assert} from '~/common/utils/assert';
import {
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    NetworkExpectationFactory,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';

/**
 * F1Whisper fork (U-H04): tests for `ProfileSettingsModelController`'s CAS/version guard
 * (`_profilePictureChangeVersion`, `model/settings/profile.ts`) directly.
 *
 * This is a DIFFERENT layer than `user-profile-distribution-steps.spec.ts`'s CAS coverage: that file
 * tests the CSP contact-distribution helper (`profilePictureDistributionSteps`) in isolation, one
 * level below the model. These tests drive `ProfileSettingsModelController.setProfilePicture.fromLocal`
 * / `removeProfilePicture.fromLocal` themselves -- the review flagged this layer as having ZERO test
 * coverage despite carrying its own independent version guard.
 *
 * `services.taskManager.schedule` is stubbed to resolve immediately without actually running the
 * scheduled task (there is no live D2M/CSP connection in this harness) -- this both lets the test
 * observe exactly what got scheduled (via `instanceof` checks on the captured tasks) and, more
 * importantly, lets a SECOND controller call interleave with and outrun a still-in-flight STALE call
 * by controlling when the stale call's blob upload resolves.
 */
export function run(): void {
    describe('ProfileSettingsModelController: profile-picture CAS guard (U-H04)', function () {
        const me = makeTestUser('MEMEMEME');

        let services: TestServices;
        let scheduledTasks: unknown[];
        // Reassignable by individual tests instead of re-stubbing `taskManager.schedule` (sinon
        // refuses to wrap an already-wrapped method), so a test can override the schedule outcome
        // (e.g. reject a specific task type) without a second `stub(...)` call.
        let scheduleBehavior: (task: unknown) => Promise<unknown>;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            scheduledTasks = [];
            // eslint-disable-next-line @typescript-eslint/require-await
            scheduleBehavior = async (task) => {
                scheduledTasks.push(task);
                return undefined;
            };
            stub(services.taskManager, 'schedule').callsFake(
                async (task: unknown) => await scheduleBehavior(task),
            );
        });

        this.afterEach(function () {
            restore();
        });

        function countScheduled(ctor: abstract new (...args: never[]) => unknown): number {
            return scheduledTasks.filter((task) => task instanceof ctor).length;
        }

        function wireRoundTripUserProfileSync(
            message: protobuf.d2d.UserProfileSync,
        ): protobuf.d2d.UserProfileSync {
            return protobuf.d2d.UserProfileSync.decode(
                protobuf.d2d.UserProfileSync.encode(
                    message as unknown as protobuf.d2d.UserProfileSyncEncodable,
                ).finish(),
            );
        }

        async function inspectReflectedUserProfile(
            inspector: (profile: protobuf.d2d_sync.UserProfile) => void,
        ): Promise<void> {
            const task = scheduledTasks.find(
                (scheduled) => scheduled instanceof ReflectUserProfilePictureSyncTransactionTask,
            );
            assert(task instanceof ReflectUserProfilePictureSyncTransactionTask);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.startTransaction(0, TransactionScope.USER_PROFILE_SYNC),
                NetworkExpectationFactory.reflectSingle((envelope) => {
                    const profile = envelope.userProfileSync?.update?.userProfile;
                    assert(profile !== null && profile !== undefined);
                    inspector(profile);
                }),
            ]);
            await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
        }

        it('PR3-H05: blocking synchronously enrolls durable DELETE intent before reconciliation scheduling completes', async function () {
            const contact = addTestUserAsContact(services.model, makeTestUser('USER0001'));
            const blobId = ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(1));
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {blob: new Uint8Array([1, 2, 3, 4]), blobId},
            });
            services.persistentProtocolState.setLastUserProfileDistributionState(
                contact.get().view.identity,
                {blobId, type: 'profile-picture'},
                new Date(),
            );

            const scheduling = new ResolvablePromise<unknown>({uncaught: 'default'});
            scheduleBehavior = async (task) => {
                scheduledTasks.push(task);
                return await scheduling;
            };

            const privacyController = services.model.user.privacySettings.get().controller;
            expect(privacyController.isContactBlocked(contact.get().view.identity)).to.be.false;

            privacyController.update({
                blockedIdentities: {identities: [contact.get().view.identity]},
            });

            expect(scheduling.done, 'broadcast scheduling must still be pending').to.be.false;
            expect(
                profilePictureDistributionActionForContact(services, contact.get()),
                'the newly blocked contact must now require a privacy deletion',
            ).to.equal('delete');
            expect(
                services.persistentProtocolState
                    .getPendingUserProfileDistributions()
                    .map(({receiverIdentity}) => receiverIdentity),
                'durable recovery must observe the delete intent before scheduling completes',
            ).to.deep.equal([contact.get().view.identity]);

            scheduling.resolve(undefined);
            await scheduling;
        });

        it('PR3-H05: setProfilePicture enrolls durable recipient intent while blob upload is pending', async function () {
            const contact = addTestUserAsContact(services.model, makeTestUser('USER0001'));
            const upload = new ResolvablePromise<BlobId, Error>({uncaught: 'default'});
            stub(services.blob, 'upload').callsFake(async () => await upload);

            const setResult = services.model.user.profileSettings
                .get()
                .controller.setProfilePicture.fromLocal(new Uint8Array([5, 6, 7, 8]));

            expect(upload.done, 'the blob upload must still be pending').to.be.false;
            expect(
                services.persistentProtocolState
                    .getPendingUserProfileDistributions()
                    .map(({receiverIdentity}) => receiverIdentity),
                'startup recovery must see the recipient before the upload settles',
            ).to.deep.equal([contact.get().view.identity]);

            const uploadError = new Error('simulated profile-picture upload failure');
            const rejection = setResult.catch((error: unknown) => error);
            upload.reject(uploadError);
            expect(await rejection).to.equal(uploadError);
            expect(
                services.persistentProtocolState
                    .getPendingUserProfileDistributions()
                    .map(({receiverIdentity}) => receiverIdentity),
                'a rejected upload must leave the durable recipient intent recoverable',
            ).to.deep.equal([contact.get().view.identity]);
        });

        it('a stale set() that resolves its upload AFTER a remove() completes must not resurrect it', async function () {
            const staleUpload = new ResolvablePromise<BlobId>({uncaught: 'default'});
            stub(services.blob, 'upload').callsFake(async () => await staleUpload);

            const controller = services.model.user.profileSettings.get().controller;

            // The stale set() starts and blocks on its own (never-resolving-yet) blob upload.
            const staleSetResult = controller.setProfilePicture.fromLocal(
                new Uint8Array([1, 1, 1, 1]),
            );

            // Remove() runs to full completion (including its own reflect + broadcast schedule)
            // while the stale set()'s upload is still pending.
            await controller.removeProfilePicture.fromLocal();

            // Only NOW does the stale upload resolve -- its CAS guard must see it was superseded.
            staleUpload.resolve(ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)));
            await staleSetResult;

            expect(
                services.model.user.profileSettings.get().view.profilePicture,
                'the winning remove() must not be resurrected by the stale set()',
            ).to.be.undefined;

            // Exactly one broadcast (remove's) may have been scheduled; the abandoned stale set()
            // must never reach its own broadcast call.
            expect(
                countScheduled(OutgoingUserProfilePictureBroadcastTask),
                'only the winning remove() may trigger a broadcast',
            ).to.eq(1);
        });

        it('a stale set() that resolves its upload AFTER a newer set() completes must not overwrite it', async function () {
            const staleUpload = new ResolvablePromise<BlobId>({uncaught: 'default'});
            let uploadCallCount = 0;
            stub(services.blob, 'upload').callsFake(async () => {
                uploadCallCount += 1;
                if (uploadCallCount === 1) {
                    // The stale call's upload: blocks until resolved below.
                    return await staleUpload;
                }
                // The newer call's upload: resolves immediately with a distinct blob ID.
                return ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(2));
            });

            const controller = services.model.user.profileSettings.get().controller;

            // The stale set() starts and blocks on its own upload.
            const staleSetResult = controller.setProfilePicture.fromLocal(
                new Uint8Array([1, 1, 1, 1]),
            );

            // The newer set() runs to full completion (its OWN upload resolves immediately, being
            // the second call to the stub) while the stale call's upload is still pending.
            await controller.setProfilePicture.fromLocal(new Uint8Array([2, 2, 2, 2]));

            // Only NOW does the stale call's upload resolve.
            staleUpload.resolve(ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(1)));
            await staleSetResult;

            expect(
                services.model.user.profileSettings.get().view.profilePicture?.blob,
                'the newer set() must win; the stale set() must never overwrite it after the fact',
            ).to.byteEqual(new Uint8Array([2, 2, 2, 2]));

            // Exactly one broadcast (the newer call's) may have been scheduled.
            expect(
                countScheduled(OutgoingUserProfilePictureBroadcastTask),
                'only the winning set() may trigger a broadcast',
            ).to.eq(1);
        });

        it('a delayed local upload cannot resurrect a reflected removal', async function () {
            const staleUpload = new ResolvablePromise<BlobId>({uncaught: 'default'});
            stub(services.blob, 'upload').callsFake(async () => await staleUpload);
            const controller = services.model.user.profileSettings.get().controller;
            const staleSet = controller.setProfilePicture.fromLocal(new Uint8Array([1, 1, 1, 1]));
            const reflectedRemoval = new protobuf.d2d.UserProfileSync({
                update: new protobuf.d2d.UserProfileSync.Update({
                    userProfile: new protobuf.d2d_sync.UserProfile({
                        profilePicture: new protobuf.common.DeltaImage({
                            removed: protobuf.UNIT_MESSAGE,
                        }),
                    }),
                }),
            });
            const reflectedTask = new ReflectedUserProfileSyncTask(
                services,
                reflectedRemoval,
                ensureD2mDeviceId(1n),
            );
            const handle = new TestHandle(services, []);

            await reflectedTask.run(handle as unknown as PassiveTaskCodecHandle);
            handle.finish();
            expect(
                services.model.user.profileSettings.get().view.profilePicture,
                'the reflected removal must apply before the stale upload settles',
            ).to.be.undefined;
            staleUpload.resolve(ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(1)));
            await staleSet;

            expect(services.model.user.profileSettings.get().view.profilePicture).to.be.undefined;
            expect(services.model.db.getPendingUserProfileSync()).to.be.undefined;
            expect(
                countScheduled(ReflectUserProfilePictureSyncTransactionTask),
                'the stale local upload must not create a replacement D2D intent',
            ).to.equal(0);
        });

        it('a delayed reflected download cannot overwrite a newer local removal', async function () {
            const picture = new Uint8Array([7, 7, 7, 7]);
            const blobId = ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(7));
            const key = wrapRawBlobKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );
            let encrypted: EncryptedData | undefined;
            // eslint-disable-next-line @typescript-eslint/require-await
            stub(services.blob, 'upload').callsFake(async (uploadScope, data) => {
                void uploadScope;
                encrypted = data;
                return blobId;
            });
            await encryptAndUploadBlobWithEncryptionKey(
                services,
                picture,
                BLOB_FILE_NONCE,
                key,
                'local',
            );
            assert(encrypted !== undefined);
            const download = new ResolvablePromise<BlobDownloadResult>({uncaught: 'default'});
            stub(services.blob, 'download').callsFake(async () => await download);
            const reflectedSet = wireRoundTripUserProfileSync(
                new protobuf.d2d.UserProfileSync({
                    update: new protobuf.d2d.UserProfileSync.Update({
                        userProfile: new protobuf.d2d_sync.UserProfile({
                            profilePicture: getDeltaImageMessage({
                                type: 'set',
                                blob: {
                                    blobId,
                                    key,
                                    nonce: BLOB_FILE_NONCE,
                                    uploadedAt: new Date(),
                                },
                            }),
                        }),
                    }),
                }),
            );
            const reflectedTask = new ReflectedUserProfileSyncTask(
                services,
                reflectedSet,
                ensureD2mDeviceId(1n),
            );
            const handle = new TestHandle(services, []);
            const reflected = reflectedTask.run(handle as unknown as PassiveTaskCodecHandle);

            await services.model.user.profileSettings
                .get()
                .controller.removeProfilePicture.fromLocal();
            const localPending = services.model.db.getPendingUserProfileSync();
            assert(localPending !== undefined);
            download.resolve({
                data: encrypted,
                done: async () => {},
            });
            await reflected;
            handle.finish();

            expect(services.model.user.profileSettings.get().view.profilePicture).to.be.undefined;
            expect(services.model.db.hasPendingUserProfileSync(localPending.generation)).to.be.true;
        });

        it('a delayed reflected SET cannot overwrite a later same-value reflected removal', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePictureShareWith: {group: 'nobody'},
            });
            const picture = new Uint8Array([8, 8, 8, 8]);
            const blobId = ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(8));
            const key = wrapRawBlobKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );
            let encrypted: EncryptedData | undefined;
            // eslint-disable-next-line @typescript-eslint/require-await
            stub(services.blob, 'upload').callsFake(async (uploadScope, data) => {
                void uploadScope;
                encrypted = data;
                return blobId;
            });
            await encryptAndUploadBlobWithEncryptionKey(
                services,
                picture,
                BLOB_FILE_NONCE,
                key,
                'local',
            );
            assert(encrypted !== undefined);
            const download = new ResolvablePromise<BlobDownloadResult>({uncaught: 'default'});
            stub(services.blob, 'download').callsFake(async () => await download);
            const delayedSet = new ReflectedUserProfileSyncTask(
                services,
                wireRoundTripUserProfileSync(
                    new protobuf.d2d.UserProfileSync({
                        update: new protobuf.d2d.UserProfileSync.Update({
                            userProfile: new protobuf.d2d_sync.UserProfile({
                                profilePicture: getDeltaImageMessage({
                                    type: 'set',
                                    blob: {
                                        blobId,
                                        key,
                                        nonce: BLOB_FILE_NONCE,
                                        uploadedAt: new Date(),
                                    },
                                }),
                                profilePictureShareWith:
                                    new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith({
                                        everyone: protobuf.UNIT_MESSAGE,
                                    }),
                            }),
                        }),
                    }),
                ),
                ensureD2mDeviceId(1n),
            );
            const delayedHandle = new TestHandle(services, []);
            const delayed = delayedSet.run(delayedHandle as unknown as PassiveTaskCodecHandle);
            const laterRemoval = new ReflectedUserProfileSyncTask(
                services,
                wireRoundTripUserProfileSync(
                    new protobuf.d2d.UserProfileSync({
                        update: new protobuf.d2d.UserProfileSync.Update({
                            userProfile: new protobuf.d2d_sync.UserProfile({
                                profilePicture: new protobuf.common.DeltaImage({
                                    removed: protobuf.UNIT_MESSAGE,
                                }),
                                profilePictureShareWith:
                                    new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith({
                                        nobody: protobuf.UNIT_MESSAGE,
                                    }),
                            }),
                        }),
                    }),
                ),
                ensureD2mDeviceId(2n),
            );
            const removalHandle = new TestHandle(services, []);

            await laterRemoval.run(removalHandle as unknown as PassiveTaskCodecHandle);
            removalHandle.finish();
            download.resolve({
                data: encrypted,
                done: async () => {},
            });
            await delayed;
            delayedHandle.finish();

            expect(services.model.user.profileSettings.get().view.profilePicture).to.be.undefined;
            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
            ).to.deep.equal({group: 'nobody'});
        });

        it('reserves arrival order so a later reflected SET wins even when the older download finishes first', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePictureShareWith: {group: 'nobody'},
            });
            const picture = new Uint8Array([6, 6, 6, 6]);
            const blobId = ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(6));
            const key = wrapRawBlobKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );
            let encrypted: EncryptedData | undefined;
            // eslint-disable-next-line @typescript-eslint/require-await
            stub(services.blob, 'upload').callsFake(async (uploadScope, data) => {
                void uploadScope;
                encrypted = data;
                return blobId;
            });
            await encryptAndUploadBlobWithEncryptionKey(
                services,
                picture,
                BLOB_FILE_NONCE,
                key,
                'local',
            );
            assert(encrypted !== undefined);
            const olderDownload = new ResolvablePromise<BlobDownloadResult>({uncaught: 'default'});
            const laterDownload = new ResolvablePromise<BlobDownloadResult>({uncaught: 'default'});
            let downloadCount = 0;
            stub(services.blob, 'download').callsFake(async () => {
                downloadCount += 1;
                return await (downloadCount === 1 ? olderDownload : laterDownload);
            });
            function makeSet(policy: 'everyone' | 'nobody'): protobuf.d2d.UserProfileSync {
                return wireRoundTripUserProfileSync(
                    new protobuf.d2d.UserProfileSync({
                        update: new protobuf.d2d.UserProfileSync.Update({
                            userProfile: new protobuf.d2d_sync.UserProfile({
                                nickname:
                                    policy === 'everyone' ? 'Older nickname' : 'Later nickname',
                                profilePicture: getDeltaImageMessage({
                                    type: 'set',
                                    blob: {
                                        blobId,
                                        key,
                                        nonce: BLOB_FILE_NONCE,
                                        uploadedAt: new Date(),
                                    },
                                }),
                                profilePictureShareWith:
                                    new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith(
                                        policy === 'everyone'
                                            ? {everyone: protobuf.UNIT_MESSAGE}
                                            : {nobody: protobuf.UNIT_MESSAGE},
                                    ),
                            }),
                        }),
                    }),
                );
            }
            const olderTask = new ReflectedUserProfileSyncTask(
                services,
                makeSet('everyone'),
                ensureD2mDeviceId(1n),
            );
            const laterTask = new ReflectedUserProfileSyncTask(
                services,
                makeSet('nobody'),
                ensureD2mDeviceId(2n),
            );
            const olderHandle = new TestHandle(services, []);
            const laterHandle = new TestHandle(services, []);
            const older = olderTask.run(olderHandle as unknown as PassiveTaskCodecHandle);
            const later = laterTask.run(laterHandle as unknown as PassiveTaskCodecHandle);

            olderDownload.resolve({data: encrypted, done: async () => {}});
            await older;
            laterDownload.resolve({data: encrypted, done: async () => {}});
            await later;
            olderHandle.finish();
            laterHandle.finish();

            expect(
                services.model.user.profileSettings.get().view.profilePicture?.blob,
            ).to.byteEqual(picture);
            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
            ).to.deep.equal({group: 'nobody'});
            expect(services.model.user.profileSettings.get().view.nickname).to.equal(
                'Later nickname',
            );
        });

        it('does not apply a permissive reflected policy when its picture download fails', async function () {
            const oldPicture = new Uint8Array([3, 3, 3, 3]);
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {blob: oldPicture},
                profilePictureShareWith: {group: 'nobody'},
            });
            const key = wrapRawBlobKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );
            const message = wireRoundTripUserProfileSync(
                new protobuf.d2d.UserProfileSync({
                    update: new protobuf.d2d.UserProfileSync.Update({
                        userProfile: new protobuf.d2d_sync.UserProfile({
                            profilePicture: getDeltaImageMessage({
                                type: 'set',
                                blob: {
                                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(4)),
                                    key,
                                    nonce: BLOB_FILE_NONCE,
                                    uploadedAt: new Date(),
                                },
                            }),
                            profilePictureShareWith:
                                new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith({
                                    everyone: protobuf.UNIT_MESSAGE,
                                }),
                        }),
                    }),
                }),
            );
            const task = new ReflectedUserProfileSyncTask(services, message, ensureD2mDeviceId(1n));
            const handle = new TestHandle(services, []);

            await task.run(handle as unknown as PassiveTaskCodecHandle);
            handle.finish();

            expect(
                services.model.user.profileSettings.get().view.profilePicture?.blob,
            ).to.byteEqual(oldPicture);
            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
            ).to.deep.equal({group: 'nobody'});
        });

        it('applies a restrictive reflected policy when its picture download fails', async function () {
            const oldPicture = new Uint8Array([2, 2, 2, 2]);
            const controller = services.model.user.profileSettings.get().controller;
            controller.update.direct({
                profilePicture: {blob: oldPicture},
                profilePictureShareWith: {group: 'everyone'},
            });
            const pending = services.model.db.persistLocalProfileSettings(
                services.model.user.profileSettings.get().view,
                new Date(),
            ).pending;
            const key = wrapRawBlobKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );
            const message = wireRoundTripUserProfileSync(
                new protobuf.d2d.UserProfileSync({
                    update: new protobuf.d2d.UserProfileSync.Update({
                        userProfile: new protobuf.d2d_sync.UserProfile({
                            profilePicture: getDeltaImageMessage({
                                type: 'set',
                                blob: {
                                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(5)),
                                    key,
                                    nonce: BLOB_FILE_NONCE,
                                    uploadedAt: new Date(),
                                },
                            }),
                            profilePictureShareWith:
                                new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith({
                                    nobody: protobuf.UNIT_MESSAGE,
                                }),
                        }),
                    }),
                }),
            );
            const task = new ReflectedUserProfileSyncTask(services, message, ensureD2mDeviceId(1n));
            const handle = new TestHandle(services, []);
            const download = stub(services.blob, 'download').rejects(
                new Error('simulated reflected picture download failure'),
            );
            const revisionBefore = controller.getProfilePicturePolicyRevision();

            await task.run(handle as unknown as PassiveTaskCodecHandle);
            handle.finish();

            expect(download.calledOnce).to.be.true;
            expect(controller.getProfilePicturePolicyRevision()).to.equal(revisionBefore + 2);
            expect(
                services.model.user.profileSettings.get().view.profilePicture?.blob,
            ).to.byteEqual(oldPicture);
            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
            ).to.deep.equal({group: 'nobody'});
            expect(services.model.db.hasPendingUserProfileSync(pending.generation)).to.be.false;
        });

        it('applies a reflected allow-list contraction when its picture download fails', async function () {
            const keptIdentity = ensureIdentityString('USER0001');
            const removedIdentity = ensureIdentityString('USER0002');
            const oldPicture = new Uint8Array([2, 3, 2, 3]);
            const controller = services.model.user.profileSettings.get().controller;
            controller.update.direct({
                profilePicture: {blob: oldPicture},
                profilePictureShareWith: {
                    group: 'allowList',
                    allowList: [keptIdentity, removedIdentity],
                },
            });
            const pending = services.model.db.persistLocalProfileSettings(
                services.model.user.profileSettings.get().view,
                new Date(),
            ).pending;
            const key = wrapRawBlobKey(
                services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
            );
            const message = wireRoundTripUserProfileSync(
                new protobuf.d2d.UserProfileSync({
                    update: new protobuf.d2d.UserProfileSync.Update({
                        userProfile: new protobuf.d2d_sync.UserProfile({
                            profilePicture: getDeltaImageMessage({
                                type: 'set',
                                blob: {
                                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(6)),
                                    key,
                                    nonce: BLOB_FILE_NONCE,
                                    uploadedAt: new Date(),
                                },
                            }),
                            profilePictureShareWith:
                                new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith({
                                    allowList: new protobuf.common.Identities({
                                        identities: [keptIdentity],
                                    }),
                                }),
                        }),
                    }),
                }),
            );
            const task = new ReflectedUserProfileSyncTask(services, message, ensureD2mDeviceId(1n));
            const handle = new TestHandle(services, []);
            const download = stub(services.blob, 'download').rejects(
                new Error('simulated reflected picture download failure'),
            );
            const revisionBefore = controller.getProfilePicturePolicyRevision();

            await task.run(handle as unknown as PassiveTaskCodecHandle);
            handle.finish();

            expect(download.calledOnce).to.be.true;
            expect(controller.getProfilePicturePolicyRevision()).to.equal(revisionBefore + 2);
            expect(
                services.model.user.profileSettings.get().view.profilePicture?.blob,
            ).to.byteEqual(oldPicture);
            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
            ).to.deep.equal({group: 'allowList', allowList: [keptIdentity]});
            expect(services.model.db.hasPendingUserProfileSync(pending.generation)).to.be.false;
        });

        it('a lone set() with no interleaving still persists, reflects, and broadcasts normally', async function () {
            // eslint-disable-next-line @typescript-eslint/require-await
            stub(services.blob, 'upload').callsFake(async () =>
                ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
            );

            const controller = services.model.user.profileSettings.get().controller;
            await controller.setProfilePicture.fromLocal(new Uint8Array([9, 9, 9, 9]));

            expect(
                services.model.user.profileSettings.get().view.profilePicture?.blob,
                'the picture must be persisted',
            ).to.byteEqual(new Uint8Array([9, 9, 9, 9]));
            expect(
                countScheduled(ReflectUserProfilePictureSyncTransactionTask),
                'the D2D reflect must be scheduled',
            ).to.eq(1);
            expect(
                countScheduled(OutgoingUserProfilePictureBroadcastTask),
                'the contact broadcast must be scheduled',
            ).to.eq(1);
            await inspectReflectedUserProfile((profile) => {
                expect(profile.profilePicture?.updated).not.to.be.undefined;
                expect(profile.profilePictureShareWith?.everyone).not.to.be.undefined;
            });
        });

        it('a lone remove() with no interleaving still reflects and broadcasts normally', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {blob: new Uint8Array([9, 9, 9, 9])},
            });

            const controller = services.model.user.profileSettings.get().controller;
            await controller.removeProfilePicture.fromLocal();

            expect(
                services.model.user.profileSettings.get().view.profilePicture,
                'the picture must be removed',
            ).to.be.undefined;
            expect(
                countScheduled(ReflectUserProfilePictureSyncTransactionTask),
                'the D2D reflect must be scheduled',
            ).to.eq(1);
            expect(
                countScheduled(OutgoingUserProfilePictureBroadcastTask),
                'the contact broadcast must be scheduled',
            ).to.eq(1);
        });

        it('aborts a queued UserProfileSync when its profile generation is stale', async function () {
            stub(services.blob, 'upload').resolves(ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)));
            await services.model.user.profileSettings
                .get()
                .controller.setProfilePicture.fromLocal(new Uint8Array([7, 7, 7, 7]));
            const task = scheduledTasks.find(
                (scheduled) => scheduled instanceof ReflectUserProfilePictureSyncTransactionTask,
            );
            assert(task instanceof ReflectUserProfilePictureSyncTransactionTask);

            // A newer local generation replaces the durable row before the old task starts.
            await services.model.user.profileSettings
                .get()
                .controller.setProfilePictureShareWith.fromLocal({group: 'nobody'});
            const handle = new TestHandle(services, []);

            expect(
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>),
            ).to.equal('aborted');
            handle.finish();
        });

        it('a D2D reflect failure does not prevent the contact broadcast from being scheduled', async function () {
            // eslint-disable-next-line @typescript-eslint/require-await
            stub(services.blob, 'upload').callsFake(async () =>
                ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
            );
            // Override the default schedule behavior: reject ONLY the reflect task, to prove the
            // broadcast is independent of D2D success (matches the fix in `profile.ts`'s try/catch
            // around `taskManager.schedule(task)` for the reflect).
            // eslint-disable-next-line @typescript-eslint/require-await
            scheduleBehavior = async (task) => {
                scheduledTasks.push(task);
                if (task instanceof ReflectUserProfilePictureSyncTransactionTask) {
                    throw new Error('simulated D2D reflect failure');
                }
                return undefined;
            };

            const controller = services.model.user.profileSettings.get().controller;
            await controller.setProfilePicture.fromLocal(new Uint8Array([5, 5, 5, 5]));

            expect(
                countScheduled(OutgoingUserProfilePictureBroadcastTask),
                'the broadcast must still be scheduled despite the reflect failure',
            ).to.eq(1);
        });

        // FU-H07: the sharing policy is half of the distribution generation, so changing it via the
        // model API must persist the new policy AND redistribute (via a broadcast).
        it('setProfilePictureShareWith persists the new policy and schedules a redistribution broadcast', async function () {
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {blob: new Uint8Array([9, 9, 9, 9])},
                profilePictureShareWith: {group: 'everyone'},
            });

            const controller = services.model.user.profileSettings.get().controller;
            await controller.setProfilePictureShareWith.fromLocal({group: 'nobody'});

            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
                'the new sharing policy must be persisted',
            ).to.deep.equal({group: 'nobody'});
            expect(
                countScheduled(OutgoingUserProfilePictureBroadcastTask),
                'a policy change must schedule a redistribution broadcast',
            ).to.eq(1);
            expect(
                countScheduled(ReflectUserProfilePictureSyncTransactionTask),
                'a policy change must schedule UserProfileSync reflection',
            ).to.eq(1);
            await inspectReflectedUserProfile((profile) => {
                expect(profile.profilePicture?.updated).not.to.be.undefined;
                expect(profile.profilePictureShareWith?.nobody).not.to.be.undefined;
            });
        });

        it('persists D2D sync intent before queueing and does not wait for an offline task', async function () {
            const scheduling = new ResolvablePromise<unknown>({uncaught: 'default'});
            let pendingAtSchedule = false;
            scheduleBehavior = async (task) => {
                scheduledTasks.push(task);
                if (task instanceof ReflectUserProfilePictureSyncTransactionTask) {
                    pendingAtSchedule = services.model.db.getPendingUserProfileSync() !== undefined;
                    return await scheduling;
                }
                return undefined;
            };

            await services.model.user.profileSettings
                .get()
                .controller.setProfilePictureShareWith.fromLocal({group: 'nobody'});

            expect(pendingAtSchedule, 'durable intent must exist before task scheduling').to.be
                .true;
            expect(scheduling.done, 'offline reflection must still be unresolved').to.be.false;
            expect(services.model.db.getPendingUserProfileSync()).not.to.be.undefined;
            services.userProfilePictureDistributionRetry.retryPending();
            expect(
                countScheduled(ReflectUserProfilePictureSyncTransactionTask),
                'local and periodic scheduling must share one in-flight coordinator',
            ).to.equal(1);
            scheduling.resolve(undefined);
        });

        it('keeps D2D intent until reflection acknowledgement and transaction completion', async function () {
            await services.model.user.profileSettings
                .get()
                .controller.setProfilePictureShareWith.fromLocal({group: 'nobody'});
            const task = scheduledTasks.find(
                (scheduled) => scheduled instanceof ReflectUserProfilePictureSyncTransactionTask,
            );
            assert(task instanceof ReflectUserProfilePictureSyncTransactionTask);
            const pending = services.model.db.getPendingUserProfileSync();
            assert(pending !== undefined);
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.startTransaction(0, TransactionScope.USER_PROFILE_SYNC),
            ]);
            const reflectStarted = new ResolvablePromise<void>({uncaught: 'default'});
            const reflectAcknowledged = new ResolvablePromise<readonly (Date | undefined)[]>({
                uncaught: 'default',
            });
            const delayedHandle = handle as unknown as {
                reflect: (
                    payloads: readonly {readonly precondition?: () => boolean}[],
                ) => Promise<readonly (Date | undefined)[]>;
            };
            delayedHandle.reflect = async (payloads) => {
                expect(payloads[0]?.precondition?.()).to.be.true;
                reflectStarted.resolve(undefined);
                return await reflectAcknowledged;
            };

            const running = task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            await reflectStarted;
            expect(
                services.model.db.hasPendingUserProfileSync(pending.generation),
                'intent must remain while mediator acknowledgement is unresolved',
            ).to.be.true;
            reflectAcknowledged.resolve([new Date()]);

            expect(await running).to.equal('success');
            handle.finish();
            expect(
                services.model.db.hasPendingUserProfileSync(pending.generation),
                'the matching generation clears only after reflected transaction completion',
            ).to.be.false;
        });

        it('applies an incoming reflected policy without echoing it', async function () {
            const contact = addTestUserAsContact(services.model, makeTestUser('USER0001'));
            const previousPending =
                services.persistentProtocolState.upsertPendingUserProfileDistribution(
                    contact.get().view.identity,
                    new Date(),
                );
            const previousD2dPending = services.model.db.persistLocalProfileSettings(
                services.model.user.profileSettings.get().view,
                new Date(),
            ).pending;
            const message = new protobuf.d2d.UserProfileSync({
                update: new protobuf.d2d.UserProfileSync.Update({
                    userProfile: new protobuf.d2d_sync.UserProfile({
                        profilePictureShareWith:
                            new protobuf.d2d_sync.UserProfile.ProfilePictureShareWith({
                                nobody: protobuf.UNIT_MESSAGE,
                            }),
                    }),
                }),
            });
            const task = new ReflectedUserProfileSyncTask(services, message, ensureD2mDeviceId(1n));
            const handle = new TestHandle(services, []);

            await task.run(handle as unknown as PassiveTaskCodecHandle);
            handle.finish();

            expect(
                services.model.user.profileSettings.get().view.profilePictureShareWith,
            ).to.deep.equal({group: 'nobody'});
            expect(scheduledTasks, 'incoming reflection must not schedule an echo').to.be.empty;
            expect(
                services.persistentProtocolState.hasPendingUserProfileDistribution(
                    contact.get().view.identity,
                    previousPending.generation,
                ),
                'reflected privacy state must invalidate older pending recipient work',
            ).to.be.false;
            expect(
                services.persistentProtocolState.getPendingUserProfileDistributions(),
            ).to.have.length(1);
            expect(
                services.persistentProtocolState.hasPendingUserProfileSync(
                    previousD2dPending.generation,
                ),
                'authoritative reflected policy must invalidate local D2D intent atomically',
            ).to.be.false;
        });

        it('preserves local picture-policy intent for an incoming nickname-only update', async function () {
            const pending = services.model.db.persistLocalProfileSettings(
                services.model.user.profileSettings.get().view,
                new Date(),
            ).pending;
            const message = new protobuf.d2d.UserProfileSync({
                update: new protobuf.d2d.UserProfileSync.Update({
                    userProfile: new protobuf.d2d_sync.UserProfile({nickname: 'Remote nickname'}),
                }),
            });
            const task = new ReflectedUserProfileSyncTask(services, message, ensureD2mDeviceId(1n));
            const handle = new TestHandle(services, []);

            await task.run(handle as unknown as PassiveTaskCodecHandle);
            handle.finish();

            expect(services.model.db.hasPendingUserProfileSync(pending.generation)).to.be.true;
            expect(services.model.user.profileSettings.get().view.nickname).to.equal(
                'Remote nickname',
            );
            expect(scheduledTasks, 'incoming nickname reflection must not schedule an echo').to.be
                .empty;
        });
    });
}
