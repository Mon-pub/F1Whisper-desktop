import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type {u53} from '@threema/ts-utils/integer/u53';
import DatabaseConstructor, {type Database} from 'better-sqlcipher';
import {expect} from 'chai';

import {PersistentProtocolStateType} from '~/common/enum';
import {type Logger, NOOP_LOGGER} from '~/common/logging';
import {BLOB_ID_LENGTH, ensureBlobId} from '~/common/network/protocol/blob';
import {ensureIdentityString} from '~/common/network/types';
import {PERSISTENT_PROTOCOL_STATE_CODEC} from '~/common/network/types/persistent-protocol-state';
import {MigrationHelper} from '~/common/node/db/migrations';
import {assert, unwrap} from '~/common/utils/assert';

// Should match the values in `migrations.ts`: If we (accidentally or on purpose) change the name of
// a column in `migrations.ts` that will break existing apps with an existing database table.
// Writing out the values here again ensures that a test fails if this happens, alerting the
// developer to make a concious decision.
const MIGRATION_CACHE = {
    TABLE_NAME: '_threema_migration_cache',
    COL_NUMBER: 'number',
    COL_NAME: 'name',
    COL_UP_SQL: 'upSql',
    COL_DOWN_SQL: 'downSql',
    COL_APPLIED_AT: 'appliedAt',
} as const;

/**
 * SQLite database backend tests.
 */
