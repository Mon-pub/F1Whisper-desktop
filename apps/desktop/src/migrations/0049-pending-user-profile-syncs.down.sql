-- Keep unacknowledged D2D intent across rollback. Version-48 code ignores this table, while a later
-- re-upgrade re-plans its row against current profile settings. The invalidated type-0 ACK cache
-- cannot be reconstructed.
SELECT 1;
