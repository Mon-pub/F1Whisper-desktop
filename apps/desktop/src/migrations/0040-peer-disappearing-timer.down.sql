-- Revert the F1Whisper per-direction disappearing-timer column.
ALTER TABLE conversations DROP COLUMN peerEphemeralTimerSeconds;
