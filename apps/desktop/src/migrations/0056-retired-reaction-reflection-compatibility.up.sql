-- Version 56 existed in pre-release builds that were used with real profiles. Keep the version
-- reserved and repair an intermediate pre-release profile if earlier compatibility steps were cached.
CREATE TABLE IF NOT EXISTS incomingMessageDiscardDispositions (
    senderIdentity TEXT NOT NULL,
    messageId BLOB NOT NULL,
    nonceHash BLOB NOT NULL,
    PRIMARY KEY (senderIdentity, messageId, nonceHash)
) WITHOUT ROWID;
