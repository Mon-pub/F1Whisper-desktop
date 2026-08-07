import {expect} from 'chai';
import {useFakeTimers} from 'sinon';

import type {DatabaseBackend, DbConversationUid, DbMessageUid} from '~/common/db';
import {DisappearingMessageService} from '~/common/dom/backend/disappearing-message-service';
import type {Repositories} from '~/common/model';
import type {MessageId} from '~/common/network/types';
import type {u53} from '~/common/types';
import {EventController} from '~/common/utils/event';
import {MAX_TIMEOUT_CHUNK_DELAY_MS} from '~/common/utils/timer';
import {TestLoggerFactory} from '~/test/mocha/common/backend-mocks';

const START_MS = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONVERSATION_UID = 1n as unknown as DbConversationUid;
const MESSAGE_DB_UID = 2n as unknown as DbMessageUid;
const MESSAGE_ID = 3n as unknown as MessageId;

interface Deletion {
    readonly conversationUid: DbConversationUid;
    readonly id: MessageId;
    readonly at: Date;
}

/**
 * Build a {@link DisappearingMessageService} around a controllable in-memory fake that reports a
 * single message expiring at `expiresAt`. Deleting the message clears the pending expiry, exactly as
 * the real hard-purge removes the row so a subsequent query no longer reports it due.
 */
function makeService(
    expiresAt: Date | undefined,
    disappearingRefresh?: EventController<void>,
): {
    readonly service: DisappearingMessageService;
    readonly deletions: readonly Deletion[];
    readonly dueQueryCount: () => u53;
    readonly setExpiresAt: (next: Date | undefined) => void;
} {
    const state: {expiresAt: Date | undefined} = {expiresAt};
    const deletions: Deletion[] = [];
    let dueQueries = 0;

    const db: Pick<DatabaseBackend, 'getMessagesDueForDeletion' | 'getNextMessageExpiry'> = {
        getMessagesDueForDeletion: (before) => {
            dueQueries += 1;
            if (state.expiresAt !== undefined && state.expiresAt.getTime() <= before.getTime()) {
                return [{conversationUid: CONVERSATION_UID, uid: MESSAGE_DB_UID, id: MESSAGE_ID}];
            }
            return [];
        },
        getNextMessageExpiry: (after) => {
            if (state.expiresAt !== undefined && state.expiresAt.getTime() > after.getTime()) {
                return state.expiresAt;
            }
            return undefined;
        },
    };

    const model = {
        conversations: {
            getByUid: (uid: DbConversationUid) => ({
                get: () => ({
                    controller: {
                        markMessageAsDisappeared: (id: MessageId, deletedAt: Date) => {
                            deletions.push({conversationUid: uid, id, at: deletedAt});
                            // The row is hard-purged, so it is no longer pending.
                            state.expiresAt = undefined;
                        },
                    },
                }),
            }),
        },
    } as unknown as Repositories;

    const service = new DisappearingMessageService({
        logging: new TestLoggerFactory('dms'),
        model,
        db,
        disappearingRefresh,
    });
    return {
        service,
        deletions,
        dueQueryCount: () => dueQueries,
        setExpiresAt: (next) => {
            state.expiresAt = next;
        },
    };
}

/**
 * P-H01 regression: a persisted (originally peer-supplied) disappearing-message expiry can be far
 * enough in the future that the delay exceeds the ~24.855-day signed-32-bit `setTimeout` ceiling. The
 * service must arm it through the bounded long-delay helper so it never overflows into an
 * immediate-fire hot loop, must still delete exactly at the true expiry, and must recover responsively
 * from a persisted far-future row at startup.
 */
