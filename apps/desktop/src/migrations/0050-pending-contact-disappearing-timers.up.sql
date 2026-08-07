-- Durable intent for genuine local 1:1 disappearing-timer changes. Recovery reads only this table;
-- existing shared conversation values are deliberately not backfilled.
CREATE TABLE pendingContactDisappearingTimers (
    -- AUTOINCREMENT preserves the high-water mark after an acknowledged row is deleted, so a stale
    -- task can never match a later change through generation reuse.
    generation INTEGER PRIMARY KEY AUTOINCREMENT,
    contactUid INTEGER NOT NULL UNIQUE REFERENCES contacts(uid) ON DELETE CASCADE,
    -- Explicit OFF is stored as 0 and must remain distinct from an absent value.
    timerSeconds INTEGER NOT NULL,
    -- Stable wire identity for every retry of this generation.
    messageId BLOB NOT NULL,
    createdAt INTEGER NOT NULL
);
