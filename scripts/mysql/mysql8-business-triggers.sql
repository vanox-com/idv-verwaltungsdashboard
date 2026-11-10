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
