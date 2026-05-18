-- Drop the deprecated notificationSoundPolicyOverride column.
--
-- The setting was synced from other devices via d2d sync but never used locally.
ALTER TABLE contacts DROP COLUMN notificationSoundPolicyOverride;
ALTER TABLE groups DROP COLUMN notificationSoundPolicyOverride;
