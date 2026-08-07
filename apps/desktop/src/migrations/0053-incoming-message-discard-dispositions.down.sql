-- A v52 runtime cannot enforce existing or future direct-message decisions. This migration is
-- deliberately irreversible: fail transactionally before changing the schema or database version.
CREATE TABLE migration0053DowngradeGuard (
    blocked INTEGER NOT NULL CHECK (blocked = 0)
);
INSERT INTO migration0053DowngradeGuard (blocked) VALUES (1);
