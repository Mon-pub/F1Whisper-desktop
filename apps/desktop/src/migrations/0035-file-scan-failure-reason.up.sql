-- Add downloadFailureReason column to all file-based message data tables.
-- Used by the file scanner extension point to persist the reason a file was blocked.
ALTER TABLE messageFileData ADD COLUMN downloadFailureReason TEXT;
ALTER TABLE messageImageData ADD COLUMN downloadFailureReason TEXT;
ALTER TABLE messageVideoData ADD COLUMN downloadFailureReason TEXT;
ALTER TABLE messageAudioData ADD COLUMN downloadFailureReason TEXT;
