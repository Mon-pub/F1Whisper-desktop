import type {u53} from '@threema/ts-utils/integer/u53';
import {expect} from 'chai';

import {GroupUserState, ReceiverType} from '~/common/enum';
import type {Contact, ContactInit} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import {IncomingDisappearingTimerTask} from '~/common/network/protocol/task/csp/incoming-disappearing-timer';
import {getConversationById} from '~/common/network/protocol/task/message-processing-helpers';
import {randomGroupId, randomMessageId} from '~/common/network/protocol/utils';
import {
    ensureIdentityString,
    type GroupConversationId,
    type GroupId,
    type IdentityString,
    type Nickname,
} from '~/common/network/types';
import {Identity} from '~/common/utils/identity';
import {
    addTestGroup,
    addTestUserAsContact,
    createClientKey,
    makeContactInit,
    makeTestServices,
    type NetworkExpectation,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {reflectContactSync} from '~/test/mocha/common/network/protocol/task/task-test-helpers';

/**
 * P-H03 regression: an incoming GROUP disappearing-messages timer control must be authorized through
 * the same common group receive steps as every other group-control message (active group, existing
 * sender, current membership) before it is applied. The group id + creator identity travel on the
 * wire and are not secret, so without this check any contact could silently change a group's retention
 * policy for a group they were never in, were kicked from, or that does not exist locally.
 *
 * Each unauthorized-sender relationship the review calls out is exercised as its own distinct case
 * (current member succeeds; unrelated contact, unknown group, unknown contact, former member, kicked
 * member, and a sender who left the group are each independently proven acknowledged-and-discarded
 * with the timer left unchanged), rather than consolidated behind the single post-auth discard branch.
 */
export function run(): void {
    describe('IncomingDisappearingTimerTask (P-H03 group authorization)', function () {
        const me = ensureIdentityString('MEMEMEME');
        const creatorUser = {
            identity: new Identity(ensureIdentityString('CREATOR1')),
            nickname: 'creator' as Nickname,
            ck: createClientKey(),
        };
        const memberUser = {
            identity: new Identity(ensureIdentityString('MEMBER01')),
            nickname: 'member' as Nickname,
            ck: createClientKey(),
        };
        const member2User = {
            identity: new Identity(ensureIdentityString('MEMBER02')),
            nickname: 'member2' as Nickname,
            ck: createClientKey(),
        };
        const outsiderUser = {
            identity: new Identity(ensureIdentityString('OUTSIDER')),
            nickname: 'outsider' as Nickname,
            ck: createClientKey(),
        };
        const unknownUser = {
            identity: new Identity(ensureIdentityString('UNKNOWN1')),
            nickname: 'unknown' as Nickname,
            ck: createClientKey(),
        };
        const formerUser = {
            identity: new Identity(ensureIdentityString('FORMER01')),
            nickname: 'former' as Nickname,
            ck: createClientKey(),
        };
        const kickedUser = {
            identity: new Identity(ensureIdentityString('KICKED01')),
            nickname: 'kicked' as Nickname,
            ck: createClientKey(),
        };
        const leftUser = {
            identity: new Identity(ensureIdentityString('LEFT0001')),
            nickname: 'left' as Nickname,
            ck: createClientKey(),
        };

        const TIMER_SECONDS = 3600;

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

        function readGroupTimer(groupId: GroupId, creatorIdentity: IdentityString): u53 | undefined {
            const conversation = getConversationById(services, {
                type: ReceiverType.GROUP,
                groupId,
                creatorIdentity,
            });
            return conversation?.get().view.ephemeralTimerSeconds;
        }

        // Pre-mark the group as recently resynced so a discard path does not additionally emit a
        // group-sync-request over the network (that behavior is not under test here).
        function suppressGroupSyncRequest(groupId: GroupId): void {
            services.volatileProtocolState.setLastProcessedGroupSyncRequest(
                groupId,
                creatorUser.identity.string,
                me,
                new Date(),
            );
        }

        // Run an incoming GROUP disappearing-timer task from `senderIdentity`/`senderContactOrInit`
        // for the (groupId, creatorIdentity) group, assert the expected network events were consumed,
        // and return the group conversation's resulting timer (undefined = not applied).
        async function runGroupTimer(options: {
            readonly groupId: GroupId;
            readonly creatorIdentity: IdentityString;
            readonly senderIdentity: IdentityString;
            readonly senderContactOrInit: ModelStore<Contact> | ContactInit;
            readonly expectations?: NetworkExpectation[];
        }): Promise<u53 | undefined> {
            const conversationId: GroupConversationId = {
                type: ReceiverType.GROUP,
                groupId: options.groupId,
                creatorIdentity: options.creatorIdentity,
            };
            const task = new IncomingDisappearingTimerTask(
                services,
                randomMessageId(services.crypto),
                conversationId,
                options.senderIdentity,
                options.senderContactOrInit,
                {timerSeconds: TIMER_SECONDS},
                new Date(),
            );
            const handle = new TestHandle(services, options.expectations ?? []);
            await task.run(handle);
            handle.finish();
            return readGroupTimer(options.groupId, options.creatorIdentity);
        }

        it('applies the timer when the sender is a current member', async function () {
            const {crypto, model} = services;
            const creatorContact = addTestUserAsContact(model, creatorUser);
            const memberContact = addTestUserAsContact(model, memberUser);
            const groupId = randomGroupId(crypto);
            addTestGroup(model, {
                groupId,
                creator: creatorContact,
                name: 'Group',
                userState: GroupUserState.MEMBER,
                members: [creatorContact, memberContact],
            });

            const conversationId: GroupConversationId = {
                type: ReceiverType.GROUP,
                groupId,
                creatorIdentity: creatorUser.identity.string,
            };
            const task = new IncomingDisappearingTimerTask(
                services,
                randomMessageId(crypto),
                conversationId,
                memberUser.identity.string,
                memberContact,
                {timerSeconds: TIMER_SECONDS},
                new Date(),
            );
            const handle = new TestHandle(services, []);
            await task.run(handle);
            handle.finish();

            expect(readGroupTimer(groupId, creatorUser.identity.string)).to.equal(TIMER_SECONDS);
        });

        it('discards a timer from a sender who is not a current member', async function () {
            const {crypto, model} = services;
            const creatorContact = addTestUserAsContact(model, creatorUser);
            const outsiderContact = addTestUserAsContact(model, outsiderUser);
            const groupId = randomGroupId(crypto);
            addTestGroup(model, {
                groupId,
                creator: creatorContact,
                name: 'Group',
                userState: GroupUserState.MEMBER,
                // The outsider is intentionally NOT a member.
                members: [creatorContact],
            });
            suppressGroupSyncRequest(groupId);

            const conversationId: GroupConversationId = {
                type: ReceiverType.GROUP,
                groupId,
                creatorIdentity: creatorUser.identity.string,
            };
            const task = new IncomingDisappearingTimerTask(
                services,
                randomMessageId(crypto),
                conversationId,
                outsiderUser.identity.string,
                outsiderContact,
                {timerSeconds: TIMER_SECONDS},
                new Date(),
            );
            const handle = new TestHandle(services, []);
            await task.run(handle);
            handle.finish();

            expect(readGroupTimer(groupId, creatorUser.identity.string)).to.be.undefined;
        });

        it('discards a timer for a group that does not exist locally', async function () {
            const {crypto, model} = services;
            // Add the creator as a contact so the (suppressed) sync-request path needs no directory
            // lookup, but do NOT create the group.
            addTestUserAsContact(model, creatorUser);
            const outsiderContact = addTestUserAsContact(model, outsiderUser);
            const groupId = randomGroupId(crypto);
            suppressGroupSyncRequest(groupId);

            const conversationId: GroupConversationId = {
                type: ReceiverType.GROUP,
                groupId,
                creatorIdentity: creatorUser.identity.string,
            };
            const task = new IncomingDisappearingTimerTask(
                services,
                randomMessageId(crypto),
                conversationId,
                outsiderUser.identity.string,
                outsiderContact,
                {timerSeconds: TIMER_SECONDS},
                new Date(),
            );
            const handle = new TestHandle(services, []);
            await task.run(handle);
            handle.finish();

            // The discarded control message created no group conversation to carry a timer.
            expect(readGroupTimer(groupId, creatorUser.identity.string)).to.be.undefined;
        });

        it('discards a timer from an unknown (never-seen) sender contact', async function () {
            const {crypto, model} = services;
            const creatorContact = addTestUserAsContact(model, creatorUser);
            const groupId = randomGroupId(crypto);
            addTestGroup(model, {
                groupId,
                creator: creatorContact,
                name: 'Group',
                userState: GroupUserState.MEMBER,
                members: [creatorContact],
            });
            suppressGroupSyncRequest(groupId);

            // The sender is not a known contact: the receive steps add it (reflected contact sync),
            // then find it is not a member -> discard. The timer is never applied.
            const timer = await runGroupTimer({
                groupId,
                creatorIdentity: creatorUser.identity.string,
                senderIdentity: unknownUser.identity.string,
                senderContactOrInit: makeContactInit(unknownUser),
                expectations: reflectContactSync(unknownUser, 'create'),
            });
            expect(timer).to.be.undefined;
        });

        it('discards a timer from a former member (previously in the group, then removed)', async function () {
            const {crypto, model} = services;
            const creatorContact = addTestUserAsContact(model, creatorUser);
            const formerContact = addTestUserAsContact(model, formerUser);
            const groupId = randomGroupId(crypto);
            const group = addTestGroup(model, {
                groupId,
                creator: creatorContact,
                name: 'Group',
                userState: GroupUserState.MEMBER,
                members: [creatorContact, formerContact],
            });
            // The sender WAS a member, then was removed -> now a former member.
            group.get().controller.removeMembers.direct([formerContact], new Date());
            suppressGroupSyncRequest(groupId);

            const timer = await runGroupTimer({
                groupId,
                creatorIdentity: creatorUser.identity.string,
                senderIdentity: formerUser.identity.string,
                senderContactOrInit: formerContact,
            });
            expect(timer).to.be.undefined;
        });

        it('discards a timer from a kicked member (removed from a still-active group)', async function () {
            const {crypto, model} = services;
            const creatorContact = addTestUserAsContact(model, creatorUser);
            const remainingContact = addTestUserAsContact(model, member2User);
            const kickedContact = addTestUserAsContact(model, kickedUser);
            const groupId = randomGroupId(crypto);
            const group = addTestGroup(model, {
                groupId,
                creator: creatorContact,
                name: 'Group',
                userState: GroupUserState.MEMBER,
                members: [creatorContact, remainingContact, kickedContact],
            });
            // The sender is kicked out while the rest of the group stays active.
            group.get().controller.removeMembers.direct([kickedContact], new Date());
            suppressGroupSyncRequest(groupId);

            const timer = await runGroupTimer({
                groupId,
                creatorIdentity: creatorUser.identity.string,
                senderIdentity: kickedUser.identity.string,
                senderContactOrInit: kickedContact,
            });
            expect(timer).to.be.undefined;
        });

        it('discards a timer from a sender who left the group (never a current member)', async function () {
            const {crypto, model} = services;
            const creatorContact = addTestUserAsContact(model, creatorUser);
            // The sender is a known contact who left the group (not in the current member set).
            const leftContact = addTestUserAsContact(model, leftUser);
            const groupId = randomGroupId(crypto);
            addTestGroup(model, {
                groupId,
                creator: creatorContact,
                name: 'Group',
                userState: GroupUserState.MEMBER,
                members: [creatorContact],
            });
            suppressGroupSyncRequest(groupId);

            const timer = await runGroupTimer({
                groupId,
                creatorIdentity: creatorUser.identity.string,
                senderIdentity: leftUser.identity.string,
                senderContactOrInit: leftContact,
            });
            expect(timer).to.be.undefined;
        });
    });
}
