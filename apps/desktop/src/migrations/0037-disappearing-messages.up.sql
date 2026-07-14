-- F1Whisper fork: disappearing messages.
--
-- Adds the per-conversation timer and the per-message expiry stamping used by the local enforcement
-- engine. All columns are nullable (append-only); existing rows keep NULL = "no disappearing".

-- Per-conversation timer in seconds (NULL/0 = off). Local-only; cross-member sync is the CSP
-- disappearing-timer control message, not this column.
ALTER TABLE conversations ADD COLUMN ephemeralTimerSeconds INTEGER;

-- Per-message expiry stamping.
ALTER TABLE messages
    -- The timer (seconds) frozen onto the message when it was stamped. NULL = does not disappear.
    ADD COLUMN disappearingTimerSeconds INTEGER;
ALTER TABLE messages
    -- When the disappearing countdown started (outbound: send time; inbound: first-read time).
    ADD COLUMN expireStartedAt INTEGER;
ALTER TABLE messages
    -- When the message is due to disappear (= expireStartedAt + disappearingTimerSeconds * 1000).
    ADD COLUMN expiresAt INTEGER;

-- Index for the periodic sweep (find all rows with expiresAt <= now).
CREATE INDEX idxMessagesExpiresAt ON messages (expiresAt);
