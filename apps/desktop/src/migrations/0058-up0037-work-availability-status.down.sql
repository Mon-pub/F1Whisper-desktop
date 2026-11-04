-- Remove optional work availability status.
ALTER TABLE contacts DROP COLUMN workAvailabilityStatusCategory;
ALTER TABLE contacts DROP COLUMN workAvailabilityStatusDescription;