export function run(): void {
    describe('Migrations', function () {
        // Setup: Create empty database
        let db: Database;
        let migrationHelper: MigrationHelper;
        const log: Logger = NOOP_LOGGER;
        this.beforeEach(() => {
            db = new DatabaseConstructor(':memory:');
            migrationHelper = MigrationHelper.create(log, {
                userIdentity: ensureIdentityString('MEMEMEME'),
            });
        });
        this.afterEach(() => {
            db.close();
        });

        // Helper functions
        function tableExists(database: Database, tableName: string): boolean {
            return (
                database
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='${tableName}'`)
                    .get()?.count === 1
            );
        }
        function migrationCacheEntryCount(database: Database): u53 {
            return unwrap(
                database
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM ${MIGRATION_CACHE.TABLE_NAME}`)
                    .get()?.count,
                'Missing count',
            );
        }
        function currentDbVersion(database: Database): u53 {
            return Number(db.pragma('user_version', {simple: true}));
        }
        function indexExists(database: Database, indexName: string): boolean {
            return (
                database
                    .prepare<
                        [string],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name=?`)
                    .get(indexName)?.count === 1
            );
        }
        interface TableColumn {
            readonly cid: number;
            readonly name: string;
            readonly type: string;
            readonly notNull: 0 | 1;
            readonly defaultValue: string | undefined;
            readonly pk: 0 | 1;
        }
        function tableColumns(database: Database, tableName: string): readonly TableColumn[] {
            return database
                .prepare<
                    [string],
                    Omit<TableColumn, 'defaultValue'> & {readonly defaultValue: unknown}
                >(
                    `SELECT cid, name, type, "notnull" AS "notNull",
                            dflt_value AS "defaultValue", pk
                     FROM pragma_table_info(?)`,
                )
                .all(tableName)
                .map(({defaultValue, ...column}) => ({
                    ...column,
                    defaultValue: typeof defaultValue === 'string' ? defaultValue : undefined,
                }));
        }
        function tableColumnNames(database: Database, tableName: string): readonly string[] {
            return tableColumns(database, tableName).map(({name}) => name);
        }
        function tableIndexNames(database: Database, tableName: string): readonly string[] {
            return database
                .prepare<[string], {readonly name: string}>(
                    `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? ORDER BY name`,
                )
                .all(tableName)
                .map(({name}) => name);
        }
        function indexColumnNames(database: Database, indexName: string): readonly string[] {
            return database
                .prepare<[], {readonly name: string}>(`PRAGMA index_info('${indexName}')`)
                .all()
                .map(({name}) => name);
        }
        function insertContactConversation(database: Database): void {
            database.exec(`
                INSERT INTO contacts (uid, identity, publicKey, createdAt, identityType)
                VALUES (
                    100,
                    'CONTACT1',
                    X'0000000000000000111111111111111122222222222222223333333333333333',
                    1,
                    0
                );
                INSERT INTO conversations (uid, contactUid) VALUES (200, 100);
            `);
        }
        function expectCurrentNonScheduledSchema(database: Database): void {
            expect(tableExists(database, 'outgoingMessageOutbox')).to.be.true;
            expect(tableColumnNames(database, 'messages')).to.include('sendFailedAt');
            expect(tableExists(database, 'pendingGroupDisappearingTimers')).to.be.true;
            expect(tableExists(database, 'pendingContactDisappearingTimers')).to.be.true;
            expect(tableExists(database, 'pendingUserProfileDistributions')).to.be.true;
            expect(tableExists(database, 'pendingUserProfileSyncs')).to.be.true;
            expect(tableColumnNames(database, 'messages')).to.include(
                'pendingRemoteDisappearingTimerNonceHash',
            );
            expect(indexExists(database, 'idxMessagesPendingRemoteDisappearingTimerNonceHash')).to
                .be.true;
        }

        it('does nothing when migrating to version 0', () => {
            const applied = migrationHelper.migrate(db, 0);
            expect(applied).to.equal(0);
        });

        it('does nothing when no migrations are available', () => {
            // Remove migrations
            // @ts-expect-error: Unsafe usage of private property
            migrationHelper._migrations = new Map();
            // @ts-expect-error: Unsafe usage of private property
            migrationHelper._maxEmbeddedMigrationNumber = 0;

            const applied = migrationHelper.migrate(db, 0);
            expect(applied).to.equal(0);
        });

        it('errors when up migration not found', () => {
            // @ts-expect-error: Unsafe usage of private property
            const maxMigrationAvailable: u53 = migrationHelper._maxEmbeddedMigrationNumber;
            expect(() => migrationHelper.migrate(db, Number.MAX_SAFE_INTEGER)).to.throw(
                `Could not find migration for version ${maxMigrationAvailable + 1}`,
            );
        });

        it('creates a migration table when migrations are applied', () => {
            expect(tableExists(db, MIGRATION_CACHE.TABLE_NAME)).to.be.false;
            migrationHelper.migrate(db, 0);
            expect(tableExists(db, MIGRATION_CACHE.TABLE_NAME)).to.be.false;
            migrationHelper.migrate(db, 1);
            expect(tableExists(db, MIGRATION_CACHE.TABLE_NAME)).to.be.true;
        });

        it('stores migrations in migration cache', () => {
            const applied = migrationHelper.migrate(db, 2);
            expect(applied).to.equal(2);
            expect(tableExists(db, MIGRATION_CACHE.TABLE_NAME)).to.be.true;
            interface MigrationCacheRow {
                readonly [MIGRATION_CACHE.COL_NUMBER]: u53;
                readonly [MIGRATION_CACHE.COL_UP_SQL]: string;
                readonly [MIGRATION_CACHE.COL_DOWN_SQL]: string;
            }
            const migrations = db
                .prepare<[], MigrationCacheRow>(
                    `SELECT ${MIGRATION_CACHE.COL_NUMBER}, ${MIGRATION_CACHE.COL_UP_SQL}, ${MIGRATION_CACHE.COL_DOWN_SQL}
                    FROM ${MIGRATION_CACHE.TABLE_NAME}
                    ORDER BY number asc`,
                )
                .all();
            expect(migrations.map((m) => m.number)).to.deep.equal([1, 2]);
            assert(migrations[0] !== undefined);
            expect(migrations[0].upSql).not.to.be.empty;
            expect(migrations[0].downSql).not.to.be.empty;
            expect(migrations[0].upSql).not.to.equal(migrations[0].downSql);
            assert(migrations[1] !== undefined);
            expect(migrations[1].upSql).not.to.be.empty;
            expect(migrations[1].downSql).not.to.be.empty;
            expect(migrations[1].upSql).not.to.equal(migrations[1].downSql);
        });

        it('overwrites existing migrations in migration cache', () => {
            // Apply first migration
            const applied1 = migrationHelper.migrate(db, 1);
            expect(applied1).to.equal(1);

            // Create migration with number 2
            db.prepare(
                `INSERT INTO ${MIGRATION_CACHE.TABLE_NAME} (
                    ${MIGRATION_CACHE.COL_NUMBER},
                    ${MIGRATION_CACHE.COL_NAME},
                    ${MIGRATION_CACHE.COL_UP_SQL},
                    ${MIGRATION_CACHE.COL_DOWN_SQL}
                ) VALUES (2, 'fake', 'SELECT 1', 'select 1')`,
            ).run();

            // Apply other migrations, this should overwrite existing entries in the cache
            const applied2 = migrationHelper.migrate(db, 2);
            expect(applied2).to.equal(1);
            interface MigrationCacheRow {
                readonly [MIGRATION_CACHE.COL_NAME]: string;
                readonly [MIGRATION_CACHE.COL_UP_SQL]: string;
                readonly [MIGRATION_CACHE.COL_DOWN_SQL]: string;
            }
            const migration = db
                .prepare<[], MigrationCacheRow>(
                    `SELECT ${MIGRATION_CACHE.COL_NAME}, ${MIGRATION_CACHE.COL_UP_SQL}, ${MIGRATION_CACHE.COL_DOWN_SQL}
                    FROM ${MIGRATION_CACHE.TABLE_NAME}
                    WHERE number = 2`,
                )
                .get();
            expect(migration?.name).not.to.equal('fake');
            expect(migration?.upSql).not.to.equal('SELECT 1');
            expect(migration?.downSql).not.to.equal('SELECT 1');
        });

        it('removes migrations from cache after down-migration', () => {
            const appliedUp = migrationHelper.migrate(db, 2);
            expect(appliedUp).to.equal(2);
            expect(tableExists(db, MIGRATION_CACHE.TABLE_NAME)).to.be.true;
            expect(migrationCacheEntryCount(db)).to.equal(2);
            const appliedDown = migrationHelper.migrate(db, 1);
            expect(appliedDown).to.equal(1);
            expect(migrationCacheEntryCount(db)).to.equal(1);
        });

        it('can load migrations from cache when doing down-migration', () => {
            // First, run all migrations
            // @ts-expect-error: Unsafe usage of private property
            const maxMigrationAvailable: u53 = migrationHelper._maxEmbeddedMigrationNumber;
            const appliedUp = migrationHelper.migrate(db, maxMigrationAvailable);
            expect(appliedUp).to.equal(maxMigrationAvailable);
            expect(currentDbVersion(db)).to.equal(maxMigrationAvailable);

            // Next, fake an up-migration.
            const fakeUpSql = 'CREATE TABLE pepperonipizza(id INTEGER PRIMARY KEY)';
            const fakeDownSql = 'DROP TABLE pepperonipizza';
            db.prepare(fakeUpSql).run();
            db.prepare(
                `INSERT INTO ${MIGRATION_CACHE.TABLE_NAME} (
                    ${MIGRATION_CACHE.COL_NUMBER},
                    ${MIGRATION_CACHE.COL_NAME},
                    ${MIGRATION_CACHE.COL_UP_SQL},
                    ${MIGRATION_CACHE.COL_DOWN_SQL}
                ) VALUES (?, ?, ?, ?)`,
            ).run(maxMigrationAvailable + 1, 'faked', fakeUpSql, fakeDownSql);
            db.pragma(`user_version = ${maxMigrationAvailable + 1}`);
            expect(currentDbVersion(db)).to.equal(maxMigrationAvailable + 1);

            // Ensure that table exists
            expect(tableExists(db, 'pepperonipizza')).to.be.true;

            // Now let's recreate the migration helper. This simulates the state after a downgrade:
            // The latest migration was applied (and cached in the database), but does not exist in
            // the migration list of the current app.
            const migrationHelperAfterDowngrade = MigrationHelper.create(log, {
                userIdentity: ensureIdentityString('MEMEMEME'),
            });

            // Downgrade to latest bundled migration version!
            const migrationsApplied = migrationHelperAfterDowngrade.migrate(db);
            expect(migrationsApplied).to.equal(1); // 1 down migration should be applied
            expect(currentDbVersion(db), 'current db version').to.equal(maxMigrationAvailable);
        });

        it('migration 0042 (scheduled messages) applies cleanly on top of an existing profile DB', () => {
            // Simulate an "existing profile" already migrated up to just before 0042.
            const appliedTo41 = migrationHelper.migrate(db, 41);
            expect(appliedTo41).to.equal(41);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;

            // Apply 0042 on top of that existing DB.
            const applied42 = migrationHelper.migrate(db, 42);
            expect(applied42).to.equal(1);
            expect(tableExists(db, 'scheduledMessages')).to.be.true;

            // Table has the expected columns and NOT NULL/FK constraints hold (a row referencing a
            // non-existent conversation is rejected -- FK enforcement must be on for this to fail).
            db.pragma('foreign_keys = ON');
            expect(() =>
                db
                    .prepare(
                        `INSERT INTO scheduledMessages (conversationUid, createdAt, fireAt, text)
                         VALUES (999999, 0, 0, 'test')`,
                    )
                    .run(),
            ).to.throw();

            // Down-migration cleanly removes the table again.
            const revertedTo41 = migrationHelper.migrate(db, 41);
            expect(revertedTo41).to.equal(1);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;
        });

        it('migration 0052 treats an absent scheduledMessages table as a successful no-op', () => {
            expect(migrationHelper.migrate(db, 51)).to.equal(51);
            db.exec(`DROP TABLE scheduledMessages`);

            expect(migrationHelper.migrate(db, 52)).to.equal(1);
            expect(currentDbVersion(db)).to.equal(52);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([]);
        });

        it('migration 0052 removes a populated original version-42 scheduled table', () => {
            expect(migrationHelper.migrate(db, 42)).to.equal(42);
            expect(tableColumnNames(db, 'scheduledMessages')).to.deep.equal([
                'uid',
                'conversationUid',
                'createdAt',
                'fireAt',
                'text',
                'quotedMessageId',
            ]);
            insertContactConversation(db);
            db.prepare(
                `INSERT INTO scheduledMessages
                    (uid, conversationUid, createdAt, fireAt, text, quotedMessageId)
                 VALUES (300, 200, 1, 2, 'legacy pending', randomblob(8))`,
            ).run();
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM scheduledMessages`)
                    .get()?.count,
            ).to.equal(1);

            expect(migrationHelper.migrate(db, 52)).to.equal(10);
            expect(currentDbVersion(db)).to.equal(52);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([]);
        });

        it('migration 0052 discards every legacy scheduled dispatch state and its indexes', () => {
            expect(migrationHelper.migrate(db, 51)).to.equal(51);
            insertContactConversation(db);
            db.exec(`
                INSERT INTO scheduledMessages
                    (uid, conversationUid, createdAt, fireAt, text, messageId, state, failedAt,
                     claimGeneration)
                VALUES
                    (300, 200, 1, 10, 'pending', X'0000000000000001', 0, NULL, 0),
                    (301, 200, 2, 20, 'claimed', X'0000000000000002', 1, NULL, 4),
                    (302, 200, 3, 30, 'failed', X'0000000000000003', 0, 31, 2),
                    (303, 200, 4, 40, 'cancelled', X'0000000000000004', 2, NULL, 1);
            `);
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM scheduledMessages`)
                    .get()?.count,
            ).to.equal(4);
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([
                'idxScheduledMessagesConversationUid',
                'idxScheduledMessagesFireAt',
                'idxScheduledMessagesStateFireAt',
            ]);

            expect(migrationHelper.migrate(db, 52)).to.equal(1);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;
            expect(indexExists(db, 'idxScheduledMessagesConversationUid')).to.be.false;
            expect(indexExists(db, 'idxScheduledMessagesFireAt')).to.be.false;
            expect(indexExists(db, 'idxScheduledMessagesStateFireAt')).to.be.false;
        });

        it('a fresh database reaches version 52 with only the scheduled schema removed', () => {
            expect(migrationHelper.migrate(db, 43)).to.equal(43);
            expect(tableExists(db, 'outgoingMessageOutbox')).to.be.false;

            expect(migrationHelper.migrate(db, 44)).to.equal(1);
            expect(tableExists(db, 'outgoingMessageOutbox')).to.be.true;

            expect(migrationHelper.migrate(db, 46)).to.equal(2);
            expect(tableColumnNames(db, 'messages')).not.to.include('sendFailedAt');
            expect(tableExists(db, 'pendingGroupDisappearingTimers')).to.be.false;

            expect(migrationHelper.migrate(db, 47)).to.equal(1);
            expect(tableColumnNames(db, 'messages')).to.include('sendFailedAt');
            expect(tableExists(db, 'pendingGroupDisappearingTimers')).to.be.true;

            expect(migrationHelper.migrate(db, 48)).to.equal(1);
            expect(tableExists(db, 'pendingUserProfileDistributions')).to.be.true;
            expect(tableExists(db, 'pendingUserProfileSyncs')).to.be.false;

            expect(migrationHelper.migrate(db, 49)).to.equal(1);
            expect(tableExists(db, 'pendingUserProfileSyncs')).to.be.true;

            expect(migrationHelper.migrate(db, 50)).to.equal(1);
            expect(tableExists(db, 'pendingContactDisappearingTimers')).to.be.true;

            expect(migrationHelper.migrate(db, 51)).to.equal(1);
            expect(tableColumnNames(db, 'messages')).to.include(
                'pendingRemoteDisappearingTimerNonceHash',
            );
            expect(indexExists(db, 'idxMessagesPendingRemoteDisappearingTimerNonceHash')).to.be
                .true;
            expect(tableExists(db, 'scheduledMessages')).to.be.true;

            expect(migrationHelper.migrate(db, 52)).to.equal(1);
            expect(currentDbVersion(db)).to.equal(52);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([]);
            expectCurrentNonScheduledSchema(db);
        });

        it('migration 0053 unconditionally blocks unsafe downgrade', () => {
            expect(migrationHelper.migrate(db, 52)).to.equal(52);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.false;

            expect(migrationHelper.migrate(db, 53)).to.equal(1);
            expect(currentDbVersion(db)).to.equal(53);
            const columns = tableColumns(db, 'incomingMessageDiscardDispositions');
            expect(columns.map(({name, type, notNull}) => ({name, type, notNull}))).to.deep.equal([
                {name: 'senderIdentity', type: 'TEXT', notNull: 1},
                {name: 'messageId', type: 'BLOB', notNull: 1},
                {name: 'nonceHash', type: 'BLOB', notNull: 1},
            ]);
            expect(columns.map(({pk}) => pk)).to.deep.equal([1, 2, 3]);

            db.exec(`
                INSERT INTO incomingMessageDiscardDispositions
                    (senderIdentity, messageId, nonceHash)
                VALUES
                    ('SENDER01', X'0100000000000000', zeroblob(32)),
                    ('SENDER01', X'0200000000000000', zeroblob(32)),
                    ('SENDER02', X'0100000000000000', zeroblob(32)),
                    ('SENDER01', X'0100000000000000', X'0100000000000000000000000000000000000000000000000000000000000000');
            `);
            expect(() =>
                db
                    .prepare(
                        `INSERT INTO incomingMessageDiscardDispositions
                            (senderIdentity, messageId, nonceHash)
                         VALUES ('SENDER01', X'0100000000000000', zeroblob(32))`,
                    )
                    .run(),
            ).to.throw();
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM incomingMessageDiscardDispositions`)
                    .get()?.count,
            ).to.equal(4);

            expect(() => migrationHelper.migrate(db, 52)).to.throw();
            expect(currentDbVersion(db)).to.equal(53);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.true;
            expect(tableExists(db, 'migration0053DowngradeGuard')).to.be.false;
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM incomingMessageDiscardDispositions`)
                    .get()?.count,
            ).to.equal(4);

            db.exec(`DELETE FROM incomingMessageDiscardDispositions`);
            expect(() => migrationHelper.migrate(db, 52)).to.throw();
            expect(currentDbVersion(db)).to.equal(53);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.true;
            expect(tableExists(db, 'migration0053DowngradeGuard')).to.be.false;
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM incomingMessageDiscardDispositions`)
                    .get()?.count,
            ).to.equal(0);
        });

        it('retains schema versions used by the accepted pre-release build', () => {
            expect(migrationHelper.migrate(db, 53)).to.equal(53);
            expect(currentDbVersion(db)).to.equal(53);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.true;

            expect(migrationHelper.migrate(db, 56)).to.equal(3);
            expect(currentDbVersion(db)).to.equal(56);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.true;
            expect(tableExists(db, 'pendingOutgoingMessageReactions')).to.be.false;
            expect(tableExists(db, 'ownMessageReactionWatermarks')).to.be.false;

            expect(migrationHelper.migrate(db, 53)).to.equal(3);
            expect(currentDbVersion(db)).to.equal(53);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.true;
        });

        it('does not downgrade an accepted pre-release version-56 profile', () => {
            expect(migrationHelper.migrate(db, 52)).to.equal(52);
            db.exec(`
                CREATE TABLE pendingOutgoingMessageReactions (
                    generation INTEGER PRIMARY KEY AUTOINCREMENT,
                    messageUid INTEGER NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
                    reaction TEXT NOT NULL,
                    operation INTEGER NOT NULL CHECK (operation IN (0, 1)),
                    outgoingMessageId BLOB NOT NULL,
                    createdAt INTEGER NOT NULL,
                    UNIQUE(messageUid, reaction)
                );
                CREATE TABLE incomingMessageDiscardDispositions (
                    senderIdentity TEXT NOT NULL,
                    messageId BLOB NOT NULL,
                    nonceHash BLOB NOT NULL,
                    PRIMARY KEY (senderIdentity, messageId, nonceHash)
                ) WITHOUT ROWID;
                ALTER TABLE pendingOutgoingMessageReactions ADD COLUMN reflectedAt INTEGER;
                ALTER TABLE pendingOutgoingMessageReactions ADD COLUMN reactionAt INTEGER;
                CREATE TABLE ownMessageReactionWatermarks (
                    messageUid INTEGER NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
                    scopeKey TEXT NOT NULL,
                    reaction TEXT NOT NULL,
                    reactionAt INTEGER,
                    operation INTEGER NOT NULL CHECK (operation IN (0, 1)),
                    outgoingMessageId BLOB NOT NULL,
                    reflectedAt INTEGER NOT NULL,
                    PRIMARY KEY (messageUid, scopeKey)
                ) WITHOUT ROWID;
                ALTER TABLE pendingOutgoingMessageReactions
                    ADD COLUMN reflectionAttempted INTEGER NOT NULL DEFAULT 0
                    CHECK (reflectionAttempted IN (0, 1));
                ALTER TABLE pendingOutgoingMessageReactions
                    ADD COLUMN cspAcknowledged INTEGER NOT NULL DEFAULT 0
                    CHECK (cspAcknowledged IN (0, 1));
            `);

            const insertCachedMigration = db.prepare(
                `INSERT INTO ${MIGRATION_CACHE.TABLE_NAME} (
                    ${MIGRATION_CACHE.COL_NUMBER},
                    ${MIGRATION_CACHE.COL_NAME},
                    ${MIGRATION_CACHE.COL_UP_SQL},
                    ${MIGRATION_CACHE.COL_DOWN_SQL}
                ) VALUES (?, ?, ?, ?)`,
            );
            insertCachedMigration.run(
                53,
                'pending-outgoing-message-reactions',
                'SELECT 1;',
                'DROP TABLE pendingOutgoingMessageReactions;',
            );
            insertCachedMigration.run(
                54,
                'incoming-message-discard-dispositions',
                'SELECT 1;',
                `CREATE TABLE migration0054DowngradeGuard (
                    blocked INTEGER NOT NULL CHECK (blocked = 0)
                );
                INSERT INTO migration0054DowngradeGuard (blocked) VALUES (1);`,
            );
            insertCachedMigration.run(
                55,
                'own-message-reaction-watermarks',
                'SELECT 1;',
                `CREATE TABLE migration0055DowngradeGuard (
                    blocked INTEGER NOT NULL CHECK (blocked = 0)
                );
                INSERT INTO migration0055DowngradeGuard (blocked) VALUES (1);`,
            );
            insertCachedMigration.run(
                56,
                'pending-reaction-reflection-attempts',
                'SELECT 1;',
                `CREATE TABLE migration0056DowngradeGuard (
                    blocked INTEGER NOT NULL CHECK (blocked = 0)
                );
                INSERT INTO migration0056DowngradeGuard (blocked) VALUES (1);`,
            );
            db.pragma('user_version = 56');

            const releasedMigrationHelper = MigrationHelper.create(log, {
                userIdentity: ensureIdentityString('MEMEMEME'),
            });
            // @ts-expect-error: Simulate the released binary whose migration tail ended at 0053.
            releasedMigrationHelper._migrations.delete(54);
            // @ts-expect-error: Simulate the released binary whose migration tail ended at 0053.
            releasedMigrationHelper._migrations.delete(55);
            // @ts-expect-error: Simulate the released binary whose migration tail ended at 0053.
            releasedMigrationHelper._migrations.delete(56);
            // @ts-expect-error: Simulate the released binary's highest embedded migration number.
            releasedMigrationHelper._maxEmbeddedMigrationNumber = 53;

            expect(() => releasedMigrationHelper.migrate(db)).to.throw(
                'Running the down-migration 56 failed',
            );
            expect(currentDbVersion(db)).to.equal(56);
            expect(tableExists(db, 'migration0056DowngradeGuard')).to.be.false;
            expect(tableExists(db, 'pendingOutgoingMessageReactions')).to.be.true;
            expect(tableExists(db, 'ownMessageReactionWatermarks')).to.be.true;

            const compatibleMigrationHelper = MigrationHelper.create(log, {
                userIdentity: ensureIdentityString('MEMEMEME'),
            });
            // F1Whisper fork: the current build continues from the accepted version-56 profile
            // through the adopted upstream migrations (57..60) and the fork migration 0061.
            expect(compatibleMigrationHelper.migrate(db, 56)).to.equal(0);
            expect(currentDbVersion(db)).to.equal(56);
            expect(compatibleMigrationHelper.migrate(db)).to.equal(5);
            expect(currentDbVersion(db)).to.equal(61);
            expect(tableExists(db, 'incomingMessageDiscardDispositions')).to.be.true;
        });

        it('migration 0052 recreates the exact empty legacy schema for a full downgrade and re-upgrade', () => {
            expect(migrationHelper.migrate(db, 52)).to.equal(52);

            expect(migrationHelper.migrate(db, 51)).to.equal(1);
            expect(currentDbVersion(db)).to.equal(51);
            expect(tableColumns(db, 'scheduledMessages')).to.deep.equal([
                {
                    cid: 0,
                    name: 'uid',
                    type: 'INTEGER',
                    notNull: 0,
                    defaultValue: undefined,
                    pk: 1,
                },
                {
                    cid: 1,
                    name: 'conversationUid',
                    type: 'INTEGER',
                    notNull: 1,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 2,
                    name: 'createdAt',
                    type: 'INTEGER',
                    notNull: 1,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 3,
                    name: 'fireAt',
                    type: 'INTEGER',
                    notNull: 1,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 4,
                    name: 'text',
                    type: 'TEXT',
                    notNull: 1,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 5,
                    name: 'quotedMessageId',
                    type: 'BLOB',
                    notNull: 0,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 6,
                    name: 'messageId',
                    type: 'BLOB',
                    notNull: 0,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 7,
                    name: 'state',
                    type: 'INTEGER',
                    notNull: 1,
                    defaultValue: '0',
                    pk: 0,
                },
                {
                    cid: 8,
                    name: 'failedAt',
                    type: 'INTEGER',
                    notNull: 0,
                    defaultValue: undefined,
                    pk: 0,
                },
                {
                    cid: 9,
                    name: 'claimGeneration',
                    type: 'INTEGER',
                    notNull: 1,
                    defaultValue: '0',
                    pk: 0,
                },
            ]);
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM scheduledMessages`)
                    .get()?.count,
            ).to.equal(0);
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([
                'idxScheduledMessagesConversationUid',
                'idxScheduledMessagesFireAt',
                'idxScheduledMessagesStateFireAt',
            ]);
            expect(indexColumnNames(db, 'idxScheduledMessagesConversationUid')).to.deep.equal([
                'conversationUid',
            ]);
            expect(indexColumnNames(db, 'idxScheduledMessagesFireAt')).to.deep.equal(['fireAt']);
            expect(indexColumnNames(db, 'idxScheduledMessagesStateFireAt')).to.deep.equal([
                'state',
                'fireAt',
            ]);
            expectCurrentNonScheduledSchema(db);

            expect(migrationHelper.migrate(db, 41)).to.equal(10);
            expect(currentDbVersion(db)).to.equal(41);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;

            expect(migrationHelper.migrate(db, 52)).to.equal(11);
            expect(currentDbVersion(db)).to.equal(52);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([]);
            expectCurrentNonScheduledSchema(db);
        });

        it('a simulated version-51 binary uses cached 0052 down SQL', () => {
            expect(migrationHelper.migrate(db, 52)).to.equal(52);
            expect(tableExists(db, 'scheduledMessages')).to.be.false;

            const priorBinaryMigrationHelper = MigrationHelper.create(log, {
                userIdentity: ensureIdentityString('MEMEMEME'),
            });
            // @ts-expect-error: Simulate a prior binary whose embedded migration map ends at 0051.
            priorBinaryMigrationHelper._migrations.delete(52);
            // @ts-expect-error: Simulate the prior binary's highest embedded migration number.
            priorBinaryMigrationHelper._maxEmbeddedMigrationNumber = 51;

            expect(priorBinaryMigrationHelper.migrate(db)).to.equal(1);
            expect(currentDbVersion(db)).to.equal(51);
            expect(tableColumnNames(db, 'scheduledMessages')).to.deep.equal([
                'uid',
                'conversationUid',
                'createdAt',
                'fireAt',
                'text',
                'quotedMessageId',
                'messageId',
                'state',
                'failedAt',
                'claimGeneration',
            ]);
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM scheduledMessages`)
                    .get()?.count,
            ).to.equal(0);
            expect(tableIndexNames(db, 'scheduledMessages')).to.deep.equal([
                'idxScheduledMessagesConversationUid',
                'idxScheduledMessagesFireAt',
                'idxScheduledMessagesStateFireAt',
            ]);
            expectCurrentNonScheduledSchema(db);
        });

        it('migration 0049 repairs an existing v48 profile exactly once across restart', () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'threema-migration-0049-'));
            const databasePath = path.join(directory, 'profile.db');
            let fileDb = new DatabaseConstructor(databasePath);

            const stateCodec =
                PERSISTENT_PROTOCOL_STATE_CODEC[
                    PersistentProtocolStateType.LAST_USER_PROFILE_DISTRIBUTION_STATE
                ];
            const legacySet = stateCodec.encode({
                receiverIdentity: ensureIdentityString('LEGACY01'),
                profilePicture: {
                    type: 'profile-picture',
                    blobId: ensureBlobId(new Uint8Array(BLOB_ID_LENGTH).fill(1)),
                },
            });
            const legacyDelete = stateCodec.encode({
                receiverIdentity: ensureIdentityString('LEGACY02'),
                profilePicture: {type: 'removed'},
            });
            const postMigration = stateCodec.encode({
                receiverIdentity: ensureIdentityString('CURRENT1'),
                profilePicture: {type: 'removed'},
            });

            try {
                const fileMigrationHelper = MigrationHelper.create(log, {
                    userIdentity: ensureIdentityString('MEMEMEME'),
                });
                expect(fileMigrationHelper.migrate(fileDb, 47)).to.equal(47);

                const insertState = fileDb.prepare(
                    `INSERT INTO persistentProtocolState (type, createdAt, stateBytes)
                     VALUES (?, ?, ?)`,
                );
                insertState.run(
                    PersistentProtocolStateType.LAST_USER_PROFILE_DISTRIBUTION_STATE,
                    1,
                    legacySet,
                );
                insertState.run(
                    PersistentProtocolStateType.LAST_USER_PROFILE_DISTRIBUTION_STATE,
                    2,
                    legacyDelete,
                );
                expect(
                    fileDb
                        .prepare<
                            [],
                            {readonly count: u53}
                        >(`SELECT COUNT(*) AS count FROM persistentProtocolState WHERE type = 0`)
                        .get()?.count,
                ).to.equal(2);

                expect(fileMigrationHelper.migrate(fileDb, 48)).to.equal(1);
                expect(tableExists(fileDb, 'pendingUserProfileDistributions')).to.be.true;
                expect(tableExists(fileDb, 'pendingUserProfileSyncs')).to.be.false;
                expect(
                    fileDb
                        .prepare<
                            [],
                            {readonly count: u53}
                        >(`SELECT COUNT(*) AS count FROM persistentProtocolState WHERE type = 0`)
                        .get()?.count,
                ).to.equal(2);

                // Simulate an existing profile that already ran the original migration 0048.
                fileDb.close();
                fileDb = new DatabaseConstructor(databasePath);
                const v48RestartedMigrationHelper = MigrationHelper.create(log, {
                    userIdentity: ensureIdentityString('MEMEMEME'),
                });
                expect(v48RestartedMigrationHelper.migrate(fileDb, 49)).to.equal(1);
                expect(tableExists(fileDb, 'pendingUserProfileSyncs')).to.be.true;
                expect(
                    fileDb
                        .prepare<
                            [],
                            {readonly count: u53}
                        >(`SELECT COUNT(*) AS count FROM persistentProtocolState WHERE type = 0`)
                        .get()?.count,
                ).to.equal(0);

                fileDb
                    .prepare(
                        `INSERT INTO persistentProtocolState (type, createdAt, stateBytes)
                         VALUES (?, ?, ?)`,
                    )
                    .run(
                        PersistentProtocolStateType.LAST_USER_PROFILE_DISTRIBUTION_STATE,
                        3,
                        postMigration,
                    );
                fileDb.close();

                fileDb = new DatabaseConstructor(databasePath);
                const restartedMigrationHelper = MigrationHelper.create(log, {
                    userIdentity: ensureIdentityString('MEMEMEME'),
                });
                expect(restartedMigrationHelper.migrate(fileDb, 49)).to.equal(0);

                const remaining = fileDb
                    .prepare<
                        [],
                        {readonly stateBytes: Buffer}
                    >(`SELECT stateBytes FROM persistentProtocolState WHERE type = 0`)
                    .all();
                expect(remaining).to.have.lengthOf(1);
                expect(remaining[0]?.stateBytes).to.deep.equal(Buffer.from(postMigration));

                const pendingGeneration = unwrap(
                    fileDb
                        .prepare<
                            [],
                            {readonly generation: u53}
                        >(`SELECT generation FROM pendingUserProfileSyncs`)
                        .get()?.generation,
                    'Migration 0049 did not create reconciliation intent',
                );

                expect(restartedMigrationHelper.migrate(fileDb, 48)).to.equal(1);
                expect(tableExists(fileDb, 'pendingUserProfileDistributions')).to.be.true;
                expect(tableExists(fileDb, 'pendingUserProfileSyncs')).to.be.true;
                expect(
                    fileDb
                        .prepare<
                            [number],
                            {readonly count: u53}
                        >(`SELECT COUNT(*) AS count FROM pendingUserProfileSyncs WHERE generation = ?`)
                        .get(pendingGeneration)?.count,
                ).to.equal(1);
                const remainingAfterDown = fileDb
                    .prepare<
                        [],
                        {readonly stateBytes: Buffer}
                    >(`SELECT stateBytes FROM persistentProtocolState WHERE type = 0`)
                    .all();
                expect(remainingAfterDown).to.have.lengthOf(1);
                expect(remainingAfterDown[0]?.stateBytes).to.deep.equal(Buffer.from(postMigration));

                expect(restartedMigrationHelper.migrate(fileDb, 49)).to.equal(1);
                expect(
                    fileDb
                        .prepare<
                            [number],
                            {readonly count: u53}
                        >(`SELECT COUNT(*) AS count FROM pendingUserProfileSyncs WHERE generation = ?`)
                        .get(pendingGeneration)?.count,
                    're-upgrade must preserve unacknowledged D2D intent',
                ).to.equal(1);
                expect(
                    fileDb
                        .prepare<
                            [],
                            {readonly count: u53}
                        >(`SELECT COUNT(*) AS count FROM persistentProtocolState WHERE type = 0`)
                        .get()?.count,
                    're-upgrade must distrust cache entries created by version-48 code',
                ).to.equal(0);

                // Simulate version-48 code changing settings while no preserved row exists. The
                // next 0049 application must create fresh reconciliation intent.
                expect(restartedMigrationHelper.migrate(fileDb, 48)).to.equal(1);
                fileDb.prepare(`DELETE FROM pendingUserProfileSyncs`).run();
                expect(restartedMigrationHelper.migrate(fileDb, 49)).to.equal(1);
                const rollbackReconciliation = unwrap(
                    fileDb
                        .prepare<
                            [],
                            {readonly generation: u53}
                        >(`SELECT generation FROM pendingUserProfileSyncs`)
                        .get()?.generation,
                    'Re-upgrade did not recreate reconciliation intent',
                );
                expect(rollbackReconciliation).to.be.greaterThan(pendingGeneration);

                expect(restartedMigrationHelper.migrate(fileDb, 47)).to.equal(2);
                expect(tableExists(fileDb, 'pendingUserProfileDistributions')).to.be.false;
                expect(tableExists(fileDb, 'pendingUserProfileSyncs')).to.be.true;
            } finally {
                if (fileDb.open) {
                    fileDb.close();
                }
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it('migration 0050 preserves shared contact state on rollback without reconstructing intent', () => {
            expect(migrationHelper.migrate(db, 49)).to.equal(49);
            db.exec(`
                INSERT INTO contacts (uid, identity, publicKey, createdAt, identityType)
                VALUES (
                    100,
                    'CONTACT1',
                    X'0000000000000000111111111111111122222222222222223333333333333333',
                    1,
                    0
                );
                INSERT INTO conversations (
                    uid,
                    contactUid,
                    ephemeralTimerSeconds,
                    peerEphemeralTimerSeconds
                ) VALUES (200, 100, 30, 90);
            `);

            expect(migrationHelper.migrate(db, 50)).to.equal(1);
            expect(tableExists(db, 'pendingContactDisappearingTimers')).to.be.true;
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM pendingContactDisappearingTimers`)
                    .get()?.count,
                'upgrade must not backfill current shared values as local intent',
            ).to.equal(0);

            const insertPending = db.prepare(
                `INSERT INTO pendingContactDisappearingTimers
                    (contactUid, timerSeconds, messageId, createdAt)
                 VALUES (100, ?, randomblob(8), ?)`,
            );
            const firstGeneration = Number(insertPending.run(0, 2).lastInsertRowid);
            db.prepare(`DELETE FROM pendingContactDisappearingTimers WHERE contactUid = 100`).run();
            const secondGeneration = Number(insertPending.run(120, 3).lastInsertRowid);
            expect(secondGeneration).to.be.greaterThan(firstGeneration);
            expect(
                () => insertPending.run(60, 4),
                'one contact may have only one current intent',
            ).to.throw();

            db.exec(`
                INSERT INTO contacts (uid, identity, publicKey, createdAt, identityType)
                VALUES (
                    101,
                    'CONTACT2',
                    X'1000000000000000111111111111111122222222222222223333333333333333',
                    1,
                    0
                );
                INSERT INTO pendingContactDisappearingTimers
                    (contactUid, timerSeconds, messageId, createdAt)
                VALUES (101, 0, randomblob(8), 5);
                DELETE FROM contacts WHERE uid = 101;
            `);
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM pendingContactDisappearingTimers WHERE contactUid = 101`)
                    .get()?.count,
                'deleting a contact cascades its pending intent',
            ).to.equal(0);

            // The shared field, including explicit OFF, must become v49's inbound-governing peer
            // value before the durable v50 intent table is removed.
            db.prepare(`UPDATE conversations SET ephemeralTimerSeconds = 0 WHERE uid = 200`).run();
            expect(migrationHelper.migrate(db, 49)).to.equal(1);
            expect(tableExists(db, 'pendingContactDisappearingTimers')).to.be.false;
            expect(
                db
                    .prepare<
                        [],
                        {readonly timer: u53}
                    >(`SELECT peerEphemeralTimerSeconds AS timer FROM conversations WHERE uid = 200`)
                    .get()?.timer,
            ).to.equal(0);

            // Version-49 code may change either legacy field. Re-upgrade creates an empty intent
            // table and never guesses that either persisted value was a genuine local change.
            db.prepare(
                `UPDATE conversations
                 SET ephemeralTimerSeconds = 120, peerEphemeralTimerSeconds = 45
                 WHERE uid = 200`,
            ).run();
            expect(migrationHelper.migrate(db, 50)).to.equal(1);
            expect(tableExists(db, 'pendingContactDisappearingTimers')).to.be.true;
            expect(
                db
                    .prepare<
                        [],
                        {readonly count: u53}
                    >(`SELECT COUNT(*) AS count FROM pendingContactDisappearingTimers`)
                    .get()?.count,
                're-upgrade must not reconstruct contact delivery intent',
            ).to.equal(0);
        });

        it('migration 0051 adds a one-shot nonce binding and restores fallback expiry on rollback', () => {
            expect(migrationHelper.migrate(db, 50)).to.equal(50);
            db.exec(`
                INSERT INTO contacts (uid, identity, publicKey, createdAt, identityType)
                VALUES (
                    100,
                    'CONTACT1',
                    X'0000000000000000111111111111111122222222222222223333333333333333',
                    1,
                    0
                );
                INSERT INTO conversations (uid, contactUid) VALUES (200, 100);
            `);

            expect(migrationHelper.migrate(db, 51)).to.equal(1);
            const columns = db
                .prepare<[], {readonly name: string}>(`PRAGMA table_info(messages)`)
                .all()
                .map(({name}) => name);
            expect(columns).to.include('pendingRemoteDisappearingTimerNonceHash');

            const insertMessage = db.prepare(
                `INSERT INTO messages (
                    uid,
                    messageId,
                    senderContactUid,
                    conversationUid,
                    createdAt,
                    readAt,
                    messageType,
                    threadId,
                    disappearingTimerSeconds,
                    pendingRemoteDisappearingTimerNonceHash
                ) VALUES (?, ?, 100, 200, 1, ?, 'text', 1, ?, ?)`,
            );
            const nonceHash = Buffer.alloc(32, 7);
            insertMessage.run(300, Buffer.alloc(8, 1), 1_000, 300, nonceHash);
            expect(() => insertMessage.run(301, Buffer.alloc(8, 2), null, 30, nonceHash)).to.throw(
                'UNIQUE constraint failed',
            );
            insertMessage.run(302, Buffer.alloc(8, 3), null, 0, null);
            insertMessage.run(303, Buffer.alloc(8, 4), null, 0, null);

            expect(migrationHelper.migrate(db, 50)).to.equal(1);
            const rolledBackColumns = db
                .prepare<[], {readonly name: string}>(`PRAGMA table_info(messages)`)
                .all()
                .map(({name}) => name);
            expect(rolledBackColumns).not.to.include('pendingRemoteDisappearingTimerNonceHash');
            expect(
                db
                    .prepare<
                        [],
                        {readonly expireStartedAt: u53; readonly expiresAt: u53}
                    >(`SELECT expireStartedAt, expiresAt FROM messages WHERE uid = 300`)
                    .get(),
                'a read pending row keeps its v50 fallback deadline after downgrade',
            ).to.deep.equal({expireStartedAt: 1_000, expiresAt: 301_000});
            expect(
                db
                    .prepare<[], {readonly count: u53}>(
                        `SELECT COUNT(*) AS count FROM sqlite_master
                       WHERE type = 'index'
                         AND name = 'idxMessagesPendingRemoteDisappearingTimerNonceHash'`,
                    )
                    .get()?.count,
            ).to.equal(0);
        });

        it('migration 0061 (fork) orders by sender time, and rolls back to upstream receive time', () => {
            function orderedOrdinals(database: Database): readonly {
                readonly uid: u53;
                readonly ordinal: u53;
            }[] {
                return database
                    .prepare<
                        [],
                        {readonly uid: u53; readonly ordinal: u53}
                    >(`SELECT uid, ordinal FROM messages ORDER BY uid`)
                    .all();
            }
            function ordinalIndexSql(database: Database): string | undefined {
                return database
                    .prepare<[], {readonly sql: string}>(
                        `SELECT sql FROM sqlite_master
                         WHERE type = 'index' AND name = 'indexMessagesConversationUidOrdinal'`,
                    )
                    .get()?.sql;
            }

            // Upstream's definition (adopted as 0060): receive time first.
            expect(migrationHelper.migrate(db, 60)).to.equal(60);
            insertContactConversation(db);
            db.exec(`
                INSERT INTO messages (uid, messageId, senderContactUid, conversationUid, createdAt, processedAt, messageType, threadId)
                VALUES (300, X'0000000000000001', 100, 200, 1000, 5000, 'text', 1),
                       (301, X'0000000000000002', 100, 200, 2000, NULL, 'text', 1);
            `);
            expect(orderedOrdinals(db)).to.deep.equal([
                {uid: 300, ordinal: 5000},
                {uid: 301, ordinal: 2000},
            ]);
            const upstreamIndexSql = ordinalIndexSql(db);
            expect(upstreamIndexSql).not.to.be.undefined;

            // Fork: sender time. Existing rows are re-evaluated (virtual column), the index is
            // re-created with upstream's exact definition.
            expect(migrationHelper.migrate(db, 61)).to.equal(1);
            expect(orderedOrdinals(db)).to.deep.equal([
                {uid: 300, ordinal: 1000},
                {uid: 301, ordinal: 2000},
            ]);
            expect(ordinalIndexSql(db)).to.equal(upstreamIndexSql);
            expect(indexColumnNames(db, 'indexMessagesConversationUidOrdinal')).to.deep.equal([
                'conversationUid',
                'ordinal',
            ]);
            expect(indexExists(db, 'indexMessagesConversationUidUnreadInbound')).to.be.true;
            expect(indexExists(db, 'indexStatusMessagesConversationUidCreatedAt')).to.be.true;

            // Rollback restores upstream's expression under the same index name.
            expect(migrationHelper.migrate(db, 60)).to.equal(1);
            expect(orderedOrdinals(db)).to.deep.equal([
                {uid: 300, ordinal: 5000},
                {uid: 301, ordinal: 2000},
            ]);
            expect(ordinalIndexSql(db)).to.equal(upstreamIndexSql);

            // And the full down chain 61..57 followed by a re-upgrade lands on the same schema.
            expect(migrationHelper.migrate(db, 61)).to.equal(1);
            expect(migrationHelper.migrate(db, 56)).to.equal(5);
            expect(tableColumnNames(db, 'messages')).not.to.include('ordinal');
            expect(indexExists(db, 'indexMessagesConversationUidOrdinal')).to.be.false;
            expect(migrationHelper.migrate(db, 61)).to.equal(5);
            expect(orderedOrdinals(db)).to.deep.equal([
                {uid: 300, ordinal: 1000},
                {uid: 301, ordinal: 2000},
            ]);
            expect(ordinalIndexSql(db)).to.equal(upstreamIndexSql);
        });
    });
}
