-- F1Whisper fork: per-direction disappearing-messages timer split (Android DB v123 parity).
--
-- Splits the single per-conversation timer into TWO per-direction values to fix the offline-flip
-- bug (where turning MY timer off wrongly un-expired the peer's still-disappearing messages):
--
--   * MY  = the existing `ephemeralTimerSeconds` — governs MY OUTGOING stamping + what I advertise.
--   * PEER = the NEW `peerEphemeralTimerSeconds` — written ONLY by an incoming 0x85/0x95 control
--            message; governs INCOMING-message freezing. NULL = the peer never advertised a timer;
--            0 = the peer advertised OFF.
--
-- Desktop's `conversations` table covers BOTH 1:1 and group, so this is a SINGLE new column (a
-- group's PEER value is the last 0x95 from any member, last-writer-wins). Nullable / append-only;
-- local-only (never multi-device-synced).
ALTER TABLE conversations ADD COLUMN peerEphemeralTimerSeconds INTEGER;

-- Seed: an existing-build user who already set a timer keeps peer state (so their already-frozen
-- incoming messages keep enforcing). Copy the old single timer into the peer column ONLY where it
-- is set — matches Android's `WHERE disappearingMessagesTimerSeconds IS NOT NULL` seed.
UPDATE conversations
    SET peerEphemeralTimerSeconds = ephemeralTimerSeconds
    WHERE ephemeralTimerSeconds IS NOT NULL;
