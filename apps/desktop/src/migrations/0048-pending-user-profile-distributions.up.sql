-- PR3-H05: durable per-recipient user-profile distribution intent. The action itself is
-- deliberately not persisted: every retry re-plans against the current picture and sharing policy.
-- AUTOINCREMENT prevents an old ACK/task from matching a later intent for the same recipient (ABA).
CREATE TABLE pendingUserProfileDistributions (
    generation INTEGER PRIMARY KEY AUTOINCREMENT,
    receiverIdentity TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL
);
