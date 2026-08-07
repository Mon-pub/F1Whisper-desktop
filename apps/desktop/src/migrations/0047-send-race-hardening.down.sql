DROP TABLE pendingGroupDisappearingTimers;
ALTER TABLE messages DROP COLUMN sendFailedAt;
ALTER TABLE scheduledMessages DROP COLUMN claimGeneration;
