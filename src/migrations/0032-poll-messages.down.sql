DROP TABLE messagePollData;
DROP TABLE polls;
DROP TABLE pollChoices;
DROP TABLE pollVotes;

DELETE FROM messages WHERE messageType = 'poll';

-- This table contains the data for the "in-chat message".
-- The actual data about the poll or vote is located in the "polls"
-- or "pollVotes" table.
CREATE TABLE messagePollData (
    uid INTEGER PRIMARY KEY,
    messageUid INTEGER UNIQUE NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
    -- 0: Poll created, 1: Vote cast, 2: Poll closed
    type INTEGER NOT NULL,
    pollUid INTEGER NOT NULL REFERENCES polls(uid) ON DELETE RESTRICT
);

-- This table contains all poll information. It is referenced from the
-- in-chat poll messages.
CREATE TABLE polls (
    uid INTEGER PRIMARY KEY,
    -- The poll ID (8 bytes) uniquely identifies the poll within a conversation
    pollId BLOB NOT NULL,
    -- The group or contact identity associated with this poll
    --
    -- Note: Not a foreign key, since a poll can survive a deleted conversation.
    conversationIdentity INTEGER NOT NULL,
    -- The poll creator
    pollCreatorUid INTEGER REFERENCES contacts(uid) ON DELETE RESTRICT,
    -- Timestamp of the "poll create" message
    createdAt INTEGER NOT NULL,
    -- The title/description of the poll (e.g. "Where shall we eat?")
    description TEXT NOT NULL,
    -- 0: Open, 1: Closed
    state INTEGER NOT NULL,
    -- 0: Single choice, 1: Multiple choice
    answerType INTEGER NOT NULL,
    -- 0: On close, 1: On every vote
    announceType INTEGER NOT NULL,
    -- 0: Text, 1: Date
    choicesType INTEGER NOT NULL DEFAULT 0,

    -- A poll ID must be unique within a conversation
    UNIQUE(pollId, conversationIdentity)
);

CREATE TABLE pollChoices (
    uid INTEGER PRIMARY KEY,
    pollUid INTEGER NOT NULL REFERENCES polls(uid) ON DELETE CASCADE,
    choiceId INTEGER NOT NULL,
    description TEXT NOT NULL,
    sortKey INTEGER NOT NULL,

    -- A choice ID must be unique within a poll
    UNIQUE(pollUid, choiceId)
);

CREATE TABLE pollVotes (
    uid INTEGER PRIMARY KEY,
    -- The contact that voted
    contactUid INTEGER NOT NULL REFERENCES contacts(uid) ON DELETE CASCADE,
    -- Note: We use the choiceUid here, instead of a pollUid + choiceId.
    --       This makes processing of the poll-vote message a bit more complex,
    --       but has the advantage that aggregating the poll votes is simpler.
    choiceUid INTEGER NOT NULL REFERENCES pollChoices(uid) ON DELETE CASCADE,
    selected BOOLEAN NOT NULL,

    UNIQUE(contactUid, choiceUid)
);