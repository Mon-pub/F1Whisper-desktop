import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';
import {restore, stub} from 'sinon';

import {NACL_CONSTANTS} from '~/common/crypto';
import {BLOB_ID_LENGTH, ensureBlobId} from '~/common/network/protocol/blob';
import type {ActiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingUserProfilePictureBroadcastTask} from '~/common/network/protocol/task/csp/outgoing-user-profile-picture-broadcast';
import {ReflectUserProfilePictureSyncTransactionTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync-transaction';
import {wrapRawBlobKey} from '~/common/network/types/keys';
import {
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    NetworkExpectationFactory,
    TestHandle,
} from '~/test/mocha/common/backend-mocks';

export function run(): void {
    describe('UserProfilePictureDistributionRetryService', function () {
        this.afterEach(function () {
            restore();
        });

        it('deduplicates startup/periodic recovery for an in-flight generation', async function () {
            const me = makeTestUser('MEMEMEME');
            const receiver = makeTestUser('USER0001');
            const services = makeTestServices(me.identity.string);
            addTestUserAsContact(services.model, receiver);
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
            const pending = services.persistentProtocolState.upsertPendingUserProfileDistribution(
                receiver.identity.string,
                new Date(),
            );
            const scheduledTasks: unknown[] = [];
            const inFlight = new ResolvablePromise<unknown>({uncaught: 'default'});
            stub(services.taskManager, 'schedule').callsFake(async (task: unknown) => {
                scheduledTasks.push(task);
                return await inFlight;
            });

            services.userProfilePictureDistributionRetry.retryPending();
            services.userProfilePictureDistributionRetry.retryPending();

            const broadcastTasks = scheduledTasks.filter(
                (task) => task instanceof OutgoingUserProfilePictureBroadcastTask,
            );
            expect(broadcastTasks).to.have.length(1);
            const task = broadcastTasks[0];
            if (task instanceof OutgoingUserProfilePictureBroadcastTask) {
                const followerHandle = new TestHandle(
                    services,
                    [
                        NetworkExpectationFactory.reflectSingle(),
                        NetworkExpectationFactory.write(),
                        NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                            services,
                            receiver.identity.string,
                        ),
                    ],
                    {promotedToLeader: false},
                );
                await task.run(followerHandle as unknown as ActiveTaskCodecHandle<'persistent'>);
                followerHandle.finish();
            }
            expect(
                services.persistentProtocolState.getLastUserProfileDistributionState(
                    receiver.identity.string,
                )?.type,
                'follower recovery must converge without another edit or conversation message',
            ).to.equal('profile-picture');
            expect(
                services.persistentProtocolState.hasPendingUserProfileDistribution(
                    receiver.identity.string,
                    pending.generation,
                ),
            ).to.be.false;

            inFlight.resolve(undefined);
        });

        it('reconstructs missing durable intent from authoritative profile privacy state', function () {
            const me = makeTestUser('MEMEMEME');
            const receiver = makeTestUser('USER0001');
            const services = makeTestServices(me.identity.string);
            addTestUserAsContact(services.model, receiver);
            const blobId = ensureBlobId(new Uint8Array(BLOB_ID_LENGTH));
            services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {
                    blob: new Uint8Array([1, 2, 3, 4]),
                    blobId,
                    key: wrapRawBlobKey(
                        services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
                    ),
                    lastUploadedAt: new Date(),
                },
            });
            services.persistentProtocolState.setLastUserProfileDistributionState(
                receiver.identity.string,
                {blobId, type: 'profile-picture'},
                new Date(),
            );

            // Simulate a crash after committing a restrictive setting but before its per-recipient
            // enrollment completed.
            services.model.user.profileSettings.get().controller.update.direct({
                profilePictureShareWith: {group: 'nobody'},
            });
            expect(services.persistentProtocolState.getPendingUserProfileDistributions()).to.be
                .empty;
            const scheduledTasks: unknown[] = [];
            stub(services.taskManager, 'schedule').callsFake(async (task: unknown) => {
                scheduledTasks.push(task);
                return await new Promise(() => {});
            });

            services.userProfilePictureDistributionRetry.retryPending();

            expect(
                scheduledTasks.filter(
                    (task) => task instanceof OutgoingUserProfilePictureBroadcastTask,
                ),
            ).to.have.length(1);
            expect(
                services.persistentProtocolState
                    .getPendingUserProfileDistributions()
                    .map(({receiverIdentity}) => receiverIdentity),
            ).to.deep.equal([receiver.identity.string]);
        });

        it('deduplicates startup recovery for an in-flight D2D profile generation', function () {
            const services = makeTestServices(makeTestUser('MEMEMEME').identity.string);
            const pending = services.model.db.persistLocalProfileSettings(
                services.model.user.profileSettings.get().view,
                new Date(),
            ).pending;
            const scheduledTasks: unknown[] = [];
            stub(services.taskManager, 'schedule').callsFake(async (task: unknown) => {
                scheduledTasks.push(task);
                return await new Promise(() => {});
            });

            services.userProfilePictureDistributionRetry.retryPending();
            services.userProfilePictureDistributionRetry.retryPending();

            expect(scheduledTasks).to.have.length(1);
            expect(scheduledTasks[0]).to.be.instanceOf(
                ReflectUserProfilePictureSyncTransactionTask,
            );
            expect((scheduledTasks[0] as ReflectUserProfilePictureSyncTransactionTask).persist).to
                .be.true;
            expect(services.model.db.hasPendingUserProfileSync(pending.generation)).to.be.true;
        });

        for (const action of ['set', 'delete'] as const) {
            it(`reconstructs post-0049 ${action.toUpperCase()} intent without a legacy ACK cache`, function () {
                const me = makeTestUser('MEMEMEME');
                const receiver = makeTestUser('USER0001');
                const services = makeTestServices(me.identity.string);
                addTestUserAsContact(services.model, receiver);
                if (action === 'set') {
                    services.model.user.profileSettings.get().controller.update.direct({
                        profilePicture: {
                            blob: new Uint8Array([1, 2, 3, 4]),
                            blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH)),
                            key: wrapRawBlobKey(
                                services.crypto.randomBytes(
                                    new Uint8Array(NACL_CONSTANTS.KEY_LENGTH),
                                ),
                            ),
                            lastUploadedAt: new Date(),
                        },
                    });
                }
                const scheduledTasks: unknown[] = [];
                stub(services.taskManager, 'schedule').callsFake(async (task: unknown) => {
                    scheduledTasks.push(task);
                    return await new Promise(() => {});
                });

                services.userProfilePictureDistributionRetry.retryPending();

                expect(
                    services.persistentProtocolState
                        .getPendingUserProfileDistributions()
                        .map(({receiverIdentity}) => receiverIdentity),
                ).to.deep.equal([receiver.identity.string]);
                expect(
                    scheduledTasks.filter(
                        (task) => task instanceof OutgoingUserProfilePictureBroadcastTask,
                    ),
                ).to.have.length(1);
            });
        }
    });
}
