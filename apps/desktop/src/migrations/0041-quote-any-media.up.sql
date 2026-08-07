-- F1Whisper fork: quote-reply with ANY message type (photo/video/file/voice), Signal-parity.
--
-- `messageTextData.quotedMessageId` (migration 0007) already lets a TEXT message quote another
-- message. This extends the same concept to file-based message types by adding the identical
-- column to their type-specific data tables. The wire vehicle is FileData metadata key `"qi"` (the
-- quoted message's apiMessageId, same 16-hex-LE encoding as the text quote), mirroring the Android
-- fork. Nullable / append-only: existing rows keep NULL, which the model layer treats as "no quote".
ALTER TABLE messageFileData ADD COLUMN quotedMessageId BLOB DEFAULT NULL;
ALTER TABLE messageImageData ADD COLUMN quotedMessageId BLOB DEFAULT NULL;
ALTER TABLE messageVideoData ADD COLUMN quotedMessageId BLOB DEFAULT NULL;
ALTER TABLE messageAudioData ADD COLUMN quotedMessageId BLOB DEFAULT NULL;
