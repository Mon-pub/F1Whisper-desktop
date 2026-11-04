// Local storage keys
//
// Note: The local storage keys need to be in sync with the critical JS in
//       index.html

import type {u53} from '@threema/ts-utils/integer/u53';

import {ensureLocale, isLocale, type Locale} from '~/app/ui/i18n';
import type {DbReceiverLookup} from '~/common/db';
import type {BackendController} from '~/common/dom/backend/controller';
import {
    type DebugPanelState,
    ensureDebugPanelHeight,
    ensureDebugPanelState,
} from '~/common/dom/ui/debug';
import {applyTheme, ensureTheme, type Theme} from '~/common/dom/ui/theme';
import type {Logger} from '~/common/logging';
import type {ChatFolder, ChatFolderMembers, FoldersSettings} from '~/common/settings/folders';
import {type IQueryableStore, type IWritableStore, WritableStore} from '~/common/utils/store';

// Re-export the chat-folder types from their canonical (encrypted-settings) home, so existing
// imports of these types from this module keep resolving unchanged.
export type {ChatFolder, ChatFolderMembers} from '~/common/settings/folders';

const KEYS = {
    theme: 'theme',
    locale: 'locale',
    debugPanelState: 'debug-panel-state',
    debugPanelHeight: 'debug-panel-height',
    chatBackground: 'chat-background',
    chatBackgroundOverrides: 'chat-background-overrides',
} as const;

/**
 * Legacy plaintext local-storage keys that used to hold the chat folders (F1Whisper fork). These
 * are migrated once into the encrypted settings store and then purged; see
 * {@link migrateAndHydrateChatFolders}.
 */
const LEGACY_CHAT_FOLDERS_KEY = 'chat-folders';
const LEGACY_CHAT_FOLDER_MEMBERS_KEY = 'chat-folder-members';

/**
 * Marker recording that the one-time plaintext -> encrypted chat-folders migration has completed.
 */
const CHAT_FOLDERS_MIGRATED_KEY = 'chat-folders-migrated';

/**
 * The global default chat-background id (a {@link CHAT_BACKGROUNDS} id, or the `none`/`random`
 * sentinels). A per-conversation override map keyed by the conversation's uid string.
 */
export type ChatBackgroundOverrides = Readonly<Record<string, string>>;

/**
 * Parse the per-conversation chat-background override map from local storage. Tolerant of malformed
 * data (returns an empty map), since this is a non-critical UI preference.
 */
