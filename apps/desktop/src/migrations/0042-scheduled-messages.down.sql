-- Revert the F1Whisper fork scheduled-messages table.
DROP INDEX idxScheduledMessagesConversationUid;
DROP INDEX idxScheduledMessagesFireAt;
DROP TABLE scheduledMessages;
