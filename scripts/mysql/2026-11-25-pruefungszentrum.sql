-- Additive migration; create after a verified backup. No real exam contents in Git.
CREATE TABLE IF NOT EXISTS ausbildung_pruefung_vorlagen (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 art VARCHAR(20) NOT NULL, titel VARCHAR(200) NOT NULL,
 minuten SMALLINT UNSIGNED NOT NULL, grenze DECIMAL(5,2) NOT NULL,
 fragen JSON NOT NULL, erstellt_von BIGINT UNSIGNED NOT NULL,
 erstellt_am DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(art,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ausbildung_pruefungen (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 vorlage_id BIGINT UNSIGNED NOT NULL, anwaerter_id BIGINT UNSIGNED NOT NULL,
 kandidat VARCHAR(200) NOT NULL, laufbahn VARCHAR(8) NOT NULL,
 erst BIGINT UNSIGNED NOT NULL, zweit BIGINT UNSIGNED NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'bereit',
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 token_ablauf DATETIME(6) NOT NULL, start_am DATETIME(6) NULL, ende_am DATETIME(6) NULL,
 abgabe_am DATETIME(6) NULL, revision INT UNSIGNED NOT NULL DEFAULT 0,
 antworten JSON NOT NULL, bewertung JSON NOT NULL, protokoll JSON NOT NULL,
 fokus JSON NOT NULL, ergebnis DECIMAL(7,2) NULL,
 erstellt_am DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(erst,status), INDEX(zweit,status), INDEX(anwaerter_id,status),
 FOREIGN KEY(vorlage_id) REFERENCES ausbildung_pruefung_vorlagen(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
