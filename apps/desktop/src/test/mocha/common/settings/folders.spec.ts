import {expect} from 'chai';

import {NOOP_LOGGER} from '~/common/logging';
import {
    DEFAULT_FOLDERS_SETTINGS,
    FOLDERS_SETTINGS_CODEC,
    type FoldersSettings,
} from '~/common/settings/folders';
import {initSqliteBackend} from '~/test/mocha/common/backend-mocks';

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
 * F1Whisper fork (U-M04): tests for the encrypted chat-folders settings.
 *
 * Chat folders (name + per-conversation membership) were moved out of plaintext local storage into
 * the encrypted settings store. This covers the protobuf codec round-trip and the dedicated db
 * accessors (`getFoldersSettings`/`setFoldersSettings`) that persist them into the encrypted
 * settings table without being part of the typed {@link Settings} category union.
 */
export function run(): void {
    describe('settings/folders', function () {
        describe('FOLDERS_SETTINGS_CODEC', function () {
            it('round-trips folders and per-conversation membership', function () {
                const value: FoldersSettings = {
                    folders: [
                        {id: 'a', name: 'Work'},
                        {id: 'b', name: 'Family'},
                    ],
                    members: membership(['contact:1', ['a']], ['group:2', ['a', 'b']]),
                };
                const decoded = FOLDERS_SETTINGS_CODEC.decode(
                    FOLDERS_SETTINGS_CODEC.encode(value),
                );
                expect(decoded).to.deep.equal(value);
            });

            it('round-trips the empty default', function () {
                const decoded = FOLDERS_SETTINGS_CODEC.decode(
                    FOLDERS_SETTINGS_CODEC.encode(DEFAULT_FOLDERS_SETTINGS),
                );
                expect(decoded).to.deep.equal({folders: [], members: {}});
            });

            it('preserves folder order (order is significant)', function () {
                const value: FoldersSettings = {
                    folders: [
                        {id: '3', name: 'C'},
                        {id: '1', name: 'A'},
                        {id: '2', name: 'B'},
                    ],
                    members: {},
                };
                const decoded = FOLDERS_SETTINGS_CODEC.decode(
                    FOLDERS_SETTINGS_CODEC.encode(value),
                );
                expect(decoded.folders.map((folder) => folder.id)).to.deep.equal(['3', '1', '2']);
            });

            it('preserves non-ASCII folder names', function () {
                const value: FoldersSettings = {
                    folders: [{id: 'x', name: 'Arbeit \u{1f4c1} العمل'}],
                    members: {},
                };
                const decoded = FOLDERS_SETTINGS_CODEC.decode(
                    FOLDERS_SETTINGS_CODEC.encode(value),
                );
                expect(decoded.folders[0]?.name).to.equal(value.folders[0]?.name);
            });
        });

        describe('db getFoldersSettings/setFoldersSettings', function () {
            it('returns undefined before anything is stored', function () {
                const db = initSqliteBackend(NOOP_LOGGER);
                expect(db.getFoldersSettings()).to.be.undefined;
            });

            it('stores and retrieves folders across a re-read', function () {
                const db = initSqliteBackend(NOOP_LOGGER);
                const value: FoldersSettings = {
                    folders: [{id: 'x', name: 'Pinned'}],
                    members: membership(['contact:7', ['x']]),
                };
                db.setFoldersSettings(value);
                expect(db.getFoldersSettings()).to.deep.equal(value);
            });

            it('overwrites on a subsequent set', function () {
                const db = initSqliteBackend(NOOP_LOGGER);
                db.setFoldersSettings({folders: [{id: 'x', name: 'One'}], members: {}});
                db.setFoldersSettings({
                    folders: [{id: 'y', name: 'Two'}],
                    members: membership(['group:3', ['y']]),
                });
                expect(db.getFoldersSettings()).to.deep.equal({
                    folders: [{id: 'y', name: 'Two'}],
                    members: membership(['group:3', ['y']]),
                });
            });

            it('does not collide with the typed settings categories', function () {
                const db = initSqliteBackend(NOOP_LOGGER);
                // Folders live under their own category key; storing them must not surface under any
                // typed {@link Settings} category, and vice versa.
                db.setFoldersSettings({folders: [{id: 'x', name: 'X'}], members: {}});
                expect(db.getSettings('chat')).to.be.undefined;
                expect(db.getSettings('media')).to.be.undefined;
                expect(db.getFoldersSettings()).to.deep.equal({
                    folders: [{id: 'x', name: 'X'}],
                    members: {},
                });
            });
        });
    });
}
