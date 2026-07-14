-- Revert the F1Whisper local message-pinning column + index.
DROP INDEX idxMessagesPinnedAt;
ALTER TABLE messages DROP COLUMN pinnedAt;