function parseChatBackgroundOverrides(raw: string | undefined): ChatBackgroundOverrides {
    if (raw === undefined || raw === '') {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                result[key] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Build the stable string key used to look up a receiver's chat-folder membership.
 */
export function receiverLookupKey(lookup: DbReceiverLookup): string {
    return `${lookup.type}:${lookup.uid}`;
}

/**
 * Parse the list of chat folders from (legacy) local storage. Tolerant of malformed data (returns an
 * empty list), since this is a non-critical UI preference.
 */
function parseChatFolders(raw: string | undefined): readonly ChatFolder[] {
    if (raw === undefined || raw === '') {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        const result: ChatFolder[] = [];
        for (const entry of parsed) {
            if (
                typeof entry === 'object' &&
                entry !== null &&
                typeof (entry as {id?: unknown}).id === 'string' &&
                typeof (entry as {name?: unknown}).name === 'string'
            ) {
                result.push({id: (entry as ChatFolder).id, name: (entry as ChatFolder).name});
            }
        }
        return result;
    } catch {
        return [];
    }
}

/**
 * Parse the per-conversation chat-folder membership map from (legacy) local storage. Tolerant of
 * malformed data (returns an empty map), since this is a non-critical UI preference.
 */
function parseChatFolderMembers(raw: string | undefined): ChatFolderMembers {
    if (raw === undefined || raw === '') {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }
        const result: Record<string, readonly string[]> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
                result[key] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Minimal subset of the Web Storage API used by the one-time chat-folders migration, so the logic
 * can be unit-tested without a real `localStorage`.
 */
export interface WebStorageLike {
    readonly getItem: (key: string) => string | undefined;
    readonly setItem: (key: string, value: string) => void;
    readonly removeItem: (key: string) => void;
}

/**
 * Read/write bridge to the encrypted chat-folders settings in the backend. `read` returns the
 * currently persisted value; `write` persists a new value, resolving once the backend has accepted
 * it.
 */
export interface EncryptedChatFolderStorage {
    readonly read: () => FoldersSettings;
    readonly write: (settings: FoldersSettings) => Promise<void>;
}

/**
 * Perform the one-time migration of legacy plaintext chat folders into the encrypted backend store,
 * then return the value the renderer stores should be hydrated with.
 *
 * Idempotent and crash-safe:
 * - The encrypted copy is written BEFORE the plaintext keys are removed, so an interrupted run
 *   leaves the plaintext in place and retries on the next launch.
 * - A completion marker guards against re-importing stale plaintext once the encrypted store is
 *   authoritative (e.g. if `removeItem` failed after a successful migration).
 * - If the encrypted store already holds data but the marker is missing, the encrypted data wins;
 *   stale plaintext is never allowed to clobber it.
 */
export async function migrateAndHydrateChatFolders(
    storage: WebStorageLike,
    encrypted: EncryptedChatFolderStorage,
): Promise<FoldersSettings> {
    if (storage.getItem(CHAT_FOLDERS_MIGRATED_KEY) === '1') {
        // Migration already completed; the encrypted store is authoritative. Best-effort purge in
        // case a prior `removeItem` did not complete.
        storage.removeItem(LEGACY_CHAT_FOLDERS_KEY);
        storage.removeItem(LEGACY_CHAT_FOLDER_MEMBERS_KEY);
        return encrypted.read();
    }

    const backendValue = encrypted.read();
    const backendHasData =
        backendValue.folders.length > 0 || Object.keys(backendValue.members).length > 0;

    // If the encrypted store already holds folders (marker lost mid-migration), it wins. Otherwise
    // adopt whatever legacy plaintext exists (possibly empty on a fresh install).
    const initial: FoldersSettings = backendHasData
        ? backendValue
        : {
              folders: parseChatFolders(storage.getItem(LEGACY_CHAT_FOLDERS_KEY)),
              members: parseChatFolderMembers(storage.getItem(LEGACY_CHAT_FOLDER_MEMBERS_KEY)),
          };

    // Persist to the encrypted store first; only then mark complete and drop the plaintext.
    await encrypted.write(initial);
    storage.setItem(CHAT_FOLDERS_MIGRATED_KEY, '1');
    storage.removeItem(LEGACY_CHAT_FOLDERS_KEY);
    storage.removeItem(LEGACY_CHAT_FOLDER_MEMBERS_KEY);
    return initial;
}

/**
 * Handle over an active (or disabled) chat-folder persistence layer.
 */
export interface ChatFolderPersistence {
    /** Whether folder snapshots can be loaded and durably persisted for this session. */
    readonly available: boolean;
    /**
     * Persist the latest pending chat-folder snapshot and resolve once it has landed, or once the
     * optional timeout elapses. Wakes any pending retry backoff so the newest snapshot is written
     * promptly. Safe to call when nothing is pending (resolves immediately) and when persistence is
     * disabled (no-op). Registered with the teardown coordinator so a quit or profile switch persists
     * the latest folder mutation.
     */
    readonly flush: (timeoutMs?: u53) => Promise<void>;
}

/** Backoff bounds for the folder write-retry loop. */
export interface ChatFolderFlushBackoff {
    readonly initialMs: u53;
    readonly maxMs: u53;
}

const DEFAULT_CHAT_FOLDER_FLUSH_BACKOFF: ChatFolderFlushBackoff = {
    initialMs: 500,
    maxMs: 30_000,
};

/**
 * Upper bound on how long a teardown folder flush may take. Folder writes are tiny and local, so the
 * teardown coordinator's budget is reserved mostly for the durable outbox; capping here keeps the
 * total renderer flush time under the coordinator's hard cap even when the outbox flush uses most of
 * the budget.
 */
const FOLDER_FLUSH_TEARDOWN_MAX_MS = 1_000;

/**
 * A disabled persistence handle: folders work in-memory for the session but are not persisted. Used
 * when the encrypted folder store cannot be reached at startup, so folder failures degrade the
 * feature instead of blocking messenger startup.
 */
const DISABLED_CHAT_FOLDER_PERSISTENCE: ChatFolderPersistence = {
    available: false,
    flush: async () => {
        await Promise.resolve();
    },
};

/**
 * Migrate legacy plaintext folders, hydrate the two chat-folder stores from the encrypted store, and
 * install a durable write-behind persistence layer for subsequent mutations.
 *
 * Persistence tracks a single dirty latest snapshot (mutations coalesce) and writes it with a
 * wake-able exponential backoff, so a failed write is retried rather than logged and forgotten. The
 * returned {@link ChatFolderPersistence.flush} drains the latest snapshot on demand (used by the
 * teardown coordinator on quit + profile switch).
 *
 * If the initial migration/hydration fails (e.g. the encrypted store is unreachable), persistence is
 * DISABLED for the session: the stores stay usable in-memory, the legacy plaintext is left in place
 * for a retry on the next launch, and a disabled (no-op) handle is returned rather than throwing,
 * so a transient folder failure cannot block messenger startup.
 *
 * Extracted from {@link LocalStorageController.connectFolderStorage} so the behaviour can be
 * unit-tested with an injected storage and encrypted-store backend.
 */
export async function connectChatFolderStores(params: {
    readonly folders: IWritableStore<readonly ChatFolder[]>;
    readonly members: IWritableStore<ChatFolderMembers>;
    readonly storage: WebStorageLike;
    readonly encrypted: EncryptedChatFolderStorage;
    readonly log: Logger;
    readonly backoff?: ChatFolderFlushBackoff;
}): Promise<ChatFolderPersistence> {
    const {folders, members, storage, encrypted, log} = params;
    const backoff = params.backoff ?? DEFAULT_CHAT_FOLDER_FLUSH_BACKOFF;

    // One-time migration of legacy plaintext folders into the encrypted store, returning the value to
    // hydrate the renderer stores with. A bootstrap failure degrades to folders-disabled rather than
    // blocking startup; the legacy plaintext is left in place (migration retries next launch).
    let initial: FoldersSettings;
    try {
        initial = await migrateAndHydrateChatFolders(storage, encrypted);
    } catch (error) {
        log.error(
            'Chat folder persistence failed to initialize; folders disabled for this session',
            error,
        );
        return DISABLED_CHAT_FOLDER_PERSISTENCE;
    }

    // Single dirty-latest-snapshot writer. Only the newest un-persisted snapshot is ever written
    // (mutations coalesce); a failed write is retried with a wake-able exponential backoff.
    let pending: FoldersSettings | undefined;
    let writerActive = false;
    let persistenceEnabled = false;
    let wakeBackoff: (() => void) | undefined;
    const cleanWaiters: (() => void)[] = [];

    function resolveCleanWaiters(): void {
        for (const resolve of cleanWaiters.splice(0)) {
            resolve();
        }
    }

    // Captures the wake resolver synchronously, so it cannot be an async function.
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    function backoffDelay(delayMs: u53): Promise<void> {
        return new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                wakeBackoff = undefined;
                resolve();
            }, delayMs);
            wakeBackoff = () => {
                clearTimeout(timer);
                wakeBackoff = undefined;
                resolve();
            };
        });
    }

    async function runWriter(): Promise<void> {
        // Defer the first read by a microtask so a burst of synchronous mutations coalesces into a
        // single write of the latest snapshot.
        await Promise.resolve();
        let delayMs = backoff.initialMs;
        while (pending !== undefined) {
            const snapshot = pending;
            try {
                await encrypted.write(snapshot);
                // Only mark clean if no newer mutation arrived while writing.
                if (pending === snapshot) {
                    pending = undefined;
                }
                delayMs = backoff.initialMs;
            } catch (error) {
                log.error('Failed to persist chat folders to encrypted storage; retrying', error);
                await backoffDelay(delayMs);
                delayMs = Math.min(delayMs * 2, backoff.maxMs);
            }
        }
        writerActive = false;
        resolveCleanWaiters();
    }

    function markDirty(): void {
        if (!persistenceEnabled) {
            return;
        }
        pending = {folders: folders.get(), members: members.get()};
        if (writerActive) {
            // A write is backing off; wake it to retry with the newest snapshot immediately.
            wakeBackoff?.();
        } else {
            writerActive = true;
            // The loop handles its own write errors; this catch only guards an unexpected throw.
            runWriter().catch((error: unknown) => {
                log.error('Chat folder write loop failed unexpectedly', error);
            });
        }
    }

    // Hydrate the stores. The subscriptions below fire synchronously with the hydrated value; keep
    // persistence disabled across that initial emission so we do not write it straight back.
    folders.set(initial.folders);
    members.set(initial.members);
    folders.subscribe(markDirty);
    members.subscribe(markDirty);
    persistenceEnabled = true;

    async function flush(timeoutMs?: u53): Promise<void> {
        if (!writerActive && pending === undefined) {
            return;
        }
        // Wake any pending backoff so the latest snapshot is retried immediately.
        wakeBackoff?.();
        const clean = new Promise<void>((resolve) => {
            cleanWaiters.push(resolve);
        });
        if (timeoutMs === undefined) {
            await clean;
            return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const bounded = new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
        });
        await Promise.race([clean, bounded]);
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }

    return {available: true, flush};
}

