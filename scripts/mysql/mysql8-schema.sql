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
  `bemerkung` VARCHAR(191) NOT NULL DEFAULT '',
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
  `passwort_verschluesselt` VARCHAR(191) NOT NULL DEFAULT '',
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
  `beschreibung` VARCHAR(191) NOT NULL DEFAULT '',
  `aktiv` TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `dienststellen_name_key` (`name`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE `disziplin` (
  `personalnummer` INT NOT NULL,
  `massnahmen` JSON NOT NULL DEFAULT ('[]'),
  `slots` JSON NOT NULL DEFAULT ('[]'),
  `bemerkung` VARCHAR(191) NOT NULL DEFAULT '',
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
  `waffe` VARCHAR(191) DEFAULT 'Offen',
  `copnet` VARCHAR(191) DEFAULT 'Offen',
  `emd` VARCHAR(191) DEFAULT 'Offen',
  `ic` VARCHAR(191) DEFAULT 'Offen',
  `discord` VARCHAR(191) DEFAULT 'Offen',
  `dienstgegenstaende` VARCHAR(191) DEFAULT 'Offen',
  `anzeige` VARCHAR(191) DEFAULT 'Nein',
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
  `gruppe` VARCHAR(191) NOT NULL DEFAULT 'Hauptberuf',
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
  `por_notiz` VARCHAR(191) NOT NULL DEFAULT '',
  `por_am` DATE,
  `arbeitsvertrag_url` VARCHAR(191) NOT NULL DEFAULT '',
  `ernennungsurkunde_url` VARCHAR(191) NOT NULL DEFAULT '',
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
  `begruendung` VARCHAR(191) NOT NULL DEFAULT '',
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
  `grund` VARCHAR(191) NOT NULL DEFAULT '',
  `von` DATE,
  `bis` DATE,
  `bemerkung` VARCHAR(191) NOT NULL DEFAULT '',
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
