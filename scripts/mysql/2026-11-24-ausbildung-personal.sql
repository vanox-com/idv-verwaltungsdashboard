-- Ausbildungsdatenstamm ist an die Personalakte gebunden; nur additive Felder.
-- Dienstnummern werden bei Neubelegung über den Zähler der Historieneinträge getrennt.
SET @aus_person_col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_anwaerter' AND COLUMN_NAME='personal_quelle');
SET @aus_person_sql = IF(@aus_person_col=0,'ALTER TABLE ausbildung_anwaerter ADD COLUMN personal_quelle VARCHAR(90) NULL','SELECT 1');
PREPARE aus_person_stmt FROM @aus_person_sql;
EXECUTE aus_person_stmt;
DEALLOCATE PREPARE aus_person_stmt;
SET @aus_person_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_anwaerter' AND INDEX_NAME='ausbildung_anwaerter_quelle_uq');
SET @aus_person_sql = IF(@aus_person_idx=0,'ALTER TABLE ausbildung_anwaerter ADD UNIQUE KEY ausbildung_anwaerter_quelle_uq(personal_quelle)','SELECT 1');
PREPARE aus_person_stmt FROM @aus_person_sql;
EXECUTE aus_person_stmt;
DEALLOCATE PREPARE aus_person_stmt;
