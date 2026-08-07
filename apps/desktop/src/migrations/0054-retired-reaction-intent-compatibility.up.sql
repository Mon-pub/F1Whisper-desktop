-- Version 54 existed in pre-release builds that were used with real profiles. Keep the version
-- reserved and converge both the pre-release and released version-53 schemas on the surviving table.
CREATE TABLE IF NOT EXISTS incomingMessageDiscardDispositions (
    senderIdentity TEXT NOT NULL,
    messageId BLOB NOT NULL,
    nonceHash BLOB NOT NULL,
    PRIMARY KEY (senderIdentity, messageId, nonceHash)
) WITHOUT ROWID;
