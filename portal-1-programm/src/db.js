import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Render liefert DATABASE_URL. Lokal tut es dieselbe Variable. */
export const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && /render\.com|sslmode=require/.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false } : false
});

export async function initDb() {
  const sql = await readFile(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  await seedBenutzer();
}

/* Legt den ersten Administrator an, falls noch keiner existiert. */
async function seedBenutzer() {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM users`);
  if (rows[0].n > 0) return;

  const dnr = process.env.ADMIN_DIENSTNUMMER || '00';
  const pw = process.env.ADMIN_PASSWORT;
  if (!pw || pw.length < 8) {
    /* Ohne ADMIN_PASSWORT wird kein Zugang angelegt. Der Dienst startet
       trotzdem und weist im Protokoll darauf hin. */
    console.warn('ADMIN_PASSWORT fehlt (min. 8 Zeichen). Es wurde kein Administrator angelegt.');
    console.warn('Trage ADMIN_PASSWORT in Render unter Environment ein und starte neu.');
    return;
  }
  await db.query(
    `INSERT INTO users (dienstnummer, anzeigename, rolle, passwort_hash, muss_passwort_aendern)
     VALUES ($1, 'Administrator', 'Administrator', $2, false)`,
    [dnr, await hashPassword(pw)]);
  await db.query(`INSERT INTO log (aktion, art) VALUES ('Erster Administrator angelegt', 'add')`);
}
