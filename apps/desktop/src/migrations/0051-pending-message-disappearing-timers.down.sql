-- A v51 pending row may already be read but deliberately has no deadline. Restore v50's fallback
-- semantics before dropping the marker so a downgrade cannot leave that message permanently kept.
UPDATE messages
SET expireStartedAt = readAt,
    expiresAt = readAt + (disappearingTimerSeconds * 1000)
WHERE pendingRemoteDisappearingTimerNonceHash IS NOT NULL
  AND readAt IS NOT NULL
  AND disappearingTimerSeconds > 0;

DROP INDEX idxMessagesPendingRemoteDisappearingTimerNonceHash;
ALTER TABLE messages DROP COLUMN pendingRemoteDisappearingTimerNonceHash;