/**
 * Local storage controller.
 *
 * IMPORTANT: This storage is not encrypted! It should only be used for values that need to be
 * available from the very start of the application, before the database can be decrypted. (This
 * includes the theme for example.) Only non-sensitive UI preferences (theme, locale, debug panel
 * state, chat backgrounds) live here. Chat folders were moved to the encrypted settings store (see
 * {@link connectFolderStorage}); nothing sensitive should be added here.
 */
export class LocalStorageController {
    public readonly debugPanelState: IWritableStore<DebugPanelState>;
    public readonly debugPanelHeight: IWritableStore<string>;
    public readonly theme: IWritableStore<Theme>;
    public readonly locale: IWritableStore<Locale>;
    /** Global default chat-background id (catalog id, or `none` / `random`). */
    public readonly chatBackground: IWritableStore<string>;
    /** Per-conversation chat-background overrides, keyed by conversation uid string. */
    public readonly chatBackgroundOverrides: IWritableStore<ChatBackgroundOverrides>;
    /**
     * Desktop-local chat folders (F1Whisper fork).
     *
     * Backed by the encrypted settings store, not local storage. The stores start empty and are
     * hydrated in {@link connectFolderStorage} once the backend is available; from then on
     * mutations are flushed back to the encrypted store (write-behind).
     */
    public readonly chatFolders: IWritableStore<readonly ChatFolder[]>;
    /** Per-conversation chat-folder membership, keyed by {@link receiverLookupKey}. */
    public readonly chatFolderMembers: IWritableStore<ChatFolderMembers>;
    /** Whether chat-folder mutations can be persisted in this session. */
    public readonly chatFolderPersistenceAvailable: IQueryableStore<boolean>;

