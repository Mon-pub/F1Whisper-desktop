CREATE TABLE messageReactionsTmp (
    uid INTEGER PRIMARY KEY,
    reactionAt INTEGER NOT NULL,
    --  0: Acknowledged, 1: Declined
    reaction INTEGER NOT NULL,
    -- We use the sender contact's identity instead of the uid to be able to show reactions of
    -- people that have left the group. The special string "me" is used to indicate that the user is
    -- the reaction sender; `NULL` is not used for this due to its behavior in unique constraints.
    senderIdentity TEXT NOT NULL,
    -- The message which the reaction belongs to
    messageUid INTEGER NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
    -- Exactly one reaction per message is allowed for each sender
    UNIQUE(senderIdentity, messageUid)
);

-- Insert all old-style reactions into the temporary table
INSERT INTO messageReactionsTmp SELECT * FROM messageReactions;

-- Delete all old style reactions
DROP TABLE messageReactions;

CREATE TABLE messageReactions (
    uid INTEGER PRIMARY KEY,
    reactionAt INTEGER NOT NULL,
    -- An emoji reaction
    reaction TEXT NOT NULL,
    -- We use the sender contact's identity instead of the uid to be able to show reactions of
    -- people that have left the group. The special string "me" is used to indicate that the user is
    -- the reaction sender; `NULL` is not used for this due to its behavior in unique constraints.
    senderIdentity TEXT NOT NULL,
    -- The message which the reaction belongs to
    messageUid INTEGER NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
    -- Exactly one reaction per sender per emoji per message uid
    UNIQUE(senderIdentity, reaction, messageUid)
);

-- Insert the old style reactions into the new table as emojis
INSERT INTO messageReactions (reactionAt, reaction, senderIdentity, messageUid)
    SELECT
        r.reactionAt,
        -- Important: Make sure the emojis used here are the fully-qualified variants.
        CASE WHEN r.reaction IS 0 THEN
            '👍'
        ELSE
            '👎'
        END,
        r.senderIdentity,
        r.messageUid
    FROM messageReactionsTmp as r;

-- Delete the temporary table
DROP TABLE messageReactionsTmp;
