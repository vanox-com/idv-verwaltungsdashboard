-- Additive DGL records. No existing data is overwritten.
CREATE TABLE IF NOT EXISTS ausbildung_dgl (
 anwaerter_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 dgl_am DATETIME(6) NULL, dgl_von VARCHAR(200) NULL,
 assistenz_am DATETIME(6) NULL, assistenz_von VARCHAR(200) NULL,
 pruefung_am DATETIME(6) NULL, pruefung_von VARCHAR(200) NULL,
 punkte DECIMAL(10,2) NULL, prozent DECIMAL(5,2) NULL,
 CONSTRAINT ausbildung_dgl_anwaerter_fk FOREIGN KEY(anwaerter_id) REFERENCES ausbildung_anwaerter(id) ON DELETE CASCADE,
 CONSTRAINT ausbildung_dgl_punkte_check CHECK(punkte IS NULL OR punkte>=0),
 CONSTRAINT ausbildung_dgl_prozent_check CHECK(prozent IS NULL OR (prozent>=0 AND prozent<=100)),
 CONSTRAINT ausbildung_dgl_pruefung_check CHECK(pruefung_am IS NULL OR (dgl_am IS NOT NULL AND assistenz_am IS NOT NULL AND punkte IS NOT NULL AND prozent IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
