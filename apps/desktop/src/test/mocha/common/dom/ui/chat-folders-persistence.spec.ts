import {expect} from 'chai';

import {
    type ChatFolderFlushBackoff,
    type ChatFolderPersistence,
    connectChatFolderStores,
    type EncryptedChatFolderStorage,
    migrateAndHydrateChatFolders,
    type WebStorageLike,
} from '~/common/dom/ui/local-storage';
import {type Logger, NOOP_LOGGER} from '~/common/logging';
import type {ChatFolder, ChatFolderMembers, FoldersSettings} from '~/common/settings/folders';
import type {u53} from '~/common/types';
import {WritableStore} from '~/common/utils/store';

const LEGACY_FOLDERS_KEY = 'chat-folders';
const LEGACY_MEMBERS_KEY = 'chat-folder-members';
const MIGRATED_KEY = 'chat-folders-migrated';

/**
 * Build a folder-membership record. The keys are receiver-lookup-key strings (e.g. `contact:1`),
 * which are not valid JS identifiers, so build them as data rather than as object-literal names.
 */
function membership(
    ...entries: readonly (readonly [lookupKey: string, folderIds: readonly string[]])[]
): Record<string, string[]> {
    return Object.fromEntries(entries.map(([key, folderIds]) => [key, [...folderIds]]));
}

/**
 * In-memory {@link WebStorageLike} for exercising the migration without a real `localStorage`.
 */
class FakeStorage implements WebStorageLike {
    private readonly _map = new Map<string, string>();

    public constructor(initial?: Readonly<Record<string, string>>) {
        for (const [key, value] of Object.entries(initial ?? {})) {
            this._map.set(key, value);
        }
    }

    public getItem(key: string): string | undefined {
        return this._map.get(key);
    }

    public setItem(key: string, value: string): void {
        this._map.set(key, value);
    }

    public removeItem(key: string): void {
        this._map.delete(key);
    }
}

/**
 * In-memory {@link EncryptedChatFolderStorage} that records write count and can fail once.
 */
class FakeEncrypted implements EncryptedChatFolderStorage {
    public value: FoldersSettings;
    public writes = 0;
    public failNextWrite = false;
    public failAllWrites = false;
    public failRead = false;

    public constructor(initial: FoldersSettings = {folders: [], members: {}}) {
        this.value = clone(initial);
    }

    public read(): FoldersSettings {
        if (this.failRead) {
            throw new Error('simulated encrypted read failure');
        }
        return this.value;
    }

    public async write(settings: FoldersSettings): Promise<void> {
        await Promise.resolve();
        if (this.failAllWrites || this.failNextWrite) {
            this.failNextWrite = false;
            throw new Error('simulated encrypted write failure');
        }
        this.writes += 1;
        this.value = clone(settings);
    }
}

function clone(settings: FoldersSettings): FoldersSettings {
    return {
        folders: settings.folders.map((folder) => ({id: folder.id, name: folder.name})),
        members: Object.fromEntries(
            Object.entries(settings.members).map(([key, ids]) => [key, [...ids]]),
        ),
    };
}

/**
 * Wait for the write-behind flush chain (microtasks + one macrotask) to settle.
 */
async function tick(): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

/**
 * Wait a real interval (for exercising the background retry backoff timers).
 */
async function delay(ms: u53): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

function makeCapturingLogger(errors: unknown[][]): Logger {
    return {
        prefix: undefined,
        trace() {
            // No-op.
        },
        debug() {
            // No-op.
        },
        info() {
            // No-op.
        },
        warn() {
            // No-op.
        },
        error(...data: readonly unknown[]) {
            errors.push([...data]);
        },
        assert(condition: boolean, ...data: readonly unknown[]): asserts condition {
            if (!condition) {
                throw new Error(`Assertion failed: ${data.join(' ')}`);
            }
        },
    };
}

/**
 * F1Whisper fork (U-M04): tests for the chat-folders facade in `common/dom/ui/local-storage`.
 *
 * Folders were moved from plaintext local storage into the encrypted settings store. These tests
 * cover (a) the one-time plaintext -> encrypted migration (idempotent and crash-safe) and (b) the
 * hydrate + write-behind flush that keeps `services.storage.chatFolders`/`chatFolderMembers` backed
 * by the encrypted store.
 */
