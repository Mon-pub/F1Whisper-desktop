import DatabaseConstructor, {type Database} from 'better-sqlcipher';
import {expect} from 'chai';

import {type Logger, NOOP_LOGGER} from '~/common/logging';
import {ensureIdentityString} from '~/common/network/types';
import {MigrationHelper} from '~/common/node/db/migrations';
import type {u53} from '~/common/types';

/**
 * Test the F1Whisper fork migration 0046 (FU-H06): backfill of the durable outgoing-message outbox
 * for messages stranded by an OLDER build (an "upgrade simulation").
 *
 * Eligibility rule under test (see the migration comment): enroll exactly the outbound conversation
 * messages that still need to transmit and are not already enrolled -- outbound (senderContactUid IS
 * NULL) + no confirmed send timestamp (processedAt IS NULL) + not deleted (deletedAt IS NULL) + not
 * already in the outbox. The key property: recovered exactly once, and NOT over-broad (a sent /
 * deleted / inbound / already-enrolled row must not be (re-)enrolled).
 */
export function run(): void {
    describe('Migration 0046 outgoing-outbox backfill (F1Whisper fork FU-H06)', function () {
        const log: Logger = NOOP_LOGGER;
        let db: Database;
        let migrationHelper: MigrationHelper;

        this.beforeEach(() => {
            db = new DatabaseConstructor(':memory:');
            migrationHelper = MigrationHelper.create(log, {
                userIdentity: ensureIdentityString('MEMEMEME'),
            });
            // Migrate to just before 0046: the `messages` table and the outbox table (0044) exist,
            // but the backfill has not run.
            expect(migrationHelper.migrate(db, 45)).to.equal(45);
            // This test exercises the backfill eligibility WHERE-clause, not FK enforcement (tested
            // elsewhere). Migration 0001 turns foreign_keys ON; disable it so synthetic
            // conversationUid / senderContactUid values need not have matching rows. Set outside a
            // transaction so it takes effect and persists into migrate(46)'s transaction.
            db.pragma('foreign_keys = OFF');
        });

        this.afterEach(() => {
            db.close();
        });

        // Insert a raw `messages` row (only the columns relevant to the backfill eligibility). A
        // fresh better-sqlcipher connection has FK enforcement OFF, so a synthetic conversationUid
        // does not need a matching `conversations` row for this migration-level test.
        function insertMessage(
            messageId: number,
            opts: {
                readonly outbound: boolean;
                readonly processed: boolean;
                readonly deleted: boolean;
            },
        ): Buffer {
            const id = Buffer.from([messageId, 0, 0, 0, 0, 0, 0, 0]);
            db.prepare(
                `INSERT INTO messages
                     (messageId, conversationUid, createdAt, messageType, threadId,
                      senderContactUid, processedAt, deletedAt)
                 VALUES (?, 1, 0, 'text', 1, ?, ?, ?)`,
            ).run(
                id,
                opts.outbound ? null : 5, // SenderContactUid: NULL = outbound
                opts.processed ? 1000 : null, // ProcessedAt: set = confirmed send
                opts.deleted ? 1000 : null, // DeletedAt
            );
            return id;
        }

        function outboxMessageIds(): Buffer[] {
            return db
                .prepare<[], {readonly messageId: Buffer}>(
                    `SELECT messageId FROM outgoingMessageOutbox ORDER BY createdAt ASC`,
                )
                .all()
                .map((row) => row.messageId);
        }

        function outboxCount(): u53 {
            return (
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM outgoingMessageOutbox`)
                    .get()?.count ?? 0
            );
        }

        it('backfills only eligible pre-upgrade outbound-unsent messages, exactly once', () => {
            // Eligible: outbound + unsent + not deleted + not already enrolled.
            const eligible = insertMessage(1, {outbound: true, processed: false, deleted: false});
            // Ineligible: already transmitted (processedAt set) -- must NOT be re-sent.
            insertMessage(2, {outbound: true, processed: true, deleted: false});
            // Ineligible: deleted -- must NOT be re-sent.
            insertMessage(3, {outbound: true, processed: false, deleted: true});
            // Ineligible: inbound (has a sender).
            insertMessage(4, {outbound: false, processed: false, deleted: false});
            // Eligible-but-already-enrolled: an outbound unsent message that already has an outbox
            // row (e.g. created on this build before the upgrade) -- must NOT be double-enrolled.
            const alreadyEnrolled = insertMessage(5, {
                outbound: true,
                processed: false,
                deleted: false,
            });
            db.prepare(
                `INSERT INTO outgoingMessageOutbox (messageId, conversationUid, createdAt)
                 VALUES (?, 1, 0)`,
            ).run(alreadyEnrolled);

            expect(outboxCount()).to.equal(1); // Only the pre-existing enrollment so far

            // Apply the backfill.
            expect(migrationHelper.migrate(db, 46)).to.equal(1);

            // Exactly the eligible message plus the pre-existing enrollment; nothing else, no
            // duplicate for the already-enrolled row (recovered-exactly-once + not over-broad).
            const ids = outboxMessageIds();
            expect(outboxCount(), 'total outbox rows').to.equal(2);
            expect(ids.some((id) => id.equals(eligible)), 'eligible backfilled').to.be.true;
            expect(ids.some((id) => id.equals(alreadyEnrolled)), 'already-enrolled kept once').to.be
                .true;
            // The sent/deleted/inbound rows must never appear.
            for (const ineligible of [
                Buffer.from([2, 0, 0, 0, 0, 0, 0, 0]),
                Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]),
                Buffer.from([4, 0, 0, 0, 0, 0, 0, 0]),
            ]) {
                expect(ids.some((id) => id.equals(ineligible)), `row ${ineligible[0]} excluded`).to
                    .be.false;
            }
        });

        it('is a no-op when there are no eligible messages', () => {
            insertMessage(2, {outbound: true, processed: true, deleted: false}); // Sent
            insertMessage(4, {outbound: false, processed: false, deleted: false}); // Inbound

            expect(migrationHelper.migrate(db, 46)).to.equal(1); // Migration still applies
            expect(outboxCount()).to.equal(0);
        });

        it('down-migration is a no-op that leaves the outbox table intact', () => {
            insertMessage(1, {outbound: true, processed: false, deleted: false});
            migrationHelper.migrate(db, 46);
            expect(outboxCount()).to.equal(1);

            // 0046 down is intentionally a no-op (irreversible data backfill); reverting to 45 keeps
            // the table and its rows.
            expect(migrationHelper.migrate(db, 45)).to.equal(1);
            expect(outboxCount()).to.equal(1);
        });
    });
}
