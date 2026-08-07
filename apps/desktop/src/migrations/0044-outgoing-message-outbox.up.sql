-- F1Whisper fork (P-H12): durable outgoing-message outbox.
--
-- An outgoing conversation message is persisted (its message row) and then handed to an in-memory,
-- fire-and-forget send task. If the app quit, crashed, or switched profile between persisting the
-- message and the server ack, that in-memory task was lost with no way to reconstruct it, stranding
-- the message forever ("Outgoing tasks are not durable across quit/restart paths").
--
-- This table is the durable record that a message still needs to be transmitted. A row is enrolled
-- BEFORE the in-memory send task is scheduled and cleared only once transmission is confirmed (the
-- message's sentAt is stamped after the CSP ack). On startup, any surviving row whose message has
-- not yet been sent is turned back into a send task (see recoverOutgoingMessageOutbox). Keyed by the
-- 8-byte message id so recovery is idempotent (the receiver dedupes by message id, so a re-sent
-- message is harmless).
CREATE TABLE outgoingMessageOutbox (
    -- The outgoing message's 8-byte id, stored as a BLOB (same encoding as messages.messageId). One
    -- row per pending outgoing message; the durable key recovery reconstructs the send task from.
    messageId BLOB NOT NULL PRIMARY KEY,
    -- The conversation to send into. Deleting the conversation drops any pending outbox rows for it
    -- (the messages themselves are gone, so there is nothing left to transmit).
    conversationUid INTEGER NOT NULL REFERENCES conversations(uid) ON DELETE CASCADE,
    -- When this row was enrolled (i.e. when the message was created).
    createdAt INTEGER NOT NULL
);

-- Index for the ON DELETE CASCADE and any per-conversation cleanup.
CREATE INDEX idxOutgoingMessageOutboxConversationUid ON outgoingMessageOutbox (conversationUid);
