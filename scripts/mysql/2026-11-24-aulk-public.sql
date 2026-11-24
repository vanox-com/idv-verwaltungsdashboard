-- Separate additive update after scripts/mysql/2026-11-24-ausbildung.sql.
-- No existing personnel or training data is deleted or published by this script.
SET NAMES utf8mb4;
SET @aulk_column_exists = (
 SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_materialien'
 AND COLUMN_NAME='public_aktiv'
);
SET @aulk_alter_sql = IF(@aulk_column_exists=0,
  'ALTER TABLE ausbildung_materialien ADD COLUMN public_aktiv TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE aulk_stmt FROM @aulk_alter_sql;
EXECUTE aulk_stmt;
DEALLOCATE PREPARE aulk_stmt;

-- Police council: optional view-only module access, never trainer administration.
-- Existing individual user permissions continue to override role defaults.
INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','ausbildung',1)
 ON DUPLICATE KEY UPDATE stufe=GREATEST(stufe,VALUES(stufe));
