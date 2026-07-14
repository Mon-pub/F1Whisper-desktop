-- F1Whisper fork: per-(group message, member) delivery/read receipt state.
--
-- The F1Whisper Android fork sends group delivery/read receipts (0x81 DELIVERED/READ) point-to-point
-- to the message SENDER only, so the sender can show a "Read by" / "Delivered to" list. This table
-- holds, for each of MY outbound group messages, which member delivered/read it and when.

CREATE TABLE groupMemberReceipts (
    uid INTEGER PRIMARY KEY,
    -- The group member who sent the receipt. We key on the identity (not a contact uid) so receipts
    -- from members who later leave the group are still shown.
    senderIdentity TEXT NOT NULL,
    -- The (outbound, group) message this receipt is for.
    messageUid INTEGER NOT NULL REFERENCES messages(uid) ON DELETE CASCADE,
    -- When this member's client delivered the message (NULL = not yet delivered).
    deliveredAt INTEGER,
    -- When this member read the message (NULL = not yet read).
    readAt INTEGER,
    -- Exactly one receipt-state row per (member, message).
    UNIQUE(senderIdentity, messageUid)
);
