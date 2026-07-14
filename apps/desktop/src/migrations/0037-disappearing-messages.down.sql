-- Revert the F1Whisper disappearing-messages columns + index + status rows.

-- Remove the local disappearing-timer status rows (the status-message table is schema-generic, so
-- the up-migration needs no change for the new kind; only the down-migration cleans it up).
DELETE FROM statusMessages WHERE type = 'disappearing-timer-changed';

DROP INDEX idxMessagesExpiresAt;

ALTER TABLE messages DROP COLUMN expiresAt;
ALTER TABLE messages DROP COLUMN expireStartedAt;
ALTER TABLE messages DROP COLUMN disappearingTimerSeconds;

ALTER TABLE conversations DROP COLUMN ephemeralTimerSeconds;
