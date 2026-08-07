-- Revert the F1Whisper fork scheduled-message dispatch state-machine columns (migration 0045).
DROP INDEX idxScheduledMessagesStateFireAt;
ALTER TABLE scheduledMessages DROP COLUMN failedAt;
ALTER TABLE scheduledMessages DROP COLUMN state;
ALTER TABLE scheduledMessages DROP COLUMN messageId;
