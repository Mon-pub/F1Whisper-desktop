-- Revert the F1Whisper fork media metadata columns.

ALTER TABLE messageImageData DROP COLUMN spoiler;
ALTER TABLE messageImageData DROP COLUMN forwarded;
ALTER TABLE messageImageData DROP COLUMN linkPreviewUrl;
ALTER TABLE messageImageData DROP COLUMN linkPreviewTitle;
ALTER TABLE messageImageData DROP COLUMN linkPreviewDescription;

ALTER TABLE messageVideoData DROP COLUMN spoiler;
ALTER TABLE messageVideoData DROP COLUMN forwarded;

ALTER TABLE messageAudioData DROP COLUMN listenOnce;
ALTER TABLE messageAudioData DROP COLUMN listenOnceConsumed;
