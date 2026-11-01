-- MySQL 8.0.16+ runtime migration phase: optimistic locking.
-- Import mysql8-schema.sql first; import all source data second; run this file last.
-- NEVER run on a partially updated production database.
-- Row revision replaces PostgreSQL xmin. Node backend must use/recheck these values.
-- The database user needs ALTER and TRIGGER permissions.

ALTER TABLE `personal` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_personal_bu` BEFORE UPDATE ON `personal` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `sonderfunktionen` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_sonderfunktionen_bu` BEFORE UPDATE ON `sonderfunktionen` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `disziplin` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_disziplin_bu` BEFORE UPDATE ON `disziplin` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `checklisten` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_checklisten_bu` BEFORE UPDATE ON `checklisten` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `routine` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_routine_bu` BEFORE UPDATE ON `routine` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `sonderzahlungen` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_sonderzahlungen_bu` BEFORE UPDATE ON `sonderzahlungen` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `kuendigungen` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_kuendigungen_bu` BEFORE UPDATE ON `kuendigungen` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

ALTER TABLE `textbausteine` ADD COLUMN `row_revision` BIGINT UNSIGNED NOT NULL DEFAULT 1;
CREATE TRIGGER `idv_rev_textbausteine_bu` BEFORE UPDATE ON `textbausteine` FOR EACH ROW SET NEW.`row_revision` = OLD.`row_revision` + 1;

-- IMPORTANT: Snapshot and audit triggers must still be ported before MySQL becomes live.
