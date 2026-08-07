import * as v from '@badrap/valita';

import * as proto from '~/common/internal-protobuf/settings';

/**
 * A desktop-local chat folder (F1Whisper fork). Purely a UI-side grouping of conversations, not
 * synced to any other device or reflected to the mediator.
 */
export interface ChatFolder {
    readonly id: string;
    readonly name: string;
}

/**
 * Per-conversation chat-folder membership, keyed by the receiver lookup key, each value the list of
 * folder ids the conversation is assigned to (a conversation may belong to several folders).
 */
export type ChatFolderMembers = Readonly<Record<string, readonly string[]>>;

/**
 * The persisted chat-folders settings: the ordered folder list plus the per-conversation membership
 * map.
 *
 * These are stored (encrypted) in the settings table under {@link FOLDERS_SETTINGS_CATEGORY}. They
 * are deliberately NOT part of the {@link Settings} union, because chat folders are a local-only
 * fork feature with no settings page; keeping them out of that union avoids leaking an empty entry
 * into the settings navigation and the sync/update machinery.
 */
export interface FoldersSettings {
    readonly folders: readonly ChatFolder[];
    readonly members: ChatFolderMembers;
}

/**
 * The settings-table category key under which the chat folders are stored.
 */
export const FOLDERS_SETTINGS_CATEGORY = 'folders';

/**
 * The default (empty) chat-folders settings, used when nothing has been persisted yet.
 */
export const DEFAULT_FOLDERS_SETTINGS: FoldersSettings = {folders: [], members: {}};

const FOLDER_SCHEMA = v.object({
    id: v.string(),
    name: v.string(),
});

const FOLDERS_SETTINGS_SCHEMA = v
    .object({
        folders: v.array(FOLDER_SCHEMA),
        members: v.record(v.array(v.string())),
    })
    .rest(v.unknown());

/**
 * Codec that (de)serializes {@link FoldersSettings} to/from the protobuf blob stored in the settings
 * table. Structured like the {@link SettingsCategoryCodec}s, but standalone because chat folders are
 * not part of the {@link Settings} union.
 */
export interface FoldersSettingsCodec {
    readonly encode: (settings: FoldersSettings) => Uint8Array;
    readonly decode: (encoded: Uint8Array) => FoldersSettings;
}

export const FOLDERS_SETTINGS_CODEC: FoldersSettingsCodec = {
    encode: (settings) =>
        proto.FoldersSettings.encode({
            folders: settings.folders.map((folder) => ({id: folder.id, name: folder.name})),
            members: Object.fromEntries(
                Object.entries(settings.members).map(([key, folderIds]) => [
                    key,
                    {folderIds: [...folderIds]},
                ]),
            ),
        }).finish(),
    decode: (encoded) => {
        const decoded = proto.FoldersSettings.decode(encoded);
        const parsed = FOLDERS_SETTINGS_SCHEMA.parse({
            folders: decoded.folders,
            members: Object.fromEntries(
                Object.entries(decoded.members).map(([key, list]) => [key, list.folderIds]),
            ),
        });
        return {folders: parsed.folders, members: parsed.members};
    },
} as const;
