-- F1Whisper fork (PR3-H02/H03/H04/M01/M04): close deferred-send races and durably recover genuine
-- local group disappearing-timer changes.

-- Every scheduled-message claim receives a new generation. Async completion/revert/consume steps
-- must still match this generation, so deletion or a newer claim invalidates stale in-memory work.
ALTER TABLE scheduledMessages ADD COLUMN claimGeneration INTEGER NOT NULL DEFAULT 0;

-- A group send that reaches handoff after this user left the group is terminal, not retryable.
-- Persist the failure so it survives restart and can be surfaced by the normal message-status view.
ALTER TABLE messages ADD COLUMN sendFailedAt INTEGER;

-- Only genuine local group timer changes are inserted here. Recovery reads this intent table rather
-- than scanning/reasserting arbitrary current group timer values. A generation prevents an ACK for
-- an older value from clearing a newer pending change.
CREATE TABLE pendingGroupDisappearingTimers (
    -- AUTOINCREMENT preserves the high-water mark after ACK cleanup deletes a row. Without it, a
    -- later change could reuse generation 1 and an old duplicate task could clear the new intent.
    generation INTEGER PRIMARY KEY AUTOINCREMENT,
    groupUid INTEGER NOT NULL UNIQUE REFERENCES groups(uid) ON DELETE CASCADE,
    timerSeconds INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
);
