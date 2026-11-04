-- Add optional work availability status.
-- 0: None/No state, 1: Unavailable, 2: Busy
ALTER TABLE contacts ADD COLUMN workAvailabilityStatusCategory INTEGER;
ALTER TABLE contacts ADD COLUMN workAvailabilityStatusDescription TEXT;
