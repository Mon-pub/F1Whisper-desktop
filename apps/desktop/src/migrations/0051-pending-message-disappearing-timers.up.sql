-- A custom-onprem follower can receive a D2D reflection before the matching direct CSP copy. Keep
-- the reflection-time fallback on the message itself and bind the one-shot metadata resolution to
-- the exact CSP nonce without persisting the nonce in plaintext.
ALTER TABLE messages ADD COLUMN pendingRemoteDisappearingTimerNonceHash BLOB;

-- A reflected CSP nonce can resolve at most one message row. NULL rows are ordinary/resolved rows
-- and are intentionally excluded so they remain unrestricted.
CREATE UNIQUE INDEX idxMessagesPendingRemoteDisappearingTimerNonceHash
    ON messages (pendingRemoteDisappearingTimerNonceHash)
    WHERE pendingRemoteDisappearingTimerNonceHash IS NOT NULL;
