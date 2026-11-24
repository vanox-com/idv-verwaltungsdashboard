-- IDV Ausbildungsabteilung: idempotente Erweiterung für bestehende MySQL-8-Installation.
-- Nach Datenbanksicherung additiv einspielen; weder bestehende Benutzer noch bestehende Polizeidaten oder Rechte überschreiben.
-- Keine realen Ausbilder-/Anwärterdaten, E-Mails, Passwörter oder Dokumentinhalte in GitHub.
SET NAMES utf8mb4;
-- Bestehende Rollen, Personen und Rechte werden NICHT bearbeitet.
-- Es entstehen ausschließlich zwei neue, eigenständige Ausbildungsrollen.
INSERT IGNORE INTO roles(name,farbe,sensibel) VALUES
 ('Ausbildungsleitung','#5aa7d8',0),
 ('Ausbilder','#5a8a9c',0);
INSERT IGNORE INTO role_perms(rolle,modul,stufe) VALUES
 ('Ausbildungsleitung','ausbildung',2),
 ('Ausbilder','ausbildung',1);

CREATE TABLE IF NOT EXISTS ausbildung_ausbilder (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 user_id INT NOT NULL,
 dienstnummer VARCHAR(32) NOT NULL,
 name VARCHAR(180) NOT NULL,
 kuerzel VARCHAR(16) NOT NULL,
 rang VARCHAR(120) NOT NULL DEFAULT '',
 funktion VARCHAR(100) NOT NULL DEFAULT 'Ausbilder auf Probe',
 eintritt DATE NULL,
 email VARCHAR(254) NOT NULL DEFAULT '',
 notiz TEXT NULL,
 gewicht DECIMAL(4,2) NOT NULL DEFAULT 0.50,
 kompetenzen JSON NOT NULL DEFAULT ('[]'),
 aktiv TINYINT(1) NOT NULL DEFAULT 1,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 aktualisiert DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(id),
 UNIQUE KEY ausbildung_ausbilder_user_uq(user_id),
 KEY ausbildung_ausbilder_aktiv(aktiv),
 CONSTRAINT ausbildung_ausbilder_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ausbildung_ausbilder_gewicht CHECK(gewicht>=0 AND gewicht<=5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ausbildung_anwaerter (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 personalnummer INT NULL,
 name VARCHAR(180) NOT NULL,
 laufbahn VARCHAR(3) NOT NULL,
 nebenberuf VARCHAR(60) NOT NULL DEFAULT '',
 beginn DATE NULL,
 rsa TINYINT(1) NOT NULL DEFAULT 0,
 bemerkung TEXT NULL,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 public_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 public_aktiv TINYINT(1) NOT NULL DEFAULT 0,
 aktualisiert DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 erstellt_von INT NULL,
 PRIMARY KEY(id),
 UNIQUE KEY ausbildung_anwaerter_public_hash(public_hash),
 KEY ausbildung_anwaerter_laufbahn(laufbahn),
 KEY ausbildung_anwaerter_personalnummer(personalnummer),
 CONSTRAINT ausbildung_anwaerter_erstellt_fk FOREIGN KEY(erstellt_von) REFERENCES users(id) ON DELETE SET NULL,
 CONSTRAINT ausbildung_anwaerter_laufbahn_check CHECK(laufbahn IN ('PMA','PKA','KKA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ausbildung_module (
 code VARCHAR(12) NOT NULL PRIMARY KEY,
 laufbahn VARCHAR(3) NOT NULL,
 titel VARCHAR(160) NOT NULL,
 sortierung SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 aktiv TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ausbildung_abschluesse (
 anwaerter_id BIGINT UNSIGNED NOT NULL,
 modul_code VARCHAR(12) NOT NULL,
 ausbilder_user_id INT NULL,
 abgeschlossen TINYINT(1) NOT NULL DEFAULT 0,
 aktualisiert DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(anwaerter_id,modul_code),
 CONSTRAINT ausbildung_abschluesse_anwaerter_fk FOREIGN KEY(anwaerter_id) REFERENCES ausbildung_anwaerter(id) ON DELETE CASCADE,
 CONSTRAINT ausbildung_abschluesse_modul_fk FOREIGN KEY(modul_code) REFERENCES ausbildung_module(code) ON DELETE RESTRICT,
 CONSTRAINT ausbildung_abschluesse_user_fk FOREIGN KEY(ausbilder_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ausbildung_stimmen (
 anwaerter_id BIGINT UNSIGNED NOT NULL,
 ausbilder_user_id INT NOT NULL,
 stimme VARCHAR(4) NOT NULL,
 gewicht DECIMAL(4,2) NOT NULL,
 aktualisiert DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(anwaerter_id,ausbilder_user_id),
 CONSTRAINT ausbildung_stimmen_anwaerter_fk FOREIGN KEY(anwaerter_id) REFERENCES ausbildung_anwaerter(id) ON DELETE CASCADE,
 CONSTRAINT ausbildung_stimmen_user_fk FOREIGN KEY(ausbilder_user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ausbildung_stimmen_wert CHECK(stimme IN ('Ja','Nein')),
 CONSTRAINT ausbildung_stimmen_gewicht CHECK(gewicht>=0 AND gewicht<=5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS ausbildung_materialien (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 modul_code VARCHAR(12) NULL,
 titel VARCHAR(200) NOT NULL,
 typ VARCHAR(50) NOT NULL DEFAULT 'Präsentation',
 url VARCHAR(2048) NOT NULL DEFAULT '',
 dateipfad VARCHAR(120) NULL,
 public_aktiv TINYINT(1) NOT NULL DEFAULT 0,
 aktiv TINYINT(1) NOT NULL DEFAULT 1,
 aktualisiert DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT ausbildung_materialien_modul_fk FOREIGN KEY(modul_code) REFERENCES ausbildung_module(code) ON DELETE SET NULL,
 KEY ausbildung_materialien_modul(modul_code,aktiv)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO ausbildung_module(code,laufbahn,titel,sortierung) VALUES
 ('PM.0','PMA','Einstellungsprozess',0),
 ('PM.1','PMA','Onboarding',1),
 ('PM.2','PMA','CopNet & EDV',2),
 ('PM.3','PMA','Verkehrskontrolle',3),
 ('PM.4','PMA','Verfolgungsfahrt & Hochrisikokontrolle',4),
 ('PM.5','PMA','Verhalten an Einsatzstellen',5),
 ('PM.6','PMA','ED-Behandlung & Abhandlung',6),
 ('PK.1','PKA','Grundlagen Einsatztaktik',1),
 ('PK.2','PKA','Einsatzleitung',2),
 ('PK.3','PKA','Verhandlungsführung',3),
 ('PK.4','PKA','Best Practice DGL',4);
