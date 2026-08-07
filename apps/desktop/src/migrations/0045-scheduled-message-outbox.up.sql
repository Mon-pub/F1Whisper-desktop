-- F1Whisper fork: scheduled-message dispatch state machine (U-H01/U-H03).
--
-- The initial scheduled-messages table (migration 0042) fired a due row by creating a real message
-- with a fresh random id and then deleting the row, so a crash between "message created" and "row
-- deleted" would re-fire on the next sweep under a NEW id (a duplicate send), and a process-local
-- flag was the only guard against overlapping sweeps. These columns turn dispatch into a durable
-- pending -> claimed state machine:
--
--   * messageId: a stable reserved outgoing message id, chosen once when the message is scheduled and
--     reused on every (re)fire, so recovery can ask "does this id already exist?" to dedupe.
--   * state: 0 = pending (awaiting its fire time), 1 = claimed (a sweep has taken it and is turning
--     it into a real message). A claim is an atomic pending -> claimed transition, so two concurrent
--     sweeps can never both fire the same row.
--   * failedAt: the time of the last failed fire attempt, so the UI can surface "failed" and the row
--     is retried on the next sweep. Cleared when a claim succeeds.
ALTER TABLE scheduledMessages ADD COLUMN messageId BLOB;
ALTER TABLE scheduledMessages ADD COLUMN state INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduledMessages ADD COLUMN failedAt INTEGER;

-- Backfill a stable random 8-byte outgoing message id for any pre-existing scheduled row. The column
-- is logically NOT NULL, but SQLite cannot add a NOT NULL column without a constant default;
-- randomblob(8) is a valid random 64-bit message id, matching what randomMessageId() would produce.
UPDATE scheduledMessages SET messageId = randomblob(8) WHERE messageId IS NULL;

-- The claim sweep looks up "pending rows whose fire time is due" (state = 0 AND fireAt <= now); this
-- composite index serves both that scan and the "nearest pending fire time" timer-arming query.
CREATE INDEX idxScheduledMessagesStateFireAt ON scheduledMessages (state, fireAt);
