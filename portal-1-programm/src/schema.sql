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
  gruppe            text NOT NULL DEFAULT 'Hauptberuf',
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
ON CONFLICT (rolle, modul) DO UPDATE SET stufe = EXCLUDED.stufe;
