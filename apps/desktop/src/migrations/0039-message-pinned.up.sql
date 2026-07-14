-- F1Whisper fork: local message pinning.
--
-- `pinnedAt` is the timestamp at which a message was pinned (NULL = not pinned). LOCAL ONLY — never
-- sent over the wire and never multi-device-synced (matches the Android fork's `displayTags` bit).
-- Stored as INTEGER (Unix ms), consistent with the other localDateTime columns.
ALTER TABLE messages ADD COLUMN pinnedAt INTEGER;

-- Index for the per-conversation pinned-messages query (the pinned banner).
CREATE INDEX idxMessagesPinnedAt ON messages (conversationUid, pinnedAt);
