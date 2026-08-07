import {expect} from 'chai';

import translationEn from '~/translations/en/translation.json';

/**
 * Truthful-copy regression test for the Threema Safe backup/restore UI (P-H06, UX-02).
 *
 * Threema Safe on this fork is identity-key-only, permanently (product decision): a backup contains
 * only the identity + private key, never contacts, groups, distribution lists, profile info, or
 * settings, and restore seeds only the identity. The onboarding copy previously overclaimed a full
 * "ID and data" backup / "profile, contacts, and settings" restore. Originally, a failed backup also
 * falsely promised a "retry from Settings" that did not exist. FU-M12 (#52) added a real, discoverable
 * Safe backup/retry surface in Settings, so the honest thing now is exactly to point there -- the
 * failed-backup message was updated accordingly and the assertion below updated to match. This test
 * guards the corrected copy against regressing back to the old overclaiming pattern.
 */

const OVERCLAIM_PATTERNS: readonly RegExp[] = [
    // The backup/restore intros must not claim more than the identity is preserved/restored.
    /back up your \{shortAppName\} id and data/iu,
    /restore your profile, contacts, and settings/iu,
    // The failed-backup message must not promise a Settings retry that does not exist.
    /retry from settings/iu,
];

const EM_DASH = '—';

/**
 * Every en string this builder-ui session added or changed (Safe copy, chat folders, media spoiler
 * toggle, disappearing-message summary row). House style bans em dashes; this is a cheap regression
 * lock so a future edit can't silently reintroduce one in a string this session is responsible for.
 * Deliberately an explicit list, NOT a catalog-wide scan: pre-existing strings elsewhere (e.g.
 * `dialog--linking-create-success.prose--your-id-hint`) may already contain an em dash that predates
 * this session and is not this test's concern.
 */
const SESSION_TOUCHED_STRINGS: readonly (readonly [label: string, value: string])[] = [
    [
        'dialog--linking-safe-backup.prose--intro',
        translationEn['dialog--linking-safe-backup']['prose--intro'],
    ],
    [
        'dialog--linking-safe-backup.prose--skip-warning',
        translationEn['dialog--linking-safe-backup']['prose--skip-warning'],
    ],
    [
        'dialog--linking-safe-restore.prose--intro',
        translationEn['dialog--linking-safe-restore']['prose--intro'],
    ],
    [
        'dialog--linking-create-success.prose--safe-backup-failed',
        translationEn['dialog--linking-create-success']['prose--safe-backup-failed'],
    ],
    [
        'dialog--linking-create-success.label--restore-summary-title',
        translationEn['dialog--linking-create-success']['label--restore-summary-title'],
    ],
    [
        'dialog--linking-create-success.label--restore-summary-imported',
        translationEn['dialog--linking-create-success']['label--restore-summary-imported'],
    ],
    [
        'dialog--linking-create-success.label--restore-summary-unavailable',
        translationEn['dialog--linking-create-success']['label--restore-summary-unavailable'],
    ],
    ['chat-folders.prose--empty-folder', translationEn['chat-folders']['prose--empty-folder']],
    ['chat-folders.action--manage-folders', translationEn['chat-folders']['action--manage-folders']],
    ['chat-folders.label--all-chats', translationEn['chat-folders']['label--all-chats']],
    [
        'dialog--manage-folders.prose--no-conversations',
        translationEn['dialog--manage-folders']['prose--no-conversations'],
    ],
    ['dialog--manage-folders.label--title', translationEn['dialog--manage-folders']['label--title']],
    [
        'dialog--manage-folders.label--new-folder-name',
        translationEn['dialog--manage-folders']['label--new-folder-name'],
    ],
    [
        'dialog--manage-folders.prose--no-folders',
        translationEn['dialog--manage-folders']['prose--no-folders'],
    ],
    [
        'dialog--manage-folders.action--assign-conversations',
        translationEn['dialog--manage-folders']['action--assign-conversations'],
    ],
    [
        'dialog--compose-media-message.label--spoiler-option',
        translationEn['dialog--compose-media-message']['label--spoiler-option'],
    ],
    [
        'dialog--message-details.label--disappears-at-date',
        translationEn['dialog--message-details']['label--disappears-at-date'],
    ],
];

export function run(): void {
    describe('Threema Safe honest copy (P-H06, UX-02)', function () {
        const safeBackup = translationEn['dialog--linking-safe-backup'];
        const safeRestore = translationEn['dialog--linking-safe-restore'];
        const success = translationEn['dialog--linking-create-success'];

        it('does not contain any of the known overclaiming phrases anywhere in the catalog', function () {
            const haystack = JSON.stringify(translationEn);
            for (const pattern of OVERCLAIM_PATTERNS) {
                expect(
                    pattern.test(haystack),
                    `the translation catalog must not match ${pattern} (overclaiming Safe copy)`,
                ).to.equal(false);
            }
        });

        it('backup intro is identity-only and warns before skipping', function () {
            expect(safeBackup['prose--intro']).to.be.a('string').with.length.greaterThan(0);
            expect(safeBackup['prose--intro']).to.not.match(/and data/iu);
            expect(safeBackup['prose--skip-warning'], 'skip-warning key must exist')
                .to.be.a('string')
                .with.length.greaterThan(0);
            expect(safeBackup['prose--skip-warning']).to.match(/cannot be recovered/iu);
        });

        it('restore intro is identity-only', function () {
            expect(safeRestore['prose--intro']).to.be.a('string').with.length.greaterThan(0);
            expect(safeRestore['prose--intro']).to.not.match(/profile, contacts/iu);
            expect(safeRestore['prose--intro']).to.match(/not restored/iu);
        });

        it('failed-backup message honestly points to the real Settings retry surface (FU-M12/#52)', function () {
            expect(success['prose--safe-backup-failed']).to.be.a('string').with.length.greaterThan(0);
            expect(success['prose--safe-backup-failed']).to.match(/cannot be recovered/iu);
            // FU-M12 added a real Safe backup/retry entry in Settings, so pointing there is now
            // honest -- the opposite of the pre-#52 assertion, which guarded against a Settings
            // mention because no such surface existed yet.
            expect(success['prose--safe-backup-failed']).to.match(/settings/iu);
        });

        it('post-restore summary lists imported vs unavailable data', function () {
            expect(success['label--restore-summary-title']).to.be.a('string').with.length.greaterThan(
                0,
            );
            expect(success['label--restore-summary-imported'])
                .to.be.a('string')
                .with.length.greaterThan(0);
            expect(success['label--restore-summary-imported']).to.match(/id/iu);
            expect(success['label--restore-summary-unavailable'])
                .to.be.a('string')
                .with.length.greaterThan(0);
            // The "unavailable" line must actually name what is NOT restored, otherwise it is not a
            // meaningful summary.
            expect(success['label--restore-summary-unavailable']).to.match(/contacts/iu);
            expect(success['label--restore-summary-unavailable']).to.match(/settings/iu);
        });
    });

    describe('session house style: no em dashes', function () {
        it('none of this session\'s added/changed strings contain an em dash', function () {
            for (const [label, value] of SESSION_TOUCHED_STRINGS) {
                expect(
                    value.includes(EM_DASH),
                    `${label} must not contain an em dash: ${JSON.stringify(value)}`,
                ).to.equal(false);
            }
        });
    });
}

run();
