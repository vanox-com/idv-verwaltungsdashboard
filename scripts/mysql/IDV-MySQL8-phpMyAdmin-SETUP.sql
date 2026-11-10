-- IDV MySQL 8 — PHP/phpMyAdmin initial setup
-- One-shot schema-only import into a NEW EMPTY MySQL 8.0.16+ database.
-- This SQL contains NO staff records, passwords or historical records.
-- The existing IDV Node/Express app is NOT replaced by this SQL alone.
-- API modules, auditing triggers and full integration tests must be completed before deployment.
-- Import sensitive DATA separately and only after stopping writes on the old server.

-- STEP 1: Base tables and business constraints
-- Identity Valley Police Dashboard — MySQL 8.0.16+ (phpMyAdmin)
-- Generated from LIVE PostgreSQL metadata at migration preparation, without exporting any personnel or passwords.
-- For a NEW EMPTY MySQL 8 database. DO NOT import into an existing populated database.
-- This creates the relational structure only. Application SQL and PostgreSQL triggers need migration before switching live.
-- Character comparison is binary/case-sensitive to match PostgreSQL identifier and status semantics.
SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `befoerderungen` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `vorname` LONGTEXT,
  `nachname` LONGTEXT,
  `rang` LONGTEXT,
  `neu_rang` LONGTEXT,
  `grund` LONGTEXT,
  `am` DATE,
  `por` LONGTEXT,
  `erl` LONGTEXT,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `bekanntmachungen` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `titel` LONGTEXT NOT NULL,
  `inhalt` LONGTEXT NOT NULL,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `benachrichtigungen_gelesen` (
  `user_id` INT NOT NULL,
  `meldung_id` INT NOT NULL,
  `gelesen_am` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`, `meldung_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `blacklist` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `personalnummer` VARCHAR(191) NOT NULL DEFAULT '',
  `vorname` LONGTEXT NOT NULL,
  `nachname` LONGTEXT NOT NULL,
  `datum` DATE,
  `ablauf` DATE,
  `handy` VARCHAR(191) NOT NULL DEFAULT '',
  `bemerkung` VARCHAR(2048) NOT NULL DEFAULT '',
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `checklisten` (
  `name` VARCHAR(191) NOT NULL,
  `aufgaben` JSON NOT NULL DEFAULT ('[]'),
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `checklisten_status` (
  `name` VARCHAR(191) NOT NULL,
  `punkt` INT NOT NULL,
  `erledigt` TINYINT(1) NOT NULL DEFAULT 0,
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`name`, `punkt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `copnet_zugaenge` (
  `personalnummer` INT NOT NULL,
  `dienstnummer` VARCHAR(191) NOT NULL DEFAULT '',
  `passwort_verschluesselt` VARCHAR(2048) NOT NULL DEFAULT '',
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`personalnummer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `dashboard` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `art` LONGTEXT NOT NULL,
  `text` LONGTEXT NOT NULL,
  `anzahl` INT,
  `url` LONGTEXT,
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `dashboard_layout` (
  `id` SMALLINT NOT NULL,
  `items` JSON NOT NULL DEFAULT ('[]'),
  `version` INT NOT NULL DEFAULT 1,
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `daten24` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `vorname` LONGTEXT,
  `nachname` LONGTEXT,
  `anwesend` TINYINT(1) NOT NULL DEFAULT 0,
  `durchgezogen` TINYINT(1) NOT NULL DEFAULT 0,
  `sonderzahlung` LONGTEXT,
  `top5` TINYINT(1) NOT NULL DEFAULT 0,
  `gesamt` LONGTEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `dienstnummer_antraege` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `alt_nr` INT NOT NULL,
  `ziel_nr` INT NOT NULL,
  `art` VARCHAR(191) NOT NULL,
  `begruendung` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'beantragt',
  `quell_name` LONGTEXT NOT NULL,
  `ziel_name` LONGTEXT NOT NULL DEFAULT (''),
  `pruefstand` JSON NOT NULL,
  `antragsteller_id` INT,
  `entscheider_id` INT,
  `entscheidungsnotiz` LONGTEXT NOT NULL DEFAULT (''),
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `entschieden_am` DATETIME(6),
  PRIMARY KEY (`id`),
  KEY `dienstnummer_antraege_status_erstellt_idx` (`status`,`erstellt` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `dienststellen` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `beschreibung` VARCHAR(2048) NOT NULL DEFAULT '',
  `aktiv` TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `dienststellen_name_key` (`name`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `disziplin` (
  `personalnummer` INT NOT NULL,
  `massnahmen` JSON NOT NULL DEFAULT ('[]'),
  `slots` JSON NOT NULL DEFAULT ('[]'),
  `bemerkung` VARCHAR(2048) NOT NULL DEFAULT '',
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`personalnummer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `disziplinspalten` (
  `name` VARCHAR(191) NOT NULL,
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `generierte_dokumente` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `person_name` LONGTEXT NOT NULL,
  `typ` LONGTEXT NOT NULL,
  `titel` LONGTEXT NOT NULL,
  `url` LONGTEXT NOT NULL,
  `kontext_id` INT,
  `erstellt_von` INT,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `idv_aenderungen` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bereich` LONGTEXT NOT NULL,
  `schluessel` LONGTEXT NOT NULL,
  `personalnummer` INT,
  `vorgang` LONGTEXT NOT NULL,
  `felder` JSON NOT NULL DEFAULT ('{}'),
  `user_id` INT,
  `zeit` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `idv_papierkorb` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `bereich` LONGTEXT NOT NULL,
  `schluessel` LONGTEXT NOT NULL,
  `titel` LONGTEXT NOT NULL,
  `datensatz` JSON NOT NULL,
  `zusatz` JSON NOT NULL DEFAULT ('[]'),
  `geloescht_von` INT,
  `geloescht_am` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `wiederhergestellt_von` INT,
  `wiederhergestellt_am` DATETIME(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `kuendigungen` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `vorname` LONGTEXT,
  `nachname` LONGTEXT,
  `rang` LONGTEXT,
  `grund` LONGTEXT,
  `handy` LONGTEXT,
  `vertrag` LONGTEXT,
  `eintritt` DATE,
  `urkunde` LONGTEXT,
  `zeugnis` LONGTEXT,
  `kuendigung` LONGTEXT,
  `waffe` VARCHAR(2048) DEFAULT 'Offen',
  `copnet` VARCHAR(2048) DEFAULT 'Offen',
  `emd` VARCHAR(2048) DEFAULT 'Offen',
  `ic` VARCHAR(2048) DEFAULT 'Offen',
  `discord` VARCHAR(2048) DEFAULT 'Offen',
  `dienstgegenstaende` VARCHAR(2048) DEFAULT 'Offen',
  `anzeige` VARCHAR(2048) DEFAULT 'Nein',
  `kuendigungsdatum` DATE DEFAULT (CURRENT_DATE),
  `erfasst_am` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  `personal_snapshot` JSON,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `zeit` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `user_id` INT,
  `aktion` LONGTEXT NOT NULL,
  `art` VARCHAR(191) NOT NULL DEFAULT 'edit',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `migrationen` (
  `name` VARCHAR(191) NOT NULL,
  `ausgefuehrt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `organigramm` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `zeile` JSON NOT NULL DEFAULT ('[]'),
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `organigramm_layout` (
  `id` SMALLINT NOT NULL,
  `inhalt` JSON NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `personal` (
  `personalnummer` INT NOT NULL,
  `gruppe` VARCHAR(191) NOT NULL DEFAULT 'Nicht zugeordnet',
  `status` VARCHAR(191) NOT NULL DEFAULT 'Aktiv',
  `vorname` LONGTEXT,
  `nachname` LONGTEXT,
  `geburtsdatum` DATE,
  `handy` LONGTEXT,
  `waffenschein` TINYINT(1) NOT NULL DEFAULT 0,
  `spind` TINYINT(1) NOT NULL DEFAULT 0,
  `nebenjob` LONGTEXT,
  `dienstgrad` LONGTEXT,
  `eintrittsdatum` DATE,
  `arbeitsvertrag` LONGTEXT,
  `ernennungsurkunde` LONGTEXT,
  `urlaub_von` DATE,
  `urlaub_bis` DATE,
  `urlaub_tage` LONGTEXT,
  `bemerkung` LONGTEXT,
  `rsa` LONGTEXT,
  `letzte_befoerderung` DATE,
  `naechste_befoerderung` DATE,
  `por_status` VARCHAR(191) NOT NULL DEFAULT 'offen',
  `por_notiz` VARCHAR(2048) NOT NULL DEFAULT '',
  `por_am` DATE,
  `arbeitsvertrag_url` VARCHAR(2048) NOT NULL DEFAULT '',
  `ernennungsurkunde_url` VARCHAR(2048) NOT NULL DEFAULT '',
  `beschaeftigungsart` VARCHAR(191) NOT NULL DEFAULT 'Hauptberuf',
  `dienststelle_id` BIGINT,
  `administrativ_geloescht_am` DATETIME(6),
  `administrativ_geloescht_von` INT,
  PRIMARY KEY (`personalnummer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `personal_audit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT NOT NULL,
  `user_id` INT,
  `zeit` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `aenderungen` JSON NOT NULL DEFAULT ('{}'),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `personal_fristen` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `titel` LONGTEXT NOT NULL,
  `faellig_am` DATE NOT NULL,
  `vorwarn_tage` INT NOT NULL DEFAULT 14,
  `erledigt` TINYINT(1) NOT NULL DEFAULT 0,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `personal_rangantraege` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT NOT NULL,
  `alter_rang` LONGTEXT NOT NULL,
  `beantragter_rang` LONGTEXT NOT NULL,
  `begruendung` VARCHAR(2048) NOT NULL DEFAULT '',
  `status` VARCHAR(191) NOT NULL DEFAULT 'beantragt',
  `antragsteller_id` INT,
  `entscheider_id` INT,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `entschieden_am` DATETIME(6),
  `korrigiertes_befoerderungsdatum` DATE,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `personalnummer_neubelegungen` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT NOT NULL,
  `zeit` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `vergeben_von` INT,
  `vorher` JSON NOT NULL,
  `folgedaten` JSON NOT NULL DEFAULT ('{}'),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `portal_design` (
  `id` SMALLINT NOT NULL,
  `akzent` VARCHAR(191) NOT NULL DEFAULT '#5b86ba',
  `schleier` SMALLINT NOT NULL DEFAULT 88,
  `hintergrund` VARCHAR(191) NOT NULL DEFAULT 'wappen',
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `extras` JSON NOT NULL DEFAULT ('{}'),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `portal_design_personal` (
  `user_id` INT NOT NULL,
  `akzent` LONGTEXT NOT NULL,
  `schleier` SMALLINT NOT NULL,
  `hintergrund` LONGTEXT NOT NULL,
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `extras` JSON NOT NULL DEFAULT ('{}'),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `portal_meldung_empfaenger` (
  `meldung_id` BIGINT NOT NULL,
  `user_id` INT NOT NULL,
  `ausgeblendet_am` DATETIME(6),
  PRIMARY KEY (`meldung_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `portal_meldungen` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `titel` LONGTEXT NOT NULL,
  `inhalt` LONGTEXT NOT NULL,
  `absender_id` INT,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `sichtbar_ab` DATETIME(6),
  `sichtbar_bis` DATETIME(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `raenge` (
  `name` VARCHAR(191) NOT NULL,
  `abk` LONGTEXT,
  `tage` INT,
  `bemerkung` LONGTEXT,
  `grund` LONGTEXT,
  `sortierung` INT NOT NULL DEFAULT 0,
  `naechster_rang` LONGTEXT,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `richtlinie` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `stand` LONGTEXT,
  `pdv` LONGTEXT,
  `text_kurz` LONGTEXT,
  `mild` LONGTEXT,
  `hart` LONGTEXT,
  `sonst` LONGTEXT,
  `anmerkung` LONGTEXT,
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `role_perms` (
  `rolle` VARCHAR(191) NOT NULL,
  `modul` VARCHAR(191) NOT NULL,
  `stufe` SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`rolle`, `modul`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `roles` (
  `name` VARCHAR(191) NOT NULL,
  `farbe` LONGTEXT NOT NULL,
  `sensibel` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `routine` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `tage` JSON NOT NULL DEFAULT ('[]'),
  `personen` JSON NOT NULL DEFAULT ('[]'),
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `routine_archiv` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `routine_id` INT NOT NULL,
  `datum` DATE NOT NULL,
  `teilnehmer` JSON NOT NULL DEFAULT ('[]'),
  `archiviert_am` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `archiviert_von` INT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `routine_archiv_routine_datum_unique` (`routine_id`, `datum`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `sessions` (
  `token` VARCHAR(191) NOT NULL,
  `user_id` INT NOT NULL,
  `zweck` VARCHAR(191) NOT NULL DEFAULT 'voll',
  `ablauf` DATETIME(6) NOT NULL,
  PRIMARY KEY (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `sonderfunktionen` (
  `personalnummer` INT NOT NULL,
  `leitung` LONGTEXT,
  `sonstige` LONGTEXT,
  `werte` JSON NOT NULL DEFAULT ('{}'),
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`personalnummer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `sonderfunktionsspalten` (
  `name` VARCHAR(191) NOT NULL,
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `sonderzahlungen` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `vorname` LONGTEXT,
  `nachname` LONGTEXT,
  `rang` LONGTEXT,
  `erhalten` TINYINT(1) NOT NULL DEFAULT 0,
  `datum` DATE,
  `betrag` LONGTEXT,
  `grund` LONGTEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `sperrfristen` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `vorname` VARCHAR(191) NOT NULL DEFAULT '',
  `nachname` LONGTEXT NOT NULL,
  `art` LONGTEXT NOT NULL,
  `grund` VARCHAR(2048) NOT NULL DEFAULT '',
  `von` DATE,
  `bis` DATE,
  `bemerkung` VARCHAR(2048) NOT NULL DEFAULT '',
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `sport` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `personalnummer` INT,
  `vorname` LONGTEXT,
  `nachname` LONGTEXT,
  `geprueft` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `system_optionen` (
  `schluessel` VARCHAR(191) NOT NULL,
  `werte` JSON NOT NULL DEFAULT ('[]'),
  `aktualisiert` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`schluessel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `textbausteine` (
  `schluessel` VARCHAR(191) NOT NULL,
  `kategorie` LONGTEXT NOT NULL,
  `titel` LONGTEXT NOT NULL,
  `inhalt` LONGTEXT NOT NULL,
  `sortierung` INT NOT NULL DEFAULT 0,
  `geloescht` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`schluessel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `user_favoriten` (
  `user_id` INT NOT NULL,
  `modul` VARCHAR(191) NOT NULL,
  `sortierung` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`, `modul`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `user_perms` (
  `user_id` INT NOT NULL,
  `modul` VARCHAR(191) NOT NULL,
  `stufe` SMALLINT NOT NULL,
  PRIMARY KEY (`user_id`, `modul`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `dienstnummer` VARCHAR(191) NOT NULL,
  `anzeigename` LONGTEXT NOT NULL,
  `rolle` VARCHAR(191) NOT NULL,
  `passwort_hash` LONGTEXT NOT NULL,
  `muss_passwort_aendern` TINYINT(1) NOT NULL DEFAULT 1,
  `gesperrt` TINYINT(1) NOT NULL DEFAULT 0,
  `erstellt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY `users_dienstnummer_key` (`dienstnummer`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE INDEX `generierte_dokumente_kontext_idx` ON `generierte_dokumente` (`kontext_id`, `typ`(191));
CREATE INDEX `generierte_dokumente_person_idx` ON `generierte_dokumente` (`personalnummer`, `erstellt` DESC);
CREATE INDEX `idv_aenderungen_bereich_zeit` ON `idv_aenderungen` (`bereich`(191), `zeit` DESC, `id` DESC);
CREATE INDEX `idv_aenderungen_person_zeit` ON `idv_aenderungen` (`personalnummer`, `zeit` DESC, `id` DESC);
CREATE INDEX `idv_kuendigungen_person_idx` ON `kuendigungen` (`personalnummer`, `id` DESC);
CREATE INDEX `idv_kuendigungen_zeit_idx` ON `kuendigungen` (`kuendigungsdatum` DESC, `erfasst_am` DESC, `id` DESC);
CREATE INDEX `personal_audit_nr_zeit` ON `personal_audit` (`personalnummer`, `zeit` DESC);
CREATE INDEX `personalnummer_neubelegungen_nr_zeit` ON `personalnummer_neubelegungen` (`personalnummer`, `zeit` DESC);
CREATE INDEX `routine_archiv_routine_datum_idx` ON `routine_archiv` (`routine_id`, `datum` DESC);

-- Constraints translated from the original PostgreSQL CHECK conditions.
ALTER TABLE `checklisten_status` ADD CONSTRAINT `checklisten_status_punkt_check` CHECK (`punkt` >= 0);
ALTER TABLE `dashboard_layout` ADD CONSTRAINT `dashboard_layout_id_check` CHECK (`id` = 1);
ALTER TABLE `generierte_dokumente` ADD CONSTRAINT `generierte_dokumente_url_check` CHECK (`url` LIKE 'https://docs.google.com/document/d/%');
ALTER TABLE `idv_papierkorb` ADD CONSTRAINT `idv_papierkorb_bereich_check` CHECK (`bereich` IN ('kuendigungen','checklisten','textbausteine','personal'));
ALTER TABLE `organigramm_layout` ADD CONSTRAINT `organigramm_layout_id_check` CHECK (`id` = 1);
ALTER TABLE `personal_fristen` ADD CONSTRAINT `personal_fristen_vorwarn_tage_check` CHECK (`vorwarn_tage` BETWEEN 0 AND 365);
ALTER TABLE `personal_rangantraege` ADD CONSTRAINT `personal_rangantraege_status_check` CHECK (`status` IN ('beantragt','genehmigt','abgelehnt'));
ALTER TABLE `portal_design` ADD CONSTRAINT `portal_design_id_check` CHECK (`id` = 1);
ALTER TABLE `portal_design` ADD CONSTRAINT `portal_design_schleier_check` CHECK (`schleier` BETWEEN 65 AND 97);
ALTER TABLE `sperrfristen` ADD CONSTRAINT `sperrfristen_art_check` CHECK (`art` IN ('Bewerber','Praktikant'));
ALTER TABLE `user_perms` ADD CONSTRAINT `user_perms_stufe_check` CHECK (`stufe` IN (0,1,2));

ALTER TABLE `dienstnummer_antraege` ADD CONSTRAINT `dienstnummer_antraege_art_check` CHECK (`art` IN ('zugang','personal'));
ALTER TABLE `dienstnummer_antraege` ADD CONSTRAINT `dienstnummer_antraege_status_check` CHECK (`status` IN ('beantragt','genehmigt','abgelehnt'));
ALTER TABLE `dienstnummer_antraege` ADD CONSTRAINT `dienstnummer_antraege_nummern_check` CHECK (`alt_nr` > 0 AND `ziel_nr` > 0 AND `alt_nr` <> `ziel_nr`);

-- PostgreSQL has a unique partial index to allow only one pending rank application per person.
-- MySQL generated NULLs make all non-pending rows exempt from this unique constraint.
ALTER TABLE `personal_rangantraege` ADD COLUMN `beantragt_personalnummer` INT GENERATED ALWAYS AS (CASE WHEN `status` = 'beantragt' THEN `personalnummer` ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX `personal_rangantraege_ein_offener_idx` ON `personal_rangantraege` (`beantragt_personalnummer`);

-- Only one pending DN-change request per source number; closed requests remain historical.
ALTER TABLE `dienstnummer_antraege` ADD COLUMN `offene_alt_nr` INT GENERATED ALWAYS AS (CASE WHEN `status` = 'beantragt' THEN `alt_nr` ELSE NULL END) VIRTUAL;
CREATE UNIQUE INDEX `dienstnummer_antraege_ein_offener_idx` ON `dienstnummer_antraege` (`offene_alt_nr`);

ALTER TABLE `dienstnummer_antraege` ADD CONSTRAINT `dienstnummer_antraege_antragsteller_id_fkey` FOREIGN KEY (`antragsteller_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `dienstnummer_antraege` ADD CONSTRAINT `dienstnummer_antraege_entscheider_id_fkey` FOREIGN KEY (`entscheider_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `benachrichtigungen_gelesen` ADD CONSTRAINT `benachrichtigungen_gelesen_meldung_id_fkey` FOREIGN KEY (`meldung_id`) REFERENCES `log` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `benachrichtigungen_gelesen` ADD CONSTRAINT `benachrichtigungen_gelesen_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `checklisten_status` ADD CONSTRAINT `checklisten_status_name_fkey` FOREIGN KEY (`name`) REFERENCES `checklisten` (`name`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `copnet_zugaenge` ADD CONSTRAINT `copnet_zugaenge_personalnummer_fkey` FOREIGN KEY (`personalnummer`) REFERENCES `personal` (`personalnummer`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `disziplin` ADD CONSTRAINT `disziplin_personalnummer_fkey` FOREIGN KEY (`personalnummer`) REFERENCES `personal` (`personalnummer`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `generierte_dokumente` ADD CONSTRAINT `generierte_dokumente_erstellt_von_fkey` FOREIGN KEY (`erstellt_von`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `generierte_dokumente` ADD CONSTRAINT `generierte_dokumente_personalnummer_fkey` FOREIGN KEY (`personalnummer`) REFERENCES `personal` (`personalnummer`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `idv_aenderungen` ADD CONSTRAINT `idv_aenderungen_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `idv_papierkorb` ADD CONSTRAINT `idv_papierkorb_geloescht_von_fkey` FOREIGN KEY (`geloescht_von`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `idv_papierkorb` ADD CONSTRAINT `idv_papierkorb_wiederhergestellt_von_fkey` FOREIGN KEY (`wiederhergestellt_von`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `log` ADD CONSTRAINT `log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `personal` ADD CONSTRAINT `personal_administrativ_geloescht_von_fkey` FOREIGN KEY (`administrativ_geloescht_von`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `personal` ADD CONSTRAINT `personal_dienststelle_id_fkey` FOREIGN KEY (`dienststelle_id`) REFERENCES `dienststellen` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `personal_audit` ADD CONSTRAINT `personal_audit_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `personal_fristen` ADD CONSTRAINT `personal_fristen_personalnummer_fkey` FOREIGN KEY (`personalnummer`) REFERENCES `personal` (`personalnummer`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `personal_rangantraege` ADD CONSTRAINT `personal_rangantraege_antragsteller_id_fkey` FOREIGN KEY (`antragsteller_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `personal_rangantraege` ADD CONSTRAINT `personal_rangantraege_entscheider_id_fkey` FOREIGN KEY (`entscheider_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `personal_rangantraege` ADD CONSTRAINT `personal_rangantraege_personalnummer_fkey` FOREIGN KEY (`personalnummer`) REFERENCES `personal` (`personalnummer`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `personalnummer_neubelegungen` ADD CONSTRAINT `personalnummer_neubelegungen_vergeben_von_fkey` FOREIGN KEY (`vergeben_von`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `portal_design_personal` ADD CONSTRAINT `portal_design_personal_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `portal_meldung_empfaenger` ADD CONSTRAINT `portal_meldung_empfaenger_meldung_id_fkey` FOREIGN KEY (`meldung_id`) REFERENCES `portal_meldungen` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `portal_meldung_empfaenger` ADD CONSTRAINT `portal_meldung_empfaenger_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `portal_meldungen` ADD CONSTRAINT `portal_meldungen_absender_id_fkey` FOREIGN KEY (`absender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `role_perms` ADD CONSTRAINT `role_perms_rolle_fkey` FOREIGN KEY (`rolle`) REFERENCES `roles` (`name`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `routine_archiv` ADD CONSTRAINT `routine_archiv_archiviert_von_fkey` FOREIGN KEY (`archiviert_von`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE `routine_archiv` ADD CONSTRAINT `routine_archiv_routine_id_fkey` FOREIGN KEY (`routine_id`) REFERENCES `routine` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `sonderfunktionen` ADD CONSTRAINT `sonderfunktionen_personalnummer_fkey` FOREIGN KEY (`personalnummer`) REFERENCES `personal` (`personalnummer`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `user_favoriten` ADD CONSTRAINT `user_favoriten_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `user_perms` ADD CONSTRAINT `user_perms_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE `users` ADD CONSTRAINT `users_rolle_fkey` FOREIGN KEY (`rolle`) REFERENCES `roles` (`name`) ON DELETE RESTRICT ON UPDATE RESTRICT;

SET FOREIGN_KEY_CHECKS = 1;

-- STEP 2: Optimistic locking revision columns/triggers
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

-- STEP 3: PHP server-side security tables
-- MySQL 8: additional security tables needed by the PHP-only runtime.
-- Run after mysql8-schema.sql, mysql8 data import, and mysql8-revisions.sql.
CREATE TABLE IF NOT EXISTS `idv_login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ip_hash` BINARY(32) NOT NULL,
  `zeit` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idv_login_attempts_ip_time` (`ip_hash`,`zeit`),
  KEY `idv_login_attempts_cleanup` (`zeit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- STEP 4: Business and audit triggers; SQL is intentionally ready before private data import.
-- MySQL 8 business behavior: native audit, dynamic group mapping and historical termination snapshots.

-- Active only for application sessions. Export/import tools set @idv_migration=1 to preserve exact legacy rows.

-- The authenticated PHP router sets @idv_actor to the current user ID before changes.



CREATE TRIGGER idv_group_personal_bi BEFORE INSERT ON personal FOR EACH ROW
SET NEW.gruppe=CASE WHEN COALESCE(@idv_migration,0)=1 THEN NEW.gruppe
WHEN NEW.gruppe IS NULL OR NEW.gruppe='' OR NEW.gruppe='Nicht zugeordnet' OR NEW.gruppe='Hauptberuf' THEN CASE WHEN NEW.personalnummer BETWEEN 1 AND 5 THEN 'Leitungsdienst' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeirat','Polizeiratanwärter') THEN 'Polizeirat' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeimeisteranwärter','Polizeimeister','Polizeiobermeister','Polizeihauptmeister','Polizeihauptmeister AZ','Polizeihauptmeister mit Amtszulage') THEN 'Mittlerer Dienst' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeikommissaranwärter','Kriminalkommissaranwärter','Polizeikommissar','Kriminalkommissar','Polizeioberkommissar','Kriminaloberkommissar','Polizeihauptkommissar','Kriminalhauptkommissar','Polizeihauptkommissar A12','Erster Polizeihauptkommissar') THEN 'Gehobener Dienst' ELSE 'Nicht zugeordnet' END
ELSE NEW.gruppe END;

CREATE TRIGGER idv_group_personal_bu BEFORE UPDATE ON personal FOR EACH ROW
SET NEW.gruppe=CASE WHEN COALESCE(@idv_migration,0)=1 THEN NEW.gruppe
WHEN NOT (NEW.gruppe <=> OLD.gruppe) THEN
 CASE WHEN NEW.gruppe IS NULL OR NEW.gruppe='' OR NEW.gruppe='Nicht zugeordnet' OR NEW.gruppe='Hauptberuf' THEN CASE WHEN NEW.personalnummer BETWEEN 1 AND 5 THEN 'Leitungsdienst' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeirat','Polizeiratanwärter') THEN 'Polizeirat' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeimeisteranwärter','Polizeimeister','Polizeiobermeister','Polizeihauptmeister','Polizeihauptmeister AZ','Polizeihauptmeister mit Amtszulage') THEN 'Mittlerer Dienst' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeikommissaranwärter','Kriminalkommissaranwärter','Polizeikommissar','Kriminalkommissar','Polizeioberkommissar','Kriminaloberkommissar','Polizeihauptkommissar','Kriminalhauptkommissar','Polizeihauptkommissar A12','Erster Polizeihauptkommissar') THEN 'Gehobener Dienst' ELSE 'Nicht zugeordnet' END ELSE NEW.gruppe END
WHEN (NOT (NEW.dienstgrad <=> OLD.dienstgrad) OR NOT (NEW.personalnummer <=> OLD.personalnummer))
 AND OLD.gruppe=CASE WHEN OLD.personalnummer BETWEEN 1 AND 5 THEN 'Leitungsdienst' WHEN TRIM(COALESCE(OLD.dienstgrad,'')) IN ('Polizeirat','Polizeiratanwärter') THEN 'Polizeirat' WHEN TRIM(COALESCE(OLD.dienstgrad,'')) IN ('Polizeimeisteranwärter','Polizeimeister','Polizeiobermeister','Polizeihauptmeister','Polizeihauptmeister AZ','Polizeihauptmeister mit Amtszulage') THEN 'Mittlerer Dienst' WHEN TRIM(COALESCE(OLD.dienstgrad,'')) IN ('Polizeikommissaranwärter','Kriminalkommissaranwärter','Polizeikommissar','Kriminalkommissar','Polizeioberkommissar','Kriminaloberkommissar','Polizeihauptkommissar','Kriminalhauptkommissar','Polizeihauptkommissar A12','Erster Polizeihauptkommissar') THEN 'Gehobener Dienst' ELSE 'Nicht zugeordnet' END THEN CASE WHEN NEW.personalnummer BETWEEN 1 AND 5 THEN 'Leitungsdienst' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeirat','Polizeiratanwärter') THEN 'Polizeirat' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeimeisteranwärter','Polizeimeister','Polizeiobermeister','Polizeihauptmeister','Polizeihauptmeister AZ','Polizeihauptmeister mit Amtszulage') THEN 'Mittlerer Dienst' WHEN TRIM(COALESCE(NEW.dienstgrad,'')) IN ('Polizeikommissaranwärter','Kriminalkommissaranwärter','Polizeikommissar','Kriminalkommissar','Polizeioberkommissar','Kriminaloberkommissar','Polizeihauptkommissar','Kriminalhauptkommissar','Polizeihauptkommissar A12','Erster Polizeihauptkommissar') THEN 'Gehobener Dienst' ELSE 'Nicht zugeordnet' END
ELSE NEW.gruppe END;

CREATE TRIGGER idv_snapshot_kuendigung_bi BEFORE INSERT ON kuendigungen FOR EACH ROW
SET NEW.personal_snapshot=CASE WHEN COALESCE(@idv_migration,0)=1 OR NEW.personal_snapshot IS NOT NULL
THEN NEW.personal_snapshot ELSE JSON_OBJECT(
 'quelle',CASE WHEN EXISTS(SELECT 1 FROM personal p WHERE p.personalnummer=NEW.personalnummer) THEN 'bei_erstellung' ELSE 'ohne_personalakte' END,
 'gesichert_am',UTC_TIMESTAMP(6),
 'personal',(SELECT JSON_OBJECT('personalnummer',p.personalnummer,'gruppe',p.gruppe,'status',p.status,'vorname',p.vorname,'nachname',p.nachname,'geburtsdatum',p.geburtsdatum,'handy',p.handy,'waffenschein',p.waffenschein,'spind',p.spind,'nebenjob',p.nebenjob,'dienstgrad',p.dienstgrad,'eintrittsdatum',p.eintrittsdatum,'arbeitsvertrag',p.arbeitsvertrag,'ernennungsurkunde',p.ernennungsurkunde,'urlaub_von',p.urlaub_von,'urlaub_bis',p.urlaub_bis,'urlaub_tage',p.urlaub_tage,'bemerkung',p.bemerkung,'rsa',p.rsa,'letzte_befoerderung',p.letzte_befoerderung,'naechste_befoerderung',p.naechste_befoerderung,'por_status',p.por_status,'por_notiz',p.por_notiz,'por_am',p.por_am,'arbeitsvertrag_url',p.arbeitsvertrag_url,'ernennungsurkunde_url',p.ernennungsurkunde_url,'beschaeftigungsart',p.beschaeftigungsart,'dienststelle_id',p.dienststelle_id,'administrativ_geloescht_am',p.administrativ_geloescht_am,'administrativ_geloescht_von',p.administrativ_geloescht_von) FROM personal p WHERE p.personalnummer=NEW.personalnummer),
 'generierte_dokumente',COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('typ',d.typ,'titel',d.titel,'url',d.url,'erstellt',d.erstellt)) FROM generierte_dokumente d WHERE d.personalnummer=NEW.personalnummer),JSON_ARRAY())) END;

CREATE TRIGGER idv_journal_personal_i AFTER INSERT ON personal FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'personal',CAST(NEW.personalnummer AS CHAR),NEW.personalnummer,'Angelegt',JSON_OBJECT('vorname',JSON_OBJECT('alt',NULL,'neu',NEW.vorname),'nachname',JSON_OBJECT('alt',NULL,'neu',NEW.nachname),'dienstgrad',JSON_OBJECT('alt',NULL,'neu',NEW.dienstgrad),'status',JSON_OBJECT('alt',NULL,'neu',NEW.status),'gruppe',JSON_OBJECT('alt',NULL,'neu',NEW.gruppe),'beschaeftigungsart',JSON_OBJECT('alt',NULL,'neu',NEW.beschaeftigungsart),'eintrittsdatum',JSON_OBJECT('alt',NULL,'neu',NEW.eintrittsdatum),'letzte_befoerderung',JSON_OBJECT('alt',NULL,'neu',NEW.letzte_befoerderung),'naechste_befoerderung',JSON_OBJECT('alt',NULL,'neu',NEW.naechste_befoerderung),'por_status',JSON_OBJECT('alt',NULL,'neu',NEW.por_status),'waffenschein',JSON_OBJECT('alt',NULL,'neu',NEW.waffenschein),'spind',JSON_OBJECT('alt',NULL,'neu',NEW.spind),'rsa',JSON_OBJECT('alt',NULL,'neu',NEW.rsa),'nebenjob',JSON_OBJECT('alt',NULL,'neu',NEW.nebenjob)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_personal_u AFTER UPDATE ON personal FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'personal',CAST(NEW.personalnummer AS CHAR),NEW.personalnummer,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.vorname <=> NEW.vorname),JSON_OBJECT('vorname',JSON_OBJECT('alt',OLD.vorname,'neu',NEW.vorname)),JSON_OBJECT()),IF(NOT (OLD.nachname <=> NEW.nachname),JSON_OBJECT('nachname',JSON_OBJECT('alt',OLD.nachname,'neu',NEW.nachname)),JSON_OBJECT()),IF(NOT (OLD.dienstgrad <=> NEW.dienstgrad),JSON_OBJECT('dienstgrad',JSON_OBJECT('alt',OLD.dienstgrad,'neu',NEW.dienstgrad)),JSON_OBJECT()),IF(NOT (OLD.status <=> NEW.status),JSON_OBJECT('status',JSON_OBJECT('alt',OLD.status,'neu',NEW.status)),JSON_OBJECT()),IF(NOT (OLD.gruppe <=> NEW.gruppe),JSON_OBJECT('gruppe',JSON_OBJECT('alt',OLD.gruppe,'neu',NEW.gruppe)),JSON_OBJECT()),IF(NOT (OLD.beschaeftigungsart <=> NEW.beschaeftigungsart),JSON_OBJECT('beschaeftigungsart',JSON_OBJECT('alt',OLD.beschaeftigungsart,'neu',NEW.beschaeftigungsart)),JSON_OBJECT()),IF(NOT (OLD.eintrittsdatum <=> NEW.eintrittsdatum),JSON_OBJECT('eintrittsdatum',JSON_OBJECT('alt',OLD.eintrittsdatum,'neu',NEW.eintrittsdatum)),JSON_OBJECT()),IF(NOT (OLD.letzte_befoerderung <=> NEW.letzte_befoerderung),JSON_OBJECT('letzte_befoerderung',JSON_OBJECT('alt',OLD.letzte_befoerderung,'neu',NEW.letzte_befoerderung)),JSON_OBJECT()),IF(NOT (OLD.naechste_befoerderung <=> NEW.naechste_befoerderung),JSON_OBJECT('naechste_befoerderung',JSON_OBJECT('alt',OLD.naechste_befoerderung,'neu',NEW.naechste_befoerderung)),JSON_OBJECT()),IF(NOT (OLD.por_status <=> NEW.por_status),JSON_OBJECT('por_status',JSON_OBJECT('alt',OLD.por_status,'neu',NEW.por_status)),JSON_OBJECT()),IF(NOT (OLD.waffenschein <=> NEW.waffenschein),JSON_OBJECT('waffenschein',JSON_OBJECT('alt',OLD.waffenschein,'neu',NEW.waffenschein)),JSON_OBJECT()),IF(NOT (OLD.spind <=> NEW.spind),JSON_OBJECT('spind',JSON_OBJECT('alt',OLD.spind,'neu',NEW.spind)),JSON_OBJECT()),IF(NOT (OLD.rsa <=> NEW.rsa),JSON_OBJECT('rsa',JSON_OBJECT('alt',OLD.rsa,'neu',NEW.rsa)),JSON_OBJECT()),IF(NOT (OLD.nebenjob <=> NEW.nebenjob),JSON_OBJECT('nebenjob',JSON_OBJECT('alt',OLD.nebenjob,'neu',NEW.nebenjob)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.vorname <=> NEW.vorname) OR NOT (OLD.nachname <=> NEW.nachname) OR NOT (OLD.dienstgrad <=> NEW.dienstgrad) OR NOT (OLD.status <=> NEW.status) OR NOT (OLD.gruppe <=> NEW.gruppe) OR NOT (OLD.beschaeftigungsart <=> NEW.beschaeftigungsart) OR NOT (OLD.eintrittsdatum <=> NEW.eintrittsdatum) OR NOT (OLD.letzte_befoerderung <=> NEW.letzte_befoerderung) OR NOT (OLD.naechste_befoerderung <=> NEW.naechste_befoerderung) OR NOT (OLD.por_status <=> NEW.por_status) OR NOT (OLD.waffenschein <=> NEW.waffenschein) OR NOT (OLD.spind <=> NEW.spind) OR NOT (OLD.rsa <=> NEW.rsa) OR NOT (OLD.nebenjob <=> NEW.nebenjob));

CREATE TRIGGER idv_journal_personal_d AFTER DELETE ON personal FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'personal',CAST(OLD.personalnummer AS CHAR),OLD.personalnummer,'Entfernt',JSON_OBJECT('vorname',JSON_OBJECT('alt',OLD.vorname,'neu',NULL),'nachname',JSON_OBJECT('alt',OLD.nachname,'neu',NULL),'dienstgrad',JSON_OBJECT('alt',OLD.dienstgrad,'neu',NULL),'status',JSON_OBJECT('alt',OLD.status,'neu',NULL),'gruppe',JSON_OBJECT('alt',OLD.gruppe,'neu',NULL),'beschaeftigungsart',JSON_OBJECT('alt',OLD.beschaeftigungsart,'neu',NULL),'eintrittsdatum',JSON_OBJECT('alt',OLD.eintrittsdatum,'neu',NULL),'letzte_befoerderung',JSON_OBJECT('alt',OLD.letzte_befoerderung,'neu',NULL),'naechste_befoerderung',JSON_OBJECT('alt',OLD.naechste_befoerderung,'neu',NULL),'por_status',JSON_OBJECT('alt',OLD.por_status,'neu',NULL),'waffenschein',JSON_OBJECT('alt',OLD.waffenschein,'neu',NULL),'spind',JSON_OBJECT('alt',OLD.spind,'neu',NULL),'rsa',JSON_OBJECT('alt',OLD.rsa,'neu',NULL),'nebenjob',JSON_OBJECT('alt',OLD.nebenjob,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_kuendigungen_i AFTER INSERT ON kuendigungen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'kuendigungen',CAST(NEW.id AS CHAR),NEW.personalnummer,'Angelegt',JSON_OBJECT('vorname',JSON_OBJECT('alt',NULL,'neu',NEW.vorname),'nachname',JSON_OBJECT('alt',NULL,'neu',NEW.nachname),'rang',JSON_OBJECT('alt',NULL,'neu',NEW.rang),'grund',JSON_OBJECT('alt',NULL,'neu',NEW.grund),'kuendigungsdatum',JSON_OBJECT('alt',NULL,'neu',NEW.kuendigungsdatum),'waffe',JSON_OBJECT('alt',NULL,'neu',NEW.waffe),'copnet',JSON_OBJECT('alt',NULL,'neu',NEW.copnet),'emd',JSON_OBJECT('alt',NULL,'neu',NEW.emd),'ic',JSON_OBJECT('alt',NULL,'neu',NEW.ic),'discord',JSON_OBJECT('alt',NULL,'neu',NEW.discord),'dienstgegenstaende',JSON_OBJECT('alt',NULL,'neu',NEW.dienstgegenstaende),'anzeige',JSON_OBJECT('alt',NULL,'neu',NEW.anzeige),'vertrag',JSON_OBJECT('alt',NULL,'neu',NEW.vertrag),'urkunde',JSON_OBJECT('alt',NULL,'neu',NEW.urkunde),'zeugnis',JSON_OBJECT('alt',NULL,'neu',NEW.zeugnis),'kuendigung',JSON_OBJECT('alt',NULL,'neu',NEW.kuendigung)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_kuendigungen_u AFTER UPDATE ON kuendigungen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'kuendigungen',CAST(NEW.id AS CHAR),NEW.personalnummer,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.vorname <=> NEW.vorname),JSON_OBJECT('vorname',JSON_OBJECT('alt',OLD.vorname,'neu',NEW.vorname)),JSON_OBJECT()),IF(NOT (OLD.nachname <=> NEW.nachname),JSON_OBJECT('nachname',JSON_OBJECT('alt',OLD.nachname,'neu',NEW.nachname)),JSON_OBJECT()),IF(NOT (OLD.rang <=> NEW.rang),JSON_OBJECT('rang',JSON_OBJECT('alt',OLD.rang,'neu',NEW.rang)),JSON_OBJECT()),IF(NOT (OLD.grund <=> NEW.grund),JSON_OBJECT('grund',JSON_OBJECT('alt',OLD.grund,'neu',NEW.grund)),JSON_OBJECT()),IF(NOT (OLD.kuendigungsdatum <=> NEW.kuendigungsdatum),JSON_OBJECT('kuendigungsdatum',JSON_OBJECT('alt',OLD.kuendigungsdatum,'neu',NEW.kuendigungsdatum)),JSON_OBJECT()),IF(NOT (OLD.waffe <=> NEW.waffe),JSON_OBJECT('waffe',JSON_OBJECT('alt',OLD.waffe,'neu',NEW.waffe)),JSON_OBJECT()),IF(NOT (OLD.copnet <=> NEW.copnet),JSON_OBJECT('copnet',JSON_OBJECT('alt',OLD.copnet,'neu',NEW.copnet)),JSON_OBJECT()),IF(NOT (OLD.emd <=> NEW.emd),JSON_OBJECT('emd',JSON_OBJECT('alt',OLD.emd,'neu',NEW.emd)),JSON_OBJECT()),IF(NOT (OLD.ic <=> NEW.ic),JSON_OBJECT('ic',JSON_OBJECT('alt',OLD.ic,'neu',NEW.ic)),JSON_OBJECT()),IF(NOT (OLD.discord <=> NEW.discord),JSON_OBJECT('discord',JSON_OBJECT('alt',OLD.discord,'neu',NEW.discord)),JSON_OBJECT()),IF(NOT (OLD.dienstgegenstaende <=> NEW.dienstgegenstaende),JSON_OBJECT('dienstgegenstaende',JSON_OBJECT('alt',OLD.dienstgegenstaende,'neu',NEW.dienstgegenstaende)),JSON_OBJECT()),IF(NOT (OLD.anzeige <=> NEW.anzeige),JSON_OBJECT('anzeige',JSON_OBJECT('alt',OLD.anzeige,'neu',NEW.anzeige)),JSON_OBJECT()),IF(NOT (OLD.vertrag <=> NEW.vertrag),JSON_OBJECT('vertrag',JSON_OBJECT('alt',OLD.vertrag,'neu',NEW.vertrag)),JSON_OBJECT()),IF(NOT (OLD.urkunde <=> NEW.urkunde),JSON_OBJECT('urkunde',JSON_OBJECT('alt',OLD.urkunde,'neu',NEW.urkunde)),JSON_OBJECT()),IF(NOT (OLD.zeugnis <=> NEW.zeugnis),JSON_OBJECT('zeugnis',JSON_OBJECT('alt',OLD.zeugnis,'neu',NEW.zeugnis)),JSON_OBJECT()),IF(NOT (OLD.kuendigung <=> NEW.kuendigung),JSON_OBJECT('kuendigung',JSON_OBJECT('alt',OLD.kuendigung,'neu',NEW.kuendigung)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.vorname <=> NEW.vorname) OR NOT (OLD.nachname <=> NEW.nachname) OR NOT (OLD.rang <=> NEW.rang) OR NOT (OLD.grund <=> NEW.grund) OR NOT (OLD.kuendigungsdatum <=> NEW.kuendigungsdatum) OR NOT (OLD.waffe <=> NEW.waffe) OR NOT (OLD.copnet <=> NEW.copnet) OR NOT (OLD.emd <=> NEW.emd) OR NOT (OLD.ic <=> NEW.ic) OR NOT (OLD.discord <=> NEW.discord) OR NOT (OLD.dienstgegenstaende <=> NEW.dienstgegenstaende) OR NOT (OLD.anzeige <=> NEW.anzeige) OR NOT (OLD.vertrag <=> NEW.vertrag) OR NOT (OLD.urkunde <=> NEW.urkunde) OR NOT (OLD.zeugnis <=> NEW.zeugnis) OR NOT (OLD.kuendigung <=> NEW.kuendigung));

CREATE TRIGGER idv_journal_kuendigungen_d AFTER DELETE ON kuendigungen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'kuendigungen',CAST(OLD.id AS CHAR),OLD.personalnummer,'Entfernt',JSON_OBJECT('vorname',JSON_OBJECT('alt',OLD.vorname,'neu',NULL),'nachname',JSON_OBJECT('alt',OLD.nachname,'neu',NULL),'rang',JSON_OBJECT('alt',OLD.rang,'neu',NULL),'grund',JSON_OBJECT('alt',OLD.grund,'neu',NULL),'kuendigungsdatum',JSON_OBJECT('alt',OLD.kuendigungsdatum,'neu',NULL),'waffe',JSON_OBJECT('alt',OLD.waffe,'neu',NULL),'copnet',JSON_OBJECT('alt',OLD.copnet,'neu',NULL),'emd',JSON_OBJECT('alt',OLD.emd,'neu',NULL),'ic',JSON_OBJECT('alt',OLD.ic,'neu',NULL),'discord',JSON_OBJECT('alt',OLD.discord,'neu',NULL),'dienstgegenstaende',JSON_OBJECT('alt',OLD.dienstgegenstaende,'neu',NULL),'anzeige',JSON_OBJECT('alt',OLD.anzeige,'neu',NULL),'vertrag',JSON_OBJECT('alt',OLD.vertrag,'neu',NULL),'urkunde',JSON_OBJECT('alt',OLD.urkunde,'neu',NULL),'zeugnis',JSON_OBJECT('alt',OLD.zeugnis,'neu',NULL),'kuendigung',JSON_OBJECT('alt',OLD.kuendigung,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_disziplin_i AFTER INSERT ON disziplin FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'disziplin',CAST(NEW.personalnummer AS CHAR),NEW.personalnummer,'Angelegt',JSON_OBJECT('slots',JSON_OBJECT('alt',NULL,'neu',NEW.slots),'bemerkung',JSON_OBJECT('alt',NULL,'neu',NEW.bemerkung)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_disziplin_u AFTER UPDATE ON disziplin FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'disziplin',CAST(NEW.personalnummer AS CHAR),NEW.personalnummer,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.slots <=> NEW.slots),JSON_OBJECT('slots',JSON_OBJECT('alt',OLD.slots,'neu',NEW.slots)),JSON_OBJECT()),IF(NOT (OLD.bemerkung <=> NEW.bemerkung),JSON_OBJECT('bemerkung',JSON_OBJECT('alt',OLD.bemerkung,'neu',NEW.bemerkung)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.slots <=> NEW.slots) OR NOT (OLD.bemerkung <=> NEW.bemerkung));

CREATE TRIGGER idv_journal_disziplin_d AFTER DELETE ON disziplin FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'disziplin',CAST(OLD.personalnummer AS CHAR),OLD.personalnummer,'Entfernt',JSON_OBJECT('slots',JSON_OBJECT('alt',OLD.slots,'neu',NULL),'bemerkung',JSON_OBJECT('alt',OLD.bemerkung,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_sonderfunktionen_i AFTER INSERT ON sonderfunktionen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'sonderfunktionen',CAST(NEW.personalnummer AS CHAR),NEW.personalnummer,'Angelegt',JSON_OBJECT('leitung',JSON_OBJECT('alt',NULL,'neu',NEW.leitung),'sonstige',JSON_OBJECT('alt',NULL,'neu',NEW.sonstige),'werte',JSON_OBJECT('alt',NULL,'neu',NEW.werte)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_sonderfunktionen_u AFTER UPDATE ON sonderfunktionen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'sonderfunktionen',CAST(NEW.personalnummer AS CHAR),NEW.personalnummer,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.leitung <=> NEW.leitung),JSON_OBJECT('leitung',JSON_OBJECT('alt',OLD.leitung,'neu',NEW.leitung)),JSON_OBJECT()),IF(NOT (OLD.sonstige <=> NEW.sonstige),JSON_OBJECT('sonstige',JSON_OBJECT('alt',OLD.sonstige,'neu',NEW.sonstige)),JSON_OBJECT()),IF(NOT (OLD.werte <=> NEW.werte),JSON_OBJECT('werte',JSON_OBJECT('alt',OLD.werte,'neu',NEW.werte)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.leitung <=> NEW.leitung) OR NOT (OLD.sonstige <=> NEW.sonstige) OR NOT (OLD.werte <=> NEW.werte));

CREATE TRIGGER idv_journal_sonderfunktionen_d AFTER DELETE ON sonderfunktionen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'sonderfunktionen',CAST(OLD.personalnummer AS CHAR),OLD.personalnummer,'Entfernt',JSON_OBJECT('leitung',JSON_OBJECT('alt',OLD.leitung,'neu',NULL),'sonstige',JSON_OBJECT('alt',OLD.sonstige,'neu',NULL),'werte',JSON_OBJECT('alt',OLD.werte,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_checklisten_i AFTER INSERT ON checklisten FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'checklisten',CAST(NEW.name AS CHAR),NULL,'Angelegt',JSON_OBJECT('aufgaben',JSON_OBJECT('alt',NULL,'neu',NEW.aufgaben),'sortierung',JSON_OBJECT('alt',NULL,'neu',NEW.sortierung)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_checklisten_u AFTER UPDATE ON checklisten FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'checklisten',CAST(NEW.name AS CHAR),NULL,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.aufgaben <=> NEW.aufgaben),JSON_OBJECT('aufgaben',JSON_OBJECT('alt',OLD.aufgaben,'neu',NEW.aufgaben)),JSON_OBJECT()),IF(NOT (OLD.sortierung <=> NEW.sortierung),JSON_OBJECT('sortierung',JSON_OBJECT('alt',OLD.sortierung,'neu',NEW.sortierung)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.aufgaben <=> NEW.aufgaben) OR NOT (OLD.sortierung <=> NEW.sortierung));

CREATE TRIGGER idv_journal_checklisten_d AFTER DELETE ON checklisten FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'checklisten',CAST(OLD.name AS CHAR),NULL,'Entfernt',JSON_OBJECT('aufgaben',JSON_OBJECT('alt',OLD.aufgaben,'neu',NULL),'sortierung',JSON_OBJECT('alt',OLD.sortierung,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_textbausteine_i AFTER INSERT ON textbausteine FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'textbausteine',CAST(NEW.schluessel AS CHAR),NULL,'Angelegt',JSON_OBJECT('kategorie',JSON_OBJECT('alt',NULL,'neu',NEW.kategorie),'titel',JSON_OBJECT('alt',NULL,'neu',NEW.titel),'inhalt',JSON_OBJECT('alt',NULL,'neu',NEW.inhalt),'geloescht',JSON_OBJECT('alt',NULL,'neu',NEW.geloescht)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_textbausteine_u AFTER UPDATE ON textbausteine FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'textbausteine',CAST(NEW.schluessel AS CHAR),NULL,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.kategorie <=> NEW.kategorie),JSON_OBJECT('kategorie',JSON_OBJECT('alt',OLD.kategorie,'neu',NEW.kategorie)),JSON_OBJECT()),IF(NOT (OLD.titel <=> NEW.titel),JSON_OBJECT('titel',JSON_OBJECT('alt',OLD.titel,'neu',NEW.titel)),JSON_OBJECT()),IF(NOT (OLD.inhalt <=> NEW.inhalt),JSON_OBJECT('inhalt',JSON_OBJECT('alt',OLD.inhalt,'neu',NEW.inhalt)),JSON_OBJECT()),IF(NOT (OLD.geloescht <=> NEW.geloescht),JSON_OBJECT('geloescht',JSON_OBJECT('alt',OLD.geloescht,'neu',NEW.geloescht)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.kategorie <=> NEW.kategorie) OR NOT (OLD.titel <=> NEW.titel) OR NOT (OLD.inhalt <=> NEW.inhalt) OR NOT (OLD.geloescht <=> NEW.geloescht));

CREATE TRIGGER idv_journal_textbausteine_d AFTER DELETE ON textbausteine FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'textbausteine',CAST(OLD.schluessel AS CHAR),NULL,'Entfernt',JSON_OBJECT('kategorie',JSON_OBJECT('alt',OLD.kategorie,'neu',NULL),'titel',JSON_OBJECT('alt',OLD.titel,'neu',NULL),'inhalt',JSON_OBJECT('alt',OLD.inhalt,'neu',NULL),'geloescht',JSON_OBJECT('alt',OLD.geloescht,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_routine_i AFTER INSERT ON routine FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'routine',CAST(NEW.id AS CHAR),NEW.personalnummer,'Angelegt',JSON_OBJECT('tage',JSON_OBJECT('alt',NULL,'neu',NEW.tage),'personen',JSON_OBJECT('alt',NULL,'neu',NEW.personen)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_routine_u AFTER UPDATE ON routine FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'routine',CAST(NEW.id AS CHAR),NEW.personalnummer,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.tage <=> NEW.tage),JSON_OBJECT('tage',JSON_OBJECT('alt',OLD.tage,'neu',NEW.tage)),JSON_OBJECT()),IF(NOT (OLD.personen <=> NEW.personen),JSON_OBJECT('personen',JSON_OBJECT('alt',OLD.personen,'neu',NEW.personen)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.tage <=> NEW.tage) OR NOT (OLD.personen <=> NEW.personen));

CREATE TRIGGER idv_journal_routine_d AFTER DELETE ON routine FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'routine',CAST(OLD.id AS CHAR),OLD.personalnummer,'Entfernt',JSON_OBJECT('tage',JSON_OBJECT('alt',OLD.tage,'neu',NULL),'personen',JSON_OBJECT('alt',OLD.personen,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_sonderzahlungen_i AFTER INSERT ON sonderzahlungen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'sonderzahlungen',CAST(NEW.id AS CHAR),NEW.personalnummer,'Angelegt',JSON_OBJECT('erhalten',JSON_OBJECT('alt',NULL,'neu',NEW.erhalten),'datum',JSON_OBJECT('alt',NULL,'neu',NEW.datum),'betrag',JSON_OBJECT('alt',NULL,'neu',NEW.betrag),'grund',JSON_OBJECT('alt',NULL,'neu',NEW.grund)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;

CREATE TRIGGER idv_journal_sonderzahlungen_u AFTER UPDATE ON sonderzahlungen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'sonderzahlungen',CAST(NEW.id AS CHAR),NEW.personalnummer,'Bearbeitet',JSON_MERGE_PATCH(JSON_OBJECT(),IF(NOT (OLD.erhalten <=> NEW.erhalten),JSON_OBJECT('erhalten',JSON_OBJECT('alt',OLD.erhalten,'neu',NEW.erhalten)),JSON_OBJECT()),IF(NOT (OLD.datum <=> NEW.datum),JSON_OBJECT('datum',JSON_OBJECT('alt',OLD.datum,'neu',NEW.datum)),JSON_OBJECT()),IF(NOT (OLD.betrag <=> NEW.betrag),JSON_OBJECT('betrag',JSON_OBJECT('alt',OLD.betrag,'neu',NEW.betrag)),JSON_OBJECT()),IF(NOT (OLD.grund <=> NEW.grund),JSON_OBJECT('grund',JSON_OBJECT('alt',OLD.grund,'neu',NEW.grund)),JSON_OBJECT())),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1 AND (NOT (OLD.erhalten <=> NEW.erhalten) OR NOT (OLD.datum <=> NEW.datum) OR NOT (OLD.betrag <=> NEW.betrag) OR NOT (OLD.grund <=> NEW.grund));

CREATE TRIGGER idv_journal_sonderzahlungen_d AFTER DELETE ON sonderzahlungen FOR EACH ROW
INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
SELECT 'sonderzahlungen',CAST(OLD.id AS CHAR),OLD.personalnummer,'Entfernt',JSON_OBJECT('erhalten',JSON_OBJECT('alt',OLD.erhalten,'neu',NULL),'datum',JSON_OBJECT('alt',OLD.datum,'neu',NULL),'betrag',JSON_OBJECT('alt',OLD.betrag,'neu',NULL),'grund',JSON_OBJECT('alt',OLD.grund,'neu',NULL)),
 NULLIF(CAST(@idv_actor AS UNSIGNED),0)
WHERE COALESCE(@idv_migration,0)<>1;
