-- Additive Erweiterung der PMA-Stimmabgabe, niemals DELETE/UPDATE vorhandener Stimmen.
-- Erst NACH vollständiger Datenbanksicherung ausführen.
-- Bestehende Stimmen erhalten NULL in den neuen Feldern und bleiben gültig.
SET @vote_a=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_stimmen' AND COLUMN_NAME='anlass');
SET @vote_q=IF(@vote_a=0,'ALTER TABLE ausbildung_stimmen ADD COLUMN anlass VARCHAR(32) NULL','SELECT 1');
PREPARE vote_stmt FROM @vote_q;
EXECUTE vote_stmt;
DEALLOCATE PREPARE vote_stmt;

SET @vote_d=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_stimmen' AND COLUMN_NAME='streifenfahrt_datum');
SET @vote_q=IF(@vote_d=0,'ALTER TABLE ausbildung_stimmen ADD COLUMN streifenfahrt_datum DATE NULL','SELECT 1');
PREPARE vote_stmt FROM @vote_q;
EXECUTE vote_stmt;
DEALLOCATE PREPARE vote_stmt;

SET @vote_b=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_stimmen' AND COLUMN_NAME='bemerkung');
SET @vote_q=IF(@vote_b=0,'ALTER TABLE ausbildung_stimmen ADD COLUMN bemerkung TEXT NULL','SELECT 1');
PREPARE vote_stmt FROM @vote_q;
EXECUTE vote_stmt;
DEALLOCATE PREPARE vote_stmt;
