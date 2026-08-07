-- Revert the frozen-off marker back to NULL for the unread, non-expiring rows the up-migration
-- applied it to. Data-only migration: a downgrade returns those messages to the legacy
-- fall-back-to-live behavior at first-read.
UPDATE messages
    SET disappearingTimerSeconds = NULL
    WHERE disappearingTimerSeconds = 0
      AND readAt IS NULL
      AND expiresAt IS NULL;
