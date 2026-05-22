-- Add optional work last full sync at timestamp.
ALTER TABLE contacts ADD COLUMN workLastFullSyncAt INTEGER;
