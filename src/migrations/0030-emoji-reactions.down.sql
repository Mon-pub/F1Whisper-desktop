
-- Create a temporary table for new-style reactions
CREATE TABLE messageReactionsTmp (
    uid INTEGER PRIMARY KEY,
    reactionAt INTEGER NOT NULL,
    -- UTF-32 symbol for an emoji
    reaction TEXT NOT NULL,
    -- We use the sender contact's identity instead of the uid to be able to show reactions of
    -- people that have left the group. The special string "me" is used to indicate that the user is
    -- the reaction sender; `NULL` is not used for this due to its behavior in unique constraints.
    senderIdentity TEXT NOT NULL,
    -- The message which the reaction belongs to
    messageUid INTEGER NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
    UNIQUE(senderIdentity, reaction, messageUid)
);

-- Insert all new-style reaction into the temporary table
INSERT INTO messageReactionsTmp SELECT * FROM messageReactions;

-- Delete all non-thumbs reactions
DELETE FROM messageReactionsTmp WHERE reaction != '👍' AND reaction != '👎';

-- Remove all new-style reactions on outgoing non-group chat messages
DELETE FROM messageReactionsTmp WHERE uid IN
    (SELECT r.uid FROM messageReactionsTmp r
        INNER JOIN
            (SELECT m.uid FROM messages m
                INNER JOIN conversations c
                ON (m.conversationUid = c.uid)
            WHERE c.groupUid is NULL AND m.senderContactUid IS NULL) AS mJoin
        ON (mJoin.uid = r.messageUid)
    );

-- When a message has a thumbs up and a thumbs down, delete the older one of the two.
DELETE FROM messageReactionsTmp WHERE uid in
    (SELECT DISTINCT
        CASE WHEN r.reactionAt > r2.reactionAt THEN
            r2.uid
        ELSE
            r.uid
        END
    FROM messageReactionsTmp r
        INNER JOIN messageReactionsTmp r2
        ON (r.senderIdentity = r2.senderIdentity AND r.messageUid = r2.messageUid AND (r.reaction = '👍' AND r2.reaction = '👎' OR r2.reaction = '👍' AND r.reaction = '👎'))
  );

-- Drop the new-style reaction table
DROP TABLE messageReactions;

-- Create the old-style reaction table
CREATE TABLE messageReactions (
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

-- Map all thumbs up and thumbs down of the generic colour back to old style reactions
INSERT INTO messageReactions (reactionAt, reaction, senderIdentity, messageUid)
    SELECT
        r. reactionAt,
        CASE WHEN r.reaction IS '👍' THEN
            0
        ELSE
            1
        END,
        r.senderIdentity,
        r.messageUid
    FROM messageReactionsTmp as r;

-- Drop the temporary table
DROP TABLE messageReactionsTmp;