export function run(): void {
    describe('DisappearingMessageService (P-H01 far-future timers)', function () {
        function withFakeClock(test: (clock: ReturnType<typeof useFakeTimers>) => void): void {
            const clock = useFakeTimers({now: START_MS});
            try {
                test(clock);
            } finally {
                clock.restore();
            }
        }

        it('arms a bounded chunk for a far-future expiry, not an overflowing raw delay', function () {
            withFakeClock((clock) => {
                // 40 days ahead: beyond the ~24.855-day ceiling, so a raw `TIMER.timeout` would
                // overflow to an immediate fire.
                const {service, deletions} = makeService(new Date(START_MS + 40 * DAY_MS));

                service.rescheduleNextTimer();
                expect(clock.countTimers(), 'exactly one timer armed').to.equal(1);

                // Firing the first armed timer must advance by at most one bounded chunk (proving the
                // raw 40-day delay was not handed to `setTimeout`), and must NOT reach the true
                // expiry, so nothing is deleted at the chunk boundary.
                const before = clock.now;
                clock.next();
                expect(clock.now - before, 'first chunk is bounded').to.be.at.most(
                    MAX_TIMEOUT_CHUNK_DELAY_MS,
                );
                expect(deletions.length, 'chunk boundary is not the expiry').to.equal(0);
                expect(clock.countTimers(), 'the next chunk is re-armed').to.equal(1);

                service.stop();
            });
        });

        it('deletes exactly once at the true expiry and disarms', function () {
            withFakeClock((clock) => {
                const {service, deletions, dueQueryCount} = makeService(
                    new Date(START_MS + 40 * DAY_MS),
                );

                service.rescheduleNextTimer();

                // Not deleted before the expiry.
                clock.tick(40 * DAY_MS - 1);
                expect(deletions.length, 'not deleted before expiry').to.equal(0);

                // Deleted exactly once at the expiry, then disarmed.
                clock.tick(1);
                expect(deletions.length, 'deleted exactly once at expiry').to.equal(1);
                expect(deletions[0]?.at.getTime(), 'deleted at the expiry instant').to.equal(
                    START_MS + 40 * DAY_MS,
                );
                expect(clock.countTimers(), 'disarmed after the final expiry').to.equal(0);

                // No runaway: advancing further never deletes again and never re-queries endlessly.
                const dueAfterExpiry = dueQueryCount();
                clock.tick(10 * DAY_MS);
                expect(deletions.length, 'no further deletions once idle').to.equal(1);
                expect(dueQueryCount(), 'no further sweeps once idle').to.equal(dueAfterExpiry);

                service.stop();
            });
        });

        it('recovers responsively on restart from a persisted far-future row', function () {
            withFakeClock((clock) => {
                // Simulate the first recurring sweep running at startup while a far-future expiry is
                // already persisted.
                const {service, deletions, dueQueryCount} = makeService(
                    new Date(START_MS + 40 * DAY_MS),
                );

                service.sweepExpiredMessages();

                // The startup sweep queried once, deleted nothing (row not yet due), and armed one
                // bounded timer -- it did NOT spin re-querying the same future row.
                expect(dueQueryCount(), 'one startup sweep query').to.equal(1);
                expect(deletions.length, 'nothing due at startup').to.equal(0);
                expect(clock.countTimers(), 'one bounded timer armed at startup').to.equal(1);

                // Idle without advancing the clock: no further sweeps (no hot loop).
                clock.tick(0);
                expect(dueQueryCount(), 'no busy sweeping while idle').to.equal(1);

                service.stop();
            });
        });

        it('re-arms immediately when the disappearing-refresh event is raised (P-H05)', function () {
            withFakeClock((clock) => {
                const refresh = new EventController<void>();
                // Nothing pending at construction -> no timer armed.
                const {service, setExpiresAt} = makeService(undefined, refresh);
                service.rescheduleNextTimer();
                expect(clock.countTimers(), 'no timer while nothing is pending').to.equal(0);

                // A message is first-read and stamped: a new expiry appears and the model raises the
                // refresh event. The service must re-arm immediately, not wait for the next sweep.
                setExpiresAt(new Date(START_MS + DAY_MS));
                refresh.raise();
                expect(clock.countTimers(), 're-armed on the refresh event').to.equal(1);

                service.stop();
                // After stop() the service has unsubscribed: a later refresh does not re-arm.
                refresh.raise();
                expect(clock.countTimers(), 'no re-arm after stop/unsubscribe').to.equal(0);
            });
        });
    });
}