    private readonly _chatFolderPersistenceAvailable: IWritableStore<boolean>;
    /** Active chat-folder persistence layer, set once {@link connectFolderStorage} has run. */
    private _folderPersistence: ChatFolderPersistence | undefined;

    public constructor(containers: HTMLElement[], systemLocale: string) {
        // Note: We can ignore the unsubscribers because we will also maintain a reference to the
        // store for the lifetime of this instance. Moreover, this instance should be used like a
        // singleton.
        //
        // TODO(DESK-1081): Remove the smelly singleton class, move it to `globals` and make it an
        // object.

        // Debug panel
        this.debugPanelState = new WritableStore(
            ensureDebugPanelState(localStorage.getItem(KEYS.debugPanelState) ?? ''),
        );
        this.debugPanelState.subscribe((state) =>
            localStorage.setItem(KEYS.debugPanelState, state),
        );
        this.debugPanelHeight = new WritableStore(
            ensureDebugPanelHeight(localStorage.getItem(KEYS.debugPanelHeight) ?? ''),
        );
        this.debugPanelHeight.subscribe((height) =>
            localStorage.setItem(KEYS.debugPanelHeight, height),
        );

        // Theme
        this.theme = new WritableStore(ensureTheme(localStorage.getItem(KEYS.theme) ?? ''));
        this.theme.subscribe((theme) => {
            localStorage.setItem(KEYS.theme, theme);
            for (const container of containers) {
                applyTheme(theme, container);
            }
        });

        // Locale
        this.locale = new WritableStore(
            ensureLocale(localStorage.getItem(KEYS.locale) ?? systemLocale),
        );
        this.locale.subscribe((locale) => {
            if (isLocale(locale)) {
                localStorage.setItem(KEYS.locale, locale);
            }
        });

        // Chat background (global default + per-conversation overrides). Pure UI preference, so it
        // lives here next to theme/locale rather than in the encrypted settings model.
        this.chatBackground = new WritableStore(
            localStorage.getItem(KEYS.chatBackground) ?? 'none',
        );
        this.chatBackground.subscribe((background) => {
            localStorage.setItem(KEYS.chatBackground, background);
        });
        this.chatBackgroundOverrides = new WritableStore(
            parseChatBackgroundOverrides(
                localStorage.getItem(KEYS.chatBackgroundOverrides) ?? undefined,
            ),
        );
        this.chatBackgroundOverrides.subscribe((overrides) => {
            localStorage.setItem(KEYS.chatBackgroundOverrides, JSON.stringify(overrides));
        });

        // Chat folders (F1Whisper fork). Persisted in the encrypted settings store, not here. Start
        // empty; hydrated and wired up for write-behind persistence in `connectFolderStorage()`.
        this.chatFolders = new WritableStore<readonly ChatFolder[]>([]);
        this.chatFolderMembers = new WritableStore<ChatFolderMembers>({});
        this._chatFolderPersistenceAvailable = new WritableStore(false);
        this.chatFolderPersistenceAvailable = this._chatFolderPersistenceAvailable;
    }

