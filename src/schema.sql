-- Schema des Verwaltungsportals Polizeirat
-- Wird bei jedem Start ausgeführt und ist deshalb wiederholbar (IF NOT EXISTS).

/* ---------- Rollen und Rechte ---------- */

CREATE TABLE IF NOT EXISTS roles (
  name        text PRIMARY KEY,
  farbe       text NOT NULL,
  sensibel    boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS role_perms (
  rolle  text NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  modul  text NOT NULL,
  stufe  smallint NOT NULL DEFAULT 0,   -- 0 kein Recht, 1 lesen, 2 bearbeiten
  PRIMARY KEY (rolle, modul)
);

/* ---------- Zugänge ---------- */

CREATE TABLE IF NOT EXISTS users (
  id                    serial PRIMARY KEY,
  dienstnummer          text UNIQUE NOT NULL,
  anzeigename           text NOT NULL,
  rolle                 text NOT NULL REFERENCES roles(name),
  passwort_hash         text NOT NULL,
  muss_passwort_aendern boolean NOT NULL DEFAULT true,
  gesperrt              boolean NOT NULL DEFAULT false,
  erstellt              timestamptz NOT NULL DEFAULT now()
);

/* Konkrete Dienstnummer kann je Modul das Rollenrecht übersteuern.
   Kein Eintrag bedeutet: Rollenrecht erben. Eintrag mit 0 = ausdrücklich sperren. */
CREATE TABLE IF NOT EXISTS user_perms (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  modul text NOT NULL,
  stufe smallint NOT NULL CHECK(stufe IN (0,1,2)),
  PRIMARY KEY (user_id,modul)
);

CREATE TABLE IF NOT EXISTS sessions (
  token   text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zweck   text NOT NULL DEFAULT 'voll',      -- 'voll' oder 'passwortwechsel'
  ablauf  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS log (
  id      serial PRIMARY KEY,
  zeit    timestamptz NOT NULL DEFAULT now(),
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  aktion  text NOT NULL,
  art     text NOT NULL DEFAULT 'edit'       -- add, edit, del, auth
);

/* ---------- Personaldaten ---------- */

CREATE TABLE IF NOT EXISTS personal (
  personalnummer    integer PRIMARY KEY,
  gruppe            text NOT NULL DEFAULT 'Nicht zugeordnet',
  beschaeftigungsart text NOT NULL DEFAULT 'Hauptberuf',
  status            text NOT NULL DEFAULT 'Aktiv',
  vorname           text,
  nachname          text,
  geburtsdatum      date,
  handy             text,
  waffenschein      boolean NOT NULL DEFAULT false,
  spind             boolean NOT NULL DEFAULT false,
  nebenjob          text,
  dienstgrad        text,
  eintrittsdatum    date,
  arbeitsvertrag    text,
  ernennungsurkunde text,
  urlaub_von        date,
  urlaub_bis        date,
  urlaub_tage       text,
  bemerkung         text,
  rsa               text
);

/* POR-Freigabe und ursprüngliche Beförderungsfristen.
   Schema-Migration ist wiederholbar und überschreibt keine vorhandenen Werte. */
/* Dokumenttitel und Google-Docs-/HTTPS-Ziel getrennt halten. Vorhandene Titel bleiben erhalten. */
-- Altdaten trennen, ohne eine Dienstgruppe zu erfinden.
ALTER TABLE personal ADD COLUMN IF NOT EXISTS beschaeftigungsart text NOT NULL DEFAULT 'Hauptberuf';
UPDATE personal SET beschaeftigungsart='Nebenberuf' WHERE gruppe='Nebenberuf';
UPDATE personal SET gruppe='Nicht zugeordnet' WHERE gruppe IN ('Hauptberuf','Nebenberuf');
ALTER TABLE personal ADD COLUMN IF NOT EXISTS arbeitsvertrag_url text NOT NULL DEFAULT '';
ALTER TABLE personal ADD COLUMN IF NOT EXISTS ernennungsurkunde_url text NOT NULL DEFAULT '';

ALTER TABLE personal ADD COLUMN IF NOT EXISTS letzte_befoerderung date;
ALTER TABLE personal ADD COLUMN IF NOT EXISTS naechste_befoerderung date;
ALTER TABLE personal ADD COLUMN IF NOT EXISTS por_status text NOT NULL DEFAULT 'offen';
ALTER TABLE personal ADD COLUMN IF NOT EXISTS por_notiz text NOT NULL DEFAULT '';
ALTER TABLE personal ADD COLUMN IF NOT EXISTS por_am date;

CREATE TABLE IF NOT EXISTS migrationen (
  name text PRIMARY KEY,
  ausgefuehrt timestamptz NOT NULL DEFAULT now()
);
WITH einmalig AS (
  INSERT INTO migrationen (name) VALUES ('original-last-due-20261028')
  ON CONFLICT DO NOTHING RETURNING name
)
UPDATE personal AS p
SET letzte_befoerderung = COALESCE(p.letzte_befoerderung, v.letzte),
    naechste_befoerderung = COALESCE(p.naechste_befoerderung, v.faellig)
FROM (VALUES
  (1, DATE '2025-05-04', NULL),
  (2, DATE '2026-10-22', NULL),
  (3, DATE '2026-06-03', NULL),
  (4, DATE '2026-04-12', NULL),
  (5, DATE '2026-06-19', NULL),
  (6, DATE '2026-10-18', NULL),
  (7, DATE '2026-07-08', NULL),
  (8, DATE '2026-10-18', NULL),
  (9, DATE '2026-05-10', NULL),
  (10, DATE '2026-09-30', DATE '2026-11-11'),
  (11, DATE '2026-10-16', NULL),
  (12, DATE '2026-08-12', DATE '2026-09-23'),
  (13, DATE '2026-09-12', DATE '2026-10-03'),
  (14, DATE '2026-09-30', NULL),
  (15, DATE '2026-09-13', DATE '2026-10-04'),
  (16, DATE '2026-04-08', NULL),
  (17, DATE '2026-09-20', DATE '2026-11-01'),
  (18, DATE '2026-10-18', DATE '2026-11-08'),
  (19, DATE '2025-11-22', NULL),
  (20, DATE '2026-10-10', DATE '2026-10-31'),
  (21, DATE '2026-09-30', DATE '2026-11-11'),
  (22, DATE '2026-09-28', DATE '2026-10-19'),
  (23, DATE '2026-10-10', DATE '2026-10-31'),
  (24, DATE '2026-10-18', DATE '2026-11-08'),
  (25, DATE '2026-09-23', DATE '2026-11-04'),
  (26, DATE '2026-10-11', DATE '2026-11-10'),
  (27, DATE '2026-10-11', DATE '2026-11-01'),
  (28, DATE '2026-09-13', DATE '2026-09-27'),
  (29, DATE '2026-09-03', NULL),
  (30, DATE '2026-10-15', DATE '2026-11-05'),
  (31, DATE '2026-05-31', NULL),
  (32, DATE '2026-10-15', DATE '2026-11-05'),
  (33, DATE '2026-10-24', DATE '2026-11-07'),
  (34, DATE '2026-10-21', DATE '2026-11-11'),
  (35, DATE '2026-10-25', DATE '2026-11-08'),
  (36, DATE '2026-10-25', DATE '2026-11-08'),
  (37, DATE '2026-09-13', DATE '2026-10-04'),
  (39, DATE '2026-10-18', DATE '2026-11-08'),
  (40, DATE '2026-09-20', NULL),
  (41, DATE '2026-09-30', NULL),
  (42, DATE '2026-10-04', DATE '2026-10-18'),
  (43, DATE '2026-10-25', DATE '2026-11-08'),
  (51, DATE '2026-10-24', DATE '2026-12-05'),
  (53, DATE '2026-10-19', DATE '2026-11-09'),
  (54, DATE '2026-10-24', NULL),
  (55, DATE '2026-10-20', DATE '2026-11-03')
) AS v(nr, letzte, faellig)
WHERE EXISTS (SELECT 1 FROM einmalig)
  AND p.personalnummer = v.nr;
  
/* Zugangsdaten getrennt von Personalakten und allgemeinem Dashboard speichern. */
CREATE TABLE IF NOT EXISTS copnet_zugaenge (
  personalnummer integer PRIMARY KEY REFERENCES personal(personalnummer) ON DELETE CASCADE,
  dienstnummer text NOT NULL DEFAULT '',
  passwort_verschluesselt text NOT NULL DEFAULT '',
  aktualisiert timestamptz NOT NULL DEFAULT now()
);

/* Die beiden RP-Sperrlisten sind bewusst getrennte Datenbestände. */
CREATE TABLE IF NOT EXISTS sperrfristen (
  id bigserial PRIMARY KEY,
  vorname text NOT NULL DEFAULT '',
  nachname text NOT NULL,
  art text NOT NULL CHECK (art IN ('Bewerber','Praktikant')),
  grund text NOT NULL DEFAULT '',
  von date,
  bis date,
  bemerkung text NOT NULL DEFAULT '',
  erstellt timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blacklist (
  id bigserial PRIMARY KEY,
  personalnummer text NOT NULL DEFAULT '',
  vorname text NOT NULL,
  nachname text NOT NULL,
  datum date,
  ablauf date,
  handy text NOT NULL DEFAULT '',
  bemerkung text NOT NULL DEFAULT '',
  erstellt timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raenge (
  name       text PRIMARY KEY,
  abk        text,
  tage       integer,
  bemerkung  text,
  grund      text,
  sortierung integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sonderfunktionsspalten (
  name       text PRIMARY KEY,
  sortierung integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sonderfunktionen (
  personalnummer integer PRIMARY KEY REFERENCES personal(personalnummer) ON DELETE CASCADE,
  leitung        text,
  sonstige       text,
  werte          jsonb NOT NULL DEFAULT '{}'::jsonb,
  aktualisiert   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kuendigungen (
  id                 serial PRIMARY KEY,
  personalnummer     integer,
  vorname            text, nachname text, rang text,
  grund              text,
  handy              text,
  vertrag            text,
  eintritt           date,
  urkunde            text, zeugnis text, kuendigung text,
  waffe              text DEFAULT 'Offen',
  copnet             text DEFAULT 'Offen',
  emd                text DEFAULT 'Offen',
  ic                 text DEFAULT 'Offen',
  discord            text DEFAULT 'Offen',
  dienstgegenstaende text DEFAULT 'Offen',
  anzeige            text DEFAULT 'Nein'
);

CREATE TABLE IF NOT EXISTS disziplinspalten (
  name       text PRIMARY KEY,
  sortierung integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS disziplin (
  personalnummer integer PRIMARY KEY REFERENCES personal(personalnummer) ON DELETE CASCADE,
  massnahmen     jsonb NOT NULL DEFAULT '[]'::jsonb
);

/* Strukturierte Disziplinarakten; bisherige Rohdaten bleiben erhalten. */
ALTER TABLE disziplin ADD COLUMN IF NOT EXISTS slots jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE disziplin ADD COLUMN IF NOT EXISTS bemerkung text NOT NULL DEFAULT '';
ALTER TABLE disziplin ADD COLUMN IF NOT EXISTS aktualisiert timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS richtlinie (
  id         serial PRIMARY KEY,
  stand      text,
  pdv        text, text_kurz text, mild text, hart text, sonst text, anmerkung text,
  sortierung integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklisten (
  name       text PRIMARY KEY,
  aufgaben   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sortierung integer NOT NULL DEFAULT 0
);

/* Gemeinsamer Fortschritt der Checklisten; Aufgaben selbst unverändert. */
CREATE TABLE IF NOT EXISTS checklisten_status (
  name text NOT NULL REFERENCES checklisten(name) ON DELETE CASCADE,
  punkt integer NOT NULL CHECK (punkt >= 0),
  erledigt boolean NOT NULL DEFAULT false,
  aktualisiert timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(name,punkt)
);

/* Wortgetreue RP-Textbausteine aus der PDF; nur berechtigte Rollen erhalten Inhalt. */
CREATE TABLE IF NOT EXISTS textbausteine (
  schluessel text PRIMARY KEY,
  kategorie text NOT NULL,
  titel text NOT NULL,
  inhalt text NOT NULL,
  sortierung integer NOT NULL DEFAULT 0
);

/* Soft-Delete: Beim Neustart dürfen gelöschte PDF-Originale nicht zurückkommen. */
ALTER TABLE textbausteine ADD COLUMN IF NOT EXISTS geloescht boolean NOT NULL DEFAULT false;

/* Gemeinsames, nur durch Admin bearbeitbares Startseiten-Layout.
   Version verhindert das Überschreiben paralleler Änderungen. */
CREATE TABLE IF NOT EXISTS dashboard_layout (
  id smallint PRIMARY KEY CHECK(id=1),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  aktualisiert timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard (
  id         serial PRIMARY KEY,
  art        text NOT NULL,               -- personal, vorlage, info, link
  text       text NOT NULL,
  anzahl     integer,
  url        text,
  sortierung integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS routine (
  id             serial PRIMARY KEY,
  personalnummer integer,
  tage           jsonb NOT NULL DEFAULT '[]'::jsonb,
  personen       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sortierung     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sonderzahlungen (
  id             serial PRIMARY KEY,
  personalnummer integer,
  vorname text, nachname text, rang text,
  erhalten       boolean NOT NULL DEFAULT false,
  datum          date,
  betrag         text, grund text
);

/* Editierbare Organisationsstruktur; die 13 Originalzeilen bleiben als Archiv erhalten. */
CREATE TABLE IF NOT EXISTS organigramm_layout (
  id smallint PRIMARY KEY CHECK(id=1),
  inhalt jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  aktualisiert timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organigramm (
  id         serial PRIMARY KEY,
  zeile      jsonb NOT NULL DEFAULT '[]'::jsonb,
  sortierung integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daten24 (
  id             serial PRIMARY KEY,
  personalnummer integer,
  vorname text, nachname text,
  anwesend       boolean NOT NULL DEFAULT false,
  durchgezogen   boolean NOT NULL DEFAULT false,
  sonderzahlung  text,
  top5           boolean NOT NULL DEFAULT false,
  gesamt         text
);

CREATE TABLE IF NOT EXISTS sport (
  id             serial PRIMARY KEY,
  personalnummer integer,
  vorname text, nachname text,
  geprueft       boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS befoerderungen (
  id             serial PRIMARY KEY,
  personalnummer integer,
  vorname text, nachname text, rang text, neu_rang text,
  grund          text,
  am             date,
  por            text,
  erl            text,
  erstellt       timestamptz NOT NULL DEFAULT now()
);

/* ---------- Grundrollen ---------- */

INSERT INTO roles (name, farbe, sensibel) VALUES
  ('Administrator',  '#ff5d6c', true),
  ('Polizeirat',     '#4f8cff', true),
  ('Leitungsdienst', '#7c5cff', true),
  ('Ausbilder',      '#f5a524', false),
  ('Mitarbeiter',    '#2ecc71', false)
ON CONFLICT (name) DO NOTHING;

/* Rechte: Modul / Administrator / Polizeirat / Leitungsdienst / Ausbilder / Mitarbeiter */
INSERT INTO role_perms (rolle, modul, stufe) VALUES
  ('Administrator','dash',2),('Polizeirat','dash',2),('Leitungsdienst','dash',1),('Ausbilder','dash',1),('Mitarbeiter','dash',1),
  ('Administrator','pers',2),('Polizeirat','pers',2),('Leitungsdienst','pers',1),
  ('Administrator','bef',2),('Polizeirat','bef',2),('Leitungsdienst','bef',2),
  ('Administrator','rout',2),('Polizeirat','rout',2),('Leitungsdienst','rout',1),('Ausbilder','rout',2),
  ('Administrator','sonder',2),('Polizeirat','sonder',2),('Leitungsdienst','sonder',1),('Ausbilder','sonder',2),
  ('Administrator','dis',2),('Polizeirat','dis',2),('Leitungsdienst','dis',2),
  ('Administrator','kue',2),('Polizeirat','kue',2),('Leitungsdienst','kue',1),
  ('Administrator','chk',2),('Polizeirat','chk',2),('Leitungsdienst','chk',1),('Ausbilder','chk',1),
  ('Administrator','rl',2),('Polizeirat','rl',2),('Leitungsdienst','rl',1),('Ausbilder','rl',1),('Mitarbeiter','rl',1),
  ('Administrator','org',2),('Polizeirat','org',1),('Leitungsdienst','org',1),('Ausbilder','org',1),('Mitarbeiter','org',1),
  ('Administrator','bl',2),('Polizeirat','bl',2),('Leitungsdienst','bl',1),
  ('Administrator','users',2),
  ('Administrator','log',2),('Polizeirat','log',1)
-- Bestehende Rechte bei Neustarts nicht überschreiben: Admin-Änderungen bleiben erhalten.
ON CONFLICT (rolle, modul) DO NOTHING;

/* Rollenrechte aus der Original-HTML, ohne zuvor angepasste Rechte zu überschreiben. */
INSERT INTO role_perms (rolle, modul, stufe) VALUES
  ('Administrator','sperr',2),('Polizeirat','sperr',2),('Leitungsdienst','sperr',2),('Ausbilder','sperr',2),('Mitarbeiter','sperr',2),
  ('Administrator','geb',2),('Polizeirat','geb',2),('Leitungsdienst','geb',2),('Ausbilder','geb',2),('Mitarbeiter','geb',2),
  ('Administrator','jub',2),('Polizeirat','jub',2),('Leitungsdienst','jub',2),('Ausbilder','jub',2),('Mitarbeiter','jub',2),
  ('Administrator','bl',2),('Polizeirat','bl',2),('Leitungsdienst','bl',1),('Ausbilder','bl',0),('Mitarbeiter','bl',0)
ON CONFLICT (rolle,modul) DO NOTHING;


/* POR-Genehmigung getrennt vom Beförderungsrecht.
   Nur Administrator und Polizeirat bekommen sie standardmäßig,
   weitere Rollen oder Dienstnummern lassen sich gezielt freischalten. */
INSERT INTO role_perms (rolle,modul,stufe) VALUES
 ('Administrator','por',2),('Polizeirat','por',2),
 ('Leitungsdienst','por',0),('Ausbilder','por',0),('Mitarbeiter','por',0)
ON CONFLICT(rolle,modul) DO NOTHING;

/* Polizeiräte dürfen Textbausteine lesen und kopieren;
   andere Rollen erhalten standardmäßig keinen Zugriff. Bestehende
   Gruppen- und Einzelrechte werden niemals überschrieben. */
INSERT INTO role_perms(rolle,modul,stufe) VALUES
 ('Administrator','texte',2),
 ('Polizeirat','texte',1),
 ('Leitungsdienst','texte',0),
 ('Ausbilder','texte',0),
 ('Mitarbeiter','texte',0)
ON CONFLICT(rolle,modul) DO NOTHING;


/* Durch Administratoren pflegbare dienstliche Bekanntmachungen. */
CREATE TABLE IF NOT EXISTS bekanntmachungen (
 id serial PRIMARY KEY,
 titel text NOT NULL,
 inhalt text NOT NULL,
 erstellt timestamptz NOT NULL DEFAULT now()
);

/* Erweiterbare Systemoptionen, pro Benutzer gelesene Benachrichtigungen. */
CREATE TABLE IF NOT EXISTS system_optionen (
  schluessel text PRIMARY KEY,
  werte jsonb NOT NULL DEFAULT '[]'::jsonb,
  aktualisiert timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_optionen(schluessel,werte) VALUES
('mitarbeitergruppen','["Mittlerer Dienst","Gehobener Dienst","Polizeirat","Leitungsdienst","Nicht zugeordnet"]'::jsonb),
('beschaeftigungsarten','["Hauptberuf","Nebenberuf"]'::jsonb)
ON CONFLICT (schluessel) DO NOTHING;
CREATE TABLE IF NOT EXISTS benachrichtigungen_gelesen (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meldung_id integer NOT NULL REFERENCES log(id) ON DELETE CASCADE,
  gelesen_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,meldung_id)
);

CREATE TABLE IF NOT EXISTS personal_audit (
 id bigserial PRIMARY KEY,
 personalnummer integer NOT NULL,
 user_id integer REFERENCES users(id) ON DELETE SET NULL,
 zeit timestamptz NOT NULL DEFAULT now(),
 aenderungen jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS personal_audit_nr_zeit ON personal_audit(personalnummer,zeit DESC);

/* Gezielte Mitteilungen: Empfänger bei Versand fixieren, keine Datenvermischung. */
CREATE TABLE IF NOT EXISTS portal_meldungen (
 id bigserial PRIMARY KEY,
 titel text NOT NULL,
 inhalt text NOT NULL,
 absender_id integer REFERENCES users(id) ON DELETE SET NULL,
 erstellt timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS portal_meldung_empfaenger (
 meldung_id bigint NOT NULL REFERENCES portal_meldungen(id) ON DELETE CASCADE,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(meldung_id,user_id)
);
INSERT INTO role_perms(rolle,modul,stufe) VALUES
('Administrator','persverlauf',2),('Polizeirat','persverlauf',1),
('Administrator','mitteilungen',2),('Polizeirat','mitteilungen',2),
('Leitungsdienst','mitteilungen',1),('Ausbilder','mitteilungen',1),('Mitarbeiter','mitteilungen',1)
ON CONFLICT(rolle,modul) DO NOTHING;

/* Dienststellen und individuell pflegbare Fristen. Bestehende Personalakten bleiben unverändert. */
CREATE TABLE IF NOT EXISTS dienststellen (
 id bigserial PRIMARY KEY,
 name text NOT NULL UNIQUE,
 beschreibung text NOT NULL DEFAULT '',
 aktiv boolean NOT NULL DEFAULT true
);
ALTER TABLE personal ADD COLUMN IF NOT EXISTS dienststelle_id bigint REFERENCES dienststellen(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS personal_fristen (
 id bigserial PRIMARY KEY,
 personalnummer integer REFERENCES personal(personalnummer) ON DELETE CASCADE,
 titel text NOT NULL,
 faellig_am date NOT NULL,
 vorwarn_tage integer NOT NULL DEFAULT 14 CHECK(vorwarn_tage BETWEEN 0 AND 365),
 erledigt boolean NOT NULL DEFAULT false,
 erstellt timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_fristen_datum_idx ON personal_fristen(faellig_am) WHERE erledigt=false;
INSERT INTO role_perms(rolle,modul,stufe) VALUES
('Administrator','dienststellen',2),('Polizeirat','dienststellen',2),('Leitungsdienst','dienststellen',1),
('Administrator','fristen',2),('Polizeirat','fristen',2),('Leitungsdienst','fristen',1),
('Administrator','backup',1)
ON CONFLICT(rolle,modul) DO NOTHING;

/* Portaldesign: genau eine zentrale, persistente Konfiguration. */
CREATE TABLE IF NOT EXISTS portal_design (
 id smallint PRIMARY KEY CHECK(id=1),
 akzent text NOT NULL DEFAULT '#5b86ba',
 schleier smallint NOT NULL DEFAULT 88 CHECK(schleier BETWEEN 65 AND 97),
 hintergrund text NOT NULL DEFAULT 'wappen',
 aktualisiert timestamptz NOT NULL DEFAULT now()
);
INSERT INTO portal_design(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
INSERT INTO role_perms(rolle,modul,stufe) VALUES
 ('Administrator','design',2),('Administrator','urkunden',2),('Polizeirat','urkunden',2),('Leitungsdienst','urkunden',1)
ON CONFLICT(rolle,modul) DO NOTHING;

/* Persönliche Favoriten ohne Änderungen an bestehenden Modulen. */
CREATE TABLE IF NOT EXISTS user_favoriten (
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 modul text NOT NULL,
 sortierung integer NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,modul)
);
INSERT INTO role_perms(rolle,modul,stufe) VALUES ('Administrator','rechtesimulator',2)
ON CONFLICT(rolle,modul) DO NOTHING;
