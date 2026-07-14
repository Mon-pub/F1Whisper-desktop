-- Add F1Whisper fork media metadata columns to the type-specific message-data tables.
--
-- These mirror the Android fork's FileData metadata that already rides the E2E payload:
--   * image/video spoiler ('sp') + forwarded ('fwd')
--   * image link-preview ('lp_u'/'lp_t'/'lp_d')
--   * audio listen-once ('lo') + listen-once-consumed ('loc')
--
-- All columns are nullable (append-only): existing rows keep NULL, which the model layer treats as
-- "feature absent". Booleans are stored as INTEGER (the ts-sql-query BOOLEAN custom type handles the
-- JS<->SQLite conversion, matching the existing `animated` column).

-- Image: spoiler, forwarded, link preview
ALTER TABLE messageImageData ADD COLUMN spoiler INTEGER;
ALTER TABLE messageImageData ADD COLUMN forwarded INTEGER;
ALTER TABLE messageImageData ADD COLUMN linkPreviewUrl TEXT;
ALTER TABLE messageImageData ADD COLUMN linkPreviewTitle TEXT;
ALTER TABLE messageImageData ADD COLUMN linkPreviewDescription TEXT;

-- Video: spoiler, forwarded
ALTER TABLE messageVideoData ADD COLUMN spoiler INTEGER;
ALTER TABLE messageVideoData ADD COLUMN forwarded INTEGER;

-- Audio: listen-once
ALTER TABLE messageAudioData ADD COLUMN listenOnce INTEGER;
ALTER TABLE messageAudioData ADD COLUMN listenOnceConsumed INTEGER;
