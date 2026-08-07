-- Revert the F1Whisper fork quote-any-media columns.
ALTER TABLE messageFileData DROP COLUMN quotedMessageId;
ALTER TABLE messageImageData DROP COLUMN quotedMessageId;
ALTER TABLE messageVideoData DROP COLUMN quotedMessageId;
ALTER TABLE messageAudioData DROP COLUMN quotedMessageId;
