-- F1Whisper fork: order messages by their sender-side creation time.
--
-- Upstream's migration 0060 (native 0039) defines `messages.ordinal` as
-- `COALESCE(processedAt, createdAt)`, i.e. local receive time first. The fork keeps sender time
-- (parity with the Android fork), so replace the generated expression with `createdAt`
-- (`createdAt` is NOT NULL, see 0001). SQLite cannot drop an indexed column, so the index goes
-- first and is re-created with upstream's exact definition afterwards.
DROP INDEX indexMessagesConversationUidOrdinal;
ALTER TABLE messages DROP COLUMN ordinal;
ALTER TABLE messages ADD COLUMN ordinal INTEGER
    GENERATED ALWAYS AS (createdAt) VIRTUAL;

CREATE INDEX indexMessagesConversationUidOrdinal
    ON messages (conversationUid, ordinal);
