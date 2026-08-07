-- F1Whisper fork (P-H04): distinguish an explicit disappearing-messages OFF from a
-- never-configured state, so that a later timer change cannot retroactively expire a message that
-- was received while the incoming timer was off.
--
-- Conversation-level MY timer: the code now persists an explicit OFF as `0` (see
-- `_applyMyEphemeralTimer`), while `NULL` stays reserved for legacy / never-configured rows (which
-- remain adopt-if-unset eligible). Existing conversation rows are intentionally NOT migrated: a
-- historical `NULL` cannot be told apart from a real explicit off, so it must stay legacy.
--
-- Message-level receive-time policy: under the old code an UNREAD, UNSTAMPED, non-expiring message
-- has `disappearingTimerSeconds = NULL` precisely because the incoming timer was off when it was
-- received (an active timer would have frozen a positive value). Freeze those rows as an explicit
-- `0` (does-not-disappear) so first-read no longer falls back to the then-current live timer. Only
-- rows that currently have NO expiry at all are touched, so this can never remove a pending expiry.
UPDATE messages
    SET disappearingTimerSeconds = 0
    WHERE disappearingTimerSeconds IS NULL
      AND readAt IS NULL
      AND expiresAt IS NULL;
