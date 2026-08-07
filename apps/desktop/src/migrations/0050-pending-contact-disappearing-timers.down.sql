-- Version 49 reads the legacy peer column for inbound freezing. Preserve the shared contact value
-- there before removing version-50 delivery intent so a rollback keeps the effective timer.
UPDATE conversations
    SET peerEphemeralTimerSeconds = ephemeralTimerSeconds
    WHERE contactUid IS NOT NULL;

DROP TABLE pendingContactDisappearingTimers;
