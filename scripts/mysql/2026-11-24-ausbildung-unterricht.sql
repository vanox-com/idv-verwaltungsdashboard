-- Neue, getrennte Unterrichts-Sitzungen (MySQL 8, additiv).
-- Keine Änderungen an bestehenden Benutzer-/Personal-/Ausbildungsdatensätzen.
-- Vor der Installation muss die verschlüsselte Backup-Übersicht eine aktuelle Sicherung bestätigen.
CREATE TABLE IF NOT EXISTS ausbildung_unterricht (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  modul_code VARCHAR(12) NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  ausbilder_user_id INT NOT NULL,
  einladung_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  teilnehmer_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  angebot TEXT NULL,
  antwort TEXT NULL,
  beendet TINYINT(1) NOT NULL DEFAULT 0,
  erstellt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ablauf DATETIME(6) NOT NULL,
  aktualisiert DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY ausbildung_unterricht_einladung_uq (einladung_hash),
  KEY ausbildung_unterricht_ablauf_idx (ablauf),
  KEY ausbildung_unterricht_ausbilder_idx (ausbilder_user_id),
  CONSTRAINT ausbildung_unterricht_modul_fk FOREIGN KEY (modul_code) REFERENCES ausbildung_module(code) ON DELETE RESTRICT,
  CONSTRAINT ausbildung_unterricht_material_fk FOREIGN KEY (material_id) REFERENCES ausbildung_materialien(id) ON DELETE RESTRICT,
  CONSTRAINT ausbildung_unterricht_user_fk FOREIGN KEY (ausbilder_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
