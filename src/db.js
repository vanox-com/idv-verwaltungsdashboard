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
  await originalDokumentLinksUebernehmen();
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

/* Private, idempotente Wiederherstellung der eindeutig zugeordneten
   Original-Links. Die Quelle bleibt Render-Environment statt GitHub. */
async function originalDokumentLinksUebernehmen() {
  const raw=process.env.PERSONAL_DOKUMENTE_IMPORT;
  if(!raw)return;
  let liste;
  try { liste=JSON.parse(raw); } catch(e) {
    throw new Error('PERSONAL_DOKUMENTE_IMPORT: ungültiges JSON');
  }
  if(!Array.isArray(liste)||liste.length>300)
    throw new Error('PERSONAL_DOKUMENTE_IMPORT: ungültige Liste');
  let anzahl=0;
  for(const e of liste) {
    if(!Number.isSafeInteger(e.nr)||e.nr<1||
       !['arbeitsvertrag','ernennungsurkunde'].includes(e.feld)||
       typeof e.name!=='string'||typeof e.url!=='string')
      throw new Error('PERSONAL_DOKUMENTE_IMPORT: ungültiger Datensatz');
    const u=new URL(e.url);
    if(u.protocol!=='https:'||u.hostname!=='docs.google.com')
      throw new Error('PERSONAL_DOKUMENTE_IMPORT: URL muss Google Docs sein');
    const sql='UPDATE personal SET '+e.feld+'_url=$1 WHERE personalnummer=$2 AND '+
      e.feld+"=$3 AND COALESCE("+e.feld+"_url,'')=''";
    const r=await db.query(sql,[e.url,e.nr,e.name]);
    anzahl+=r.rowCount;
  }
  if(anzahl)console.log('Dokumentlinks aus Original erfolgreich ergänzt: '+anzahl);
}
