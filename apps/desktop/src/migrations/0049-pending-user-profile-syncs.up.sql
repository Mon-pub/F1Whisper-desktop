-- F4-H03: singleton durable intent for reflecting a genuine local profile-settings change to the
-- user's other devices. Application writes replace the sole row with delete+insert in one
-- transaction. AUTOINCREMENT retains the high-water mark after deletion, so stale work can never
-- clear a later intent through generation reuse.
CREATE TABLE IF NOT EXISTS pendingUserProfileSyncs (
    generation INTEGER PRIMARY KEY AUTOINCREMENT,
    createdAt INTEGER NOT NULL
);

-- Version-48 code cannot maintain this intent. Ensure every application of 0049 has a reconciliation
-- row so changes made while downgraded are re-planned from current settings after re-upgrade.
INSERT INTO pendingUserProfileSyncs (createdAt)
SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM pendingUserProfileSyncs);

-- F4-M01: type 0 is LAST_USER_PROFILE_DISTRIBUTION_STATE. Older builds could commit this ACK cache
-- before a CSP control was actually acknowledged, so neither a cached SET nor DELETE can be trusted
-- during recovery. This transactional migration runs once for existing version-48 profiles and for
-- profiles upgrading through 48; rows created after version 49 is recorded remain valid.
DELETE FROM persistentProtocolState WHERE type = 0;
