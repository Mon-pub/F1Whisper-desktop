-- Revert the F1Whisper fork durable outgoing-message outbox table.
DROP INDEX idxOutgoingMessageOutboxConversationUid;
DROP TABLE outgoingMessageOutbox;
