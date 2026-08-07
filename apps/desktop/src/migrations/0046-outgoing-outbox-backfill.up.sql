-- F1Whisper fork (FU-H06): backfill the durable outgoing-message outbox for messages stranded by an
-- OLDER build.
--
-- The outbox (migration 0044) only enrolls messages CREATED on this build (enroll-before-send). A
-- message composed while offline on a pre-outbox build and left unsent when the app quit has a row
-- in `messages` but no `outgoingMessageOutbox` entry, so startup recovery never reconstructs its
-- send task and it stays stranded forever after the upgrade.
--
-- ELIGIBILITY RULE (explicit + bounded): enroll exactly the outbound conversation messages that
-- still need to transmit and are not already enrolled --
--   * outbound             : senderContactUid IS NULL   (an inbound message always has a sender)
--   * no confirmed send ts  : processedAt IS NULL         (processedAt is the outbound sentAt)
--   * not deleted           : deletedAt IS NULL           (a deleted message must never be re-sent)
--   * not already enrolled  : messageId not already in outgoingMessageOutbox
-- Startup recovery then applies the SAME dedupe as for live rows (it drops any row whose message has
-- since gained a sentAt), so a backfilled message transmits exactly once; if an ack was lost the
-- receiver dedupes by message id. Status messages live in a separate table and are never touched.
INSERT INTO outgoingMessageOutbox (messageId, conversationUid, createdAt)
SELECT m.messageId, m.conversationUid, m.createdAt
FROM messages m
WHERE m.senderContactUid IS NULL
  AND m.processedAt IS NULL
  AND m.deletedAt IS NULL
  AND m.messageId NOT IN (SELECT o.messageId FROM outgoingMessageOutbox o);
