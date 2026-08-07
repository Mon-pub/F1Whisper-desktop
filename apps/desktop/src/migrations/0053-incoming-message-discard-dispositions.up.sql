-- Exact terminal decisions used to prevent a late custom-onprem reflection from recreating a
-- conversation row after the matching direct CSP copy was discarded.
-- A generic persisted nonce is deliberately insufficient provenance for this decision.
CREATE TABLE IF NOT EXISTS incomingMessageDiscardDispositions (
    senderIdentity TEXT NOT NULL,
    messageId BLOB NOT NULL,
    nonceHash BLOB NOT NULL,
    PRIMARY KEY (senderIdentity, messageId, nonceHash)
) WITHOUT ROWID;
