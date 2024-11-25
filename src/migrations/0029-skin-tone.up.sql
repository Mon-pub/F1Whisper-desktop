-- Add a skin tone table
CREATE TABLE emojiSkinTones (
    uid INTEGER PRIMARY KEY,
    -- The base emoji (yellow-ish)
    baseEmoji TEXT NOT NULL UNIQUE,
    -- The emoji with the user's preferred skin tone (of the same group as the base emoji)
    preferredSkinToneEmoji TEXT NOT NULL
);