    /**
     * Connect the chat-folder stores to the encrypted settings store in the backend.
     *
     * This hydrates {@link chatFolders} / {@link chatFolderMembers} from the encrypted store,
     * migrates any legacy plaintext folders (once, idempotently), and installs a durable write-behind
     * persistence layer for subsequent mutations. Must be called once, after the backend is
     * available.
     *
     * Never throws: if the encrypted folder store cannot be reached, folder persistence is disabled
     * for the session (folders remain usable in-memory) rather than blocking messenger startup.
     */
    public async connectFolderStorage(
        backend: Pick<BackendController, 'model'>,
        log: Logger,
    ): Promise<void> {
        try {
            const remote = await backend.model.user.foldersSettings;
            const encrypted: EncryptedChatFolderStorage = {
                read: () => remote.get().view,
                write: async (settings) => {
                    await remote.get().controller.update(settings);
                },
            };
            const storage: WebStorageLike = {
                getItem: (key) => localStorage.getItem(key) ?? undefined,
                setItem: (key, value) => localStorage.setItem(key, value),
                removeItem: (key) => localStorage.removeItem(key),
            };
            this._folderPersistence = await connectChatFolderStores({
                folders: this.chatFolders,
                members: this.chatFolderMembers,
                storage,
                encrypted,
                log,
            });
            this._chatFolderPersistenceAvailable.set(this._folderPersistence.available);
        } catch (error) {
            log.error(
                'Chat folder persistence unavailable; folders disabled for this session',
                error,
            );
            this._folderPersistence = DISABLED_CHAT_FOLDER_PERSISTENCE;
            this._chatFolderPersistenceAvailable.set(false);
        }
    }

    /**
     * Persist the latest pending chat-folder mutation, resolving once it has landed or the optional
     * timeout elapses. Registered with the teardown coordinator so a quit or profile switch does not
     * drop the newest folder change. A no-op before {@link connectFolderStorage} has run or when
     * folder persistence is disabled.
     */
    public async flushFolders(timeoutMs?: u53): Promise<void> {
        const boundedMs =
            timeoutMs === undefined
                ? FOLDER_FLUSH_TEARDOWN_MAX_MS
                : Math.min(timeoutMs, FOLDER_FLUSH_TEARDOWN_MAX_MS);
        await this._folderPersistence?.flush(boundedMs);
    }
}
