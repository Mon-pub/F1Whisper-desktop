-- Restore upstream's `ordinal` definition from migration 0060 (receive time first), together with
-- its index under the same name.
DROP INDEX indexMessagesConversationUidOrdinal;
ALTER TABLE messages DROP COLUMN ordinal;
ALTER TABLE messages ADD COLUMN ordinal INTEGER
    GENERATED ALWAYS AS (COALESCE(processedAt, createdAt)) VIRTUAL;

CREATE INDEX indexMessagesConversationUidOrdinal
    ON messages (conversationUid, ordinal);