export function run(): void {
    describe('chat-folders encrypted persistence (U-M04)', function () {
        describe('migrateAndHydrateChatFolders', function () {
            it('migrates legacy plaintext into the encrypted store and purges it', async function () {
                const storage = new FakeStorage({
                    [LEGACY_FOLDERS_KEY]: JSON.stringify([{id: 'a', name: 'Work'}]),
                    [LEGACY_MEMBERS_KEY]: JSON.stringify(membership(['contact:1', ['a']])),
                });
                const encrypted = new FakeEncrypted();

                const result = await migrateAndHydrateChatFolders(storage, encrypted);

                const expected: FoldersSettings = {
                    folders: [{id: 'a', name: 'Work'}],
                    members: membership(['contact:1', ['a']]),
                };
                expect(result).to.deep.equal(expected);
                expect(encrypted.value).to.deep.equal(expected);
                expect(encrypted.writes).to.equal(1);
                expect(storage.getItem(MIGRATED_KEY)).to.equal('1');
                expect(storage.getItem(LEGACY_FOLDERS_KEY)).to.be.undefined;
                expect(storage.getItem(LEGACY_MEMBERS_KEY)).to.be.undefined;
            });

            it('retains plaintext and does not mark complete if the encrypted write fails', async function () {
                const storage = new FakeStorage({
                    [LEGACY_FOLDERS_KEY]: JSON.stringify([{id: 'a', name: 'Work'}]),
                });
                const encrypted = new FakeEncrypted();
                encrypted.failNextWrite = true;

                let threw = false;
                try {
                    await migrateAndHydrateChatFolders(storage, encrypted);
                } catch {
                    threw = true;
                }
                expect(threw).to.equal(true);
                expect(storage.getItem(MIGRATED_KEY)).to.be.undefined;
                expect(storage.getItem(LEGACY_FOLDERS_KEY)).to.not.be.undefined;
                expect(encrypted.writes).to.equal(0);

                // A retry on the next launch completes the migration.
                const result = await migrateAndHydrateChatFolders(storage, encrypted);
                expect(result.folders).to.deep.equal([{id: 'a', name: 'Work'}]);
                expect(storage.getItem(MIGRATED_KEY)).to.equal('1');
                expect(storage.getItem(LEGACY_FOLDERS_KEY)).to.be.undefined;
            });

            it('is a no-op on a second run and purges leftover plaintext (marker set)', async function () {
                const storage = new FakeStorage({
                    [MIGRATED_KEY]: '1',
                    // Leftover from a previous run whose removeItem did not complete.
                    [LEGACY_FOLDERS_KEY]: JSON.stringify([{id: 'stale', name: 'Stale'}]),
                });
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: {},
                });

                const result = await migrateAndHydrateChatFolders(storage, encrypted);

                expect(result).to.deep.equal({folders: [{id: 'a', name: 'Work'}], members: {}});
                expect(encrypted.writes).to.equal(0);
                expect(storage.getItem(LEGACY_FOLDERS_KEY)).to.be.undefined;
            });

            it('never clobbers existing encrypted data with stale plaintext (marker lost)', async function () {
                const storage = new FakeStorage({
                    [LEGACY_FOLDERS_KEY]: JSON.stringify([{id: 'stale', name: 'Stale'}]),
                });
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: membership(['contact:1', ['a']]),
                });

                const result = await migrateAndHydrateChatFolders(storage, encrypted);

                expect(result).to.deep.equal({
                    folders: [{id: 'a', name: 'Work'}],
                    members: membership(['contact:1', ['a']]),
                });
                expect(encrypted.value.folders).to.deep.equal([{id: 'a', name: 'Work'}]);
                expect(storage.getItem(MIGRATED_KEY)).to.equal('1');
                expect(storage.getItem(LEGACY_FOLDERS_KEY)).to.be.undefined;
            });

            it('handles a fresh install with no plaintext', async function () {
                const storage = new FakeStorage();
                const encrypted = new FakeEncrypted();

                const result = await migrateAndHydrateChatFolders(storage, encrypted);

                expect(result).to.deep.equal({folders: [], members: {}});
                expect(storage.getItem(MIGRATED_KEY)).to.equal('1');
                expect(encrypted.writes).to.equal(1);
            });

            it('tolerates malformed legacy plaintext', async function () {
                const storage = new FakeStorage({
                    [LEGACY_FOLDERS_KEY]: '{not valid json',
                    [LEGACY_MEMBERS_KEY]: 'also broken',
                });
                const encrypted = new FakeEncrypted();

                const result = await migrateAndHydrateChatFolders(storage, encrypted);

                expect(result).to.deep.equal({folders: [], members: {}});
                expect(storage.getItem(MIGRATED_KEY)).to.equal('1');
            });
        });

        describe('connectChatFolderStores', function () {
            it('hydrates the stores without a spurious flush', async function () {
                const storage = new FakeStorage({
                    [LEGACY_FOLDERS_KEY]: JSON.stringify([{id: 'a', name: 'Work'}]),
                    [LEGACY_MEMBERS_KEY]: JSON.stringify(membership(['contact:1', ['a']])),
                });
                const encrypted = new FakeEncrypted();
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});

                const handle = await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: NOOP_LOGGER,
                });

                expect(handle.available).to.equal(true);
                expect(folders.get()).to.deep.equal([{id: 'a', name: 'Work'}]);
                expect(members.get()).to.deep.equal(membership(['contact:1', ['a']]));
                // Only the one-time migration write; hydration must not trigger an extra flush.
                expect(encrypted.writes).to.equal(1);
            });

            it('does not write on connect when already migrated', async function () {
                const storage = new FakeStorage({[MIGRATED_KEY]: '1'});
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: {},
                });
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});

                await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: NOOP_LOGGER,
                });

                expect(encrypted.writes).to.equal(0);
                expect(folders.get()).to.deep.equal([{id: 'a', name: 'Work'}]);
            });

            it('flushes folder mutations to the encrypted store', async function () {
                const storage = new FakeStorage({[MIGRATED_KEY]: '1'});
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: {},
                });
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});
                await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: NOOP_LOGGER,
                });

                folders.set([
                    {id: 'a', name: 'Work'},
                    {id: 'b', name: 'New'},
                ]);
                await tick();

                expect(encrypted.value.folders).to.deep.equal([
                    {id: 'a', name: 'Work'},
                    {id: 'b', name: 'New'},
                ]);
                expect(encrypted.writes).to.equal(1);
            });

            it('flushes membership mutations to the encrypted store', async function () {
                const storage = new FakeStorage({[MIGRATED_KEY]: '1'});
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: {},
                });
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});
                await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: NOOP_LOGGER,
                });

                members.set(membership(['contact:1', ['a']], ['group:2', ['a']]));
                await tick();

                expect(encrypted.value.members).to.deep.equal(
                    membership(['contact:1', ['a']], ['group:2', ['a']]),
                );
            });

            it('logs a flush failure and recovers on the next mutation', async function () {
                const storage = new FakeStorage({[MIGRATED_KEY]: '1'});
                const encrypted = new FakeEncrypted({folders: [], members: {}});
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});
                const errors: unknown[][] = [];
                await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: makeCapturingLogger(errors),
                });

                encrypted.failNextWrite = true;
                folders.set([{id: 'a', name: 'Work'}]);
                await tick();
                expect(errors.length).to.be.greaterThan(0);

                // The retry loop recovers: the next mutation persists.
                folders.set([
                    {id: 'a', name: 'Work'},
                    {id: 'b', name: 'B'},
                ]);
                await tick();
                expect(encrypted.value.folders).to.deep.equal([
                    {id: 'a', name: 'Work'},
                    {id: 'b', name: 'B'},
                ]);
            });
        });

        describe('durable write-behind persistence (FU-M02)', function () {
            async function connectMigrated(
                encrypted: FakeEncrypted,
                backoff?: ChatFolderFlushBackoff,
            ): Promise<{
                readonly handle: ChatFolderPersistence;
                readonly folders: WritableStore<readonly ChatFolder[]>;
                readonly members: WritableStore<ChatFolderMembers>;
            }> {
                const storage = new FakeStorage({[MIGRATED_KEY]: '1'});
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});
                const handle = await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: NOOP_LOGGER,
                    backoff,
                });
                return {handle, folders, members};
            }

            it('flush() lands the latest snapshot after a transient write failure', async function () {
                const encrypted = new FakeEncrypted({folders: [], members: {}});
                const {handle, folders} = await connectMigrated(encrypted);

                encrypted.failNextWrite = true;
                folders.set([{id: 'a', name: 'Work'}]);
                await handle.flush();

                expect(encrypted.value.folders).to.deep.equal([{id: 'a', name: 'Work'}]);
                expect(encrypted.writes).to.equal(1);
            });

            it('coalesces a burst of mutations into a single write of the latest snapshot', async function () {
                const encrypted = new FakeEncrypted({folders: [], members: {}});
                const {handle, folders} = await connectMigrated(encrypted);

                folders.set([{id: 'a', name: 'A'}]);
                folders.set([
                    {id: 'a', name: 'A'},
                    {id: 'b', name: 'B'},
                ]);
                folders.set([
                    {id: 'a', name: 'A'},
                    {id: 'b', name: 'B'},
                    {id: 'c', name: 'C'},
                ]);
                await handle.flush();

                expect(encrypted.value.folders.map((folder) => folder.id)).to.deep.equal([
                    'a',
                    'b',
                    'c',
                ]);
                expect(encrypted.writes).to.equal(1);
            });

            it('retries a failed write in the background without a further mutation', async function () {
                const encrypted = new FakeEncrypted({folders: [], members: {}});
                const {folders} = await connectMigrated(encrypted, {initialMs: 1, maxMs: 4});

                encrypted.failNextWrite = true;
                folders.set([{id: 'a', name: 'Work'}]);
                // No further mutation and no flush(): the background backoff loop must still persist.
                await delay(30);

                expect(encrypted.value.folders).to.deep.equal([{id: 'a', name: 'Work'}]);
                expect(encrypted.writes).to.equal(1);
            });

            it('flush() resolves immediately when nothing is pending', async function () {
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: {},
                });
                const {handle} = await connectMigrated(encrypted);

                await handle.flush();
                expect(encrypted.writes).to.equal(0);
            });

            it('flush(timeoutMs) returns within the timeout when writes keep failing', async function () {
                const encrypted = new FakeEncrypted({folders: [], members: {}});
                encrypted.failAllWrites = true;
                const {handle, folders} = await connectMigrated(encrypted, {
                    initialMs: 5,
                    maxMs: 10,
                });

                folders.set([{id: 'a', name: 'Work'}]);
                const start = Date.now();
                await handle.flush(30);
                const elapsed = Date.now() - start;

                // Bounded: teardown is not blocked by a permanently failing backend.
                expect(elapsed).to.be.lessThan(500);
                expect(encrypted.value.folders).to.deep.equal([]);

                // Let the background loop settle so it does not spin after the test.
                encrypted.failAllWrites = false;
                await handle.flush();
            });

            it('exposes persistence as unavailable when bootstrap fails', async function () {
                const storage = new FakeStorage({[MIGRATED_KEY]: '1'});
                const encrypted = new FakeEncrypted({
                    folders: [{id: 'a', name: 'Work'}],
                    members: {},
                });
                encrypted.failRead = true;
                const folders = new WritableStore<readonly ChatFolder[]>([]);
                const members = new WritableStore<ChatFolderMembers>({});

                const handle = await connectChatFolderStores({
                    folders,
                    members,
                    storage,
                    encrypted,
                    log: NOOP_LOGGER,
                });

                // Startup did not throw, but the UI can now suppress every apparent mutation.
                expect(handle.available).to.equal(false);
                expect(folders.get()).to.deep.equal([]);
                await handle.flush();
                expect(encrypted.writes).to.equal(0);
            });
        });
    });
}
