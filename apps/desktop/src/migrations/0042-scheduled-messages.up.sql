-- F1Whisper fork: scheduled messages (desktop-local, Telegram-style send-later).
--
-- TEXT-only in this pass: file/image/video/audio scheduling would additionally need binary
-- blob-key serialization plus transcode-at-schedule-time, a materially larger and higher-risk lift
-- than the compose-bar text case this table is built for; see the plan Amendments for the scoped
-- decision. Content lives in the same encrypted SQLCipher DB as everything else (never plaintext).
--
-- A row is deleted the moment it fires (successfully turned into a real message) or is cancelled --
-- there is no "sent" state to track here, the real message row is the source of truth once it fires.
CREATE TABLE scheduledMessages (
    uid INTEGER PRIMARY KEY,
    -- The conversation to send into. Deleting the conversation cancels any pending scheduled sends
    -- to it (unlike polls, a scheduled message cannot meaningfully survive its conversation).
    conversationUid INTEGER NOT NULL REFERENCES conversations(uid) ON DELETE CASCADE,
    -- When this row was created (i.e. when the user scheduled the message).
    createdAt INTEGER NOT NULL,
    -- When the message is due to be sent.
    fireAt INTEGER NOT NULL,
    -- The message text.
    text TEXT NOT NULL,
    -- The optional quoted message id (F1Whisper fork "quote-any-type"; same encoding as
    -- messageTextData.quotedMessageId).
    quotedMessageId BLOB
);

-- Index for the periodic fire-sweep (find all rows with fireAt <= now).
CREATE INDEX idxScheduledMessagesFireAt ON scheduledMessages (fireAt);
-- Index for the per-conversation "N scheduled" chip / manage list.
CREATE INDEX idxScheduledMessagesConversationUid ON scheduledMessages (conversationUid);
