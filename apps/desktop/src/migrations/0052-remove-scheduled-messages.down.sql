CREATE TABLE scheduledMessages (
    uid INTEGER PRIMARY KEY,
    conversationUid INTEGER NOT NULL REFERENCES conversations(uid) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    fireAt INTEGER NOT NULL,
    text TEXT NOT NULL,
    quotedMessageId BLOB,
    messageId BLOB,
    state INTEGER NOT NULL DEFAULT 0,
    failedAt INTEGER,
    claimGeneration INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idxScheduledMessagesFireAt ON scheduledMessages (fireAt);
CREATE INDEX idxScheduledMessagesConversationUid ON scheduledMessages (conversationUid);
CREATE INDEX idxScheduledMessagesStateFireAt ON scheduledMessages (state, fireAt);
