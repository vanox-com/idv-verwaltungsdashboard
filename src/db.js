import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Verbindung zur Datenbank.
 * Render setzt DATABASE_URL, wenn die Datenbank mit dem Dienst verbunden ist.
 * Bei Render laeuft die Verbindung intern ueber SSL, deshalb wird es hier
 * eingeschaltet, sobald die Adresse auf Render zeigt oder sslmode verlangt.
 */
export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /render\.com|sslmode=require/.test(process.env.DATABASE_URL || '')
    ? { rejectUnauthorized: false }
    : false
});

export async function initDb() {
  const sql = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  await seedBenutzer();
}

/*
 * Legt den Administrator an, falls noch keiner existiert.
 * Laeuft bei jedem Start. Fehlt der Zugang, wird er nachgeholt.
 */
async function seedBenutzer() {
  const ergebnis = await db.query('SELECT count(*)::int AS anzahl FROM users');
  const vorhanden = ergebnis.rows[0].anzahl;

  if (vorhanden > 0) {
    console.log('Zugaenge in der Datenbank: ' + vorhanden);
    return;
  }

  const dienstnummer = process.env.ADMIN_DIENSTNUMMER || '00';
  const passwort = process.env.ADMIN_PASSWORT;

  if (!passwort || passwort.length < 8) {
    console.warn('ADMIN_PASSWORT fehlt oder ist kuerzer als 8 Zeichen.');
    console.warn('Es wurde kein Administrator angelegt.');
    console.warn('ADMIN_PASSWORT in Render unter Environment eintragen und Dienst neu starten.');
    return;
  }

  const hash = await hashPassword(passwort);
  await db.query(
    'INSERT INTO users (dienstnummer, anzeigename, rolle, passwort_hash, muss_passwort_aendern) ' +
    'VALUES ($1, $2, $3, $4, false)',
    [dienstnummer, 'Administrator', 'Administrator', hash]
  );
  await db.query("INSERT INTO log (aktion, art) VALUES ('Administrator angelegt', 'add')");
  console.log('Administrator angelegt mit Dienstnummer ' + dienstnummer);
}
