CREATE TABLE emojiData (
    uid INTEGER PRIMARY KEY,
    -- The referred emoji
    emoji TEXT NOT NULL UNIQUE,
    -- The last time this emoji was used
    lastUsedAt INTEGER NOT NULL DEFAULT 0,
    -- The number of times this emoji was used
    nUsed INTEGER NOT NULL DEFAULT 0
);
