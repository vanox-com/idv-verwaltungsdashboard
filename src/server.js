import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDb } from './db.js';
import { hashPassword, verifyPassword, newSessionToken, SESSION_HOURS } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SECURE = process.env.NODE_ENV === 'production';

/* Render stellt die Anfragen hinter einem Zwischenrechner zu und setzt
   dabei X-Forwarded-For. Ohne diese Zeile bricht die Sperre gegen zu viele
   Anmeldeversuche bei jeder Anfrage ab — und zwar bevor das Passwort
   überhaupt geprüft wird. */
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// API-Antworten enthalten keine geheimen Daten in gemeinsamen Caches.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  // Schützt Cookie-authentifizierte Schreibzugriffe zusätzlich gegen CSRF.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    const forwardedHost = req.get('x-forwarded-host');
    const host = forwardedHost || req.get('host');
    if (origin) {
      try {
        if (new URL(origin).host !== host) return res.status(403).json({ error: 'Ungültiger Anfrageursprung' });
      } catch { return res.status(403).json({ error: 'Ungültiger Anfrageursprung' }); }
    }
  }
  next();
});
/* Keine veraltete Login-HTML aus dem Browsercache ausliefern. */
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

/* Sperre gegen zu viele Anmeldeversuche: 30 in fünf Minuten, und nur
   fehlgeschlagene Versuche zählen. Beim Tippen passiert nichts. */
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche. Bitte fünf Minuten warten.' }
});

/* ---------- Sitzung ---------- */

async function currentUser(req) {
  const token = req.cookies.session;
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.dienstnummer, u.anzeigename, u.rolle, u.muss_passwort_aendern,
            u.gesperrt, s.zweck
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.ablauf > now()`,
    [token]
  );
  if (!rows.length) return null;
  const u = rows[0];
  if (u.gesperrt) return null;
  if (u.muss_passwort_aendern) {
    if (u.zweck !== 'passwortwechsel') return null;
    u.nur_passwortwechsel = true;
  } else if (u.zweck !== 'voll') {
    return null;
  }
  return u;
}

/* Express ruft Middleware direkt mit (req, res, next) auf.
   Die frühere Factory-Signatur gab nur eine Funktion zurück, rief next()
   aber nie auf. Dadurch blieben alle geschützten Routen dauerhaft hängen. */
async function requireLogin(req, res, next) {
  try {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    if (u.nur_passwortwechsel) return res.status(403).json({ error: 'Passwortwechsel erforderlich' });
    req.user = u;
    next();
  } catch (e) { next(e); }
}

function requireRight(modul, stufe = 1) {
  return async (req, res, next) => {
    const { rows } = await db.query(
      `SELECT p.stufe FROM role_perms p
        WHERE p.rolle = $1 AND p.modul = $2`, [req.user.rolle, modul]);
    const hat = rows.length ? rows[0].stufe : 0;
    if (hat < stufe) return res.status(403).json({ error: 'Kein Recht für diesen Bereich' });
    next();
  };
}

/* Das Display im RP-Dashboard erhält seinen Namen aus der Personalakte:
   Dienstnummer "01" entspricht Personalnummer 1. Ein frei angelegter
   Admin-/Testzugang behält seinen eigenen Anzeigenamen. */
async function nameFuerDienstnummer(u) {
  const nummer = String(u.dienstnummer || '').trim();
  if (/^\d{1,6}$/.test(nummer) && Number(nummer) > 0) {
    const { rows } = await db.query(
      'SELECT vorname, nachname FROM personal WHERE personalnummer = $1 LIMIT 1',
      [Number(nummer)]
    );
    if (rows.length) {
      const name = [rows[0].vorname, rows[0].nachname].filter(Boolean).join(' ').trim();
      if (name && name !== '- -') return name;
    }
  }
  return u.anzeigename;
}

/* ---------- Anmeldung ---------- */

/* Administrator wird ausschließlich serverseitig beim Start angelegt.
 * Der Datenimport läuft nur über die lokale CLI und nie über öffentlich
 * erreichbare GET-Endpunkte mit Passwörtern in der URL. */

app.post('/api/login', loginLimiter, async (req, res, next) => {
  try {
    const dienstnummer = String(req.body.dienstnummer || '').trim();
    const passwort = String(req.body.passwort || '');
    if (!dienstnummer || !passwort) return res.status(400).json({ error: 'Dienstnummer und Passwort nötig' });

    const { rows } = await db.query(
      `SELECT id, passwort_hash, muss_passwort_aendern, gesperrt FROM users WHERE dienstnummer = $1`,
      [dienstnummer]);
    if (!rows.length) return res.status(401).json({ error: 'Kein Zugang mit dieser Dienstnummer' });
    const u = rows[0];
    if (u.gesperrt) return res.status(403).json({ error: 'Dieser Zugang ist gesperrt' });

    const ok = await verifyPassword(passwort, u.passwort_hash);
    if (!ok) return res.status(401).json({ error: 'Passwort stimmt nicht' });

    const token = newSessionToken();
    const zweck = u.muss_passwort_aendern ? 'passwortwechsel' : 'voll';
    await db.query(
      `INSERT INTO sessions (token, user_id, zweck, ablauf) VALUES ($1, $2, $3, now() + interval '${SESSION_HOURS} hours')`,
      [token, u.id, zweck]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'auth')`,
      [u.id, 'Anmeldung']);

    res.cookie('session', token, {
      httpOnly: true, sameSite: 'strict', secure: SECURE,
      maxAge: SESSION_HOURS * 3600 * 1000
    });
    res.json({ ok: true, mussPasswortAendern: u.muss_passwort_aendern });
  } catch (e) { next(e); }
});

app.post('/api/logout', async (req, res, next) => {
  try {
    const token = req.cookies.session;
    if (token) {
      const u = await currentUser(req);
      if (u) await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, 'Abmeldung', 'auth')`, [u.id]);
      await db.query(`DELETE FROM sessions WHERE token = $1`, [token]);
    }
    res.clearCookie('session', { httpOnly: true, sameSite: 'strict', secure: SECURE });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/me', async (req, res, next) => {
  try {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    const { rows } = await db.query(
      `SELECT modul, stufe FROM role_perms WHERE rolle = $1`, [u.rolle]);
    const rechte = {};
    rows.forEach(r => { rechte[r.modul] = r.stufe; });
    res.json({
      id: u.id, dienstnummer: u.dienstnummer, anzeigename: await nameFuerDienstnummer(u),
      rolle: u.rolle, mussPasswortAendern: !!u.muss_passwort_aendern, rechte
    });
  } catch (e) { next(e); }
});

app.post('/api/passwort', async (req, res, next) => {
  try {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
    const neu = String(req.body.neu || '');
    if (neu.length < 8) return res.status(400).json({ error: 'Passwort min. 8 Zeichen' });

    const token = req.cookies.session;
    const { rows } = await db.query(`SELECT passwort_hash FROM users WHERE id = $1`, [u.id]);
    const alt = await verifyPassword(String(req.body.alt || ''), rows[0].passwort_hash);
    if (!alt) return res.status(401).json({ error: 'Bisheriges Passwort stimmt nicht' });
    await db.query(
      `UPDATE users SET passwort_hash = $1, muss_passwort_aendern = false WHERE id = $2`,
      [await hashPassword(neu), u.id]);
    /* Sitzung wird vollwertig, sobald das Passwort geändert ist */
    await db.query(`UPDATE sessions SET zweck = 'voll' WHERE token = $1`, [token]);
    await db.query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [u.id, token]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, 'Passwort geändert', 'auth')`, [u.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- Lesen ---------- */

app.get('/api/bootstrap', requireLogin, async (req, res, next) => {
  const beginn = Date.now();
  console.log('[dashboard] Datenabfrage gestartet, Dienstnummer:', req.user.dienstnummer);
  try {
    const [personal, raenge, funktionen, funktionsspalten, kuendigungen, disziplin,
      disziplinSpalten, richtlinie, checklisten, dashboard, routine, sonderzahlungen,
      organigramm, befoerderungen] = await Promise.all([
      db.query(`SELECT * FROM personal ORDER BY personalnummer`),
      db.query(`SELECT * FROM raenge ORDER BY sortierung, name`),
      db.query(`SELECT * FROM sonderfunktionen`),
      db.query(`SELECT * FROM sonderfunktionsspalten ORDER BY sortierung`),
      db.query(`SELECT * FROM kuendigungen ORDER BY nachname`),
      db.query(`SELECT * FROM disziplin ORDER BY personalnummer`),
      db.query(`SELECT * FROM disziplinspalten ORDER BY sortierung`),
      db.query(`SELECT * FROM richtlinie ORDER BY sortierung`),
      db.query(`SELECT * FROM checklisten ORDER BY sortierung`),
      db.query(`SELECT * FROM dashboard ORDER BY sortierung`),
      db.query(`SELECT * FROM routine ORDER BY sortierung`),
      db.query(`SELECT * FROM sonderzahlungen ORDER BY nachname`),
      db.query(`SELECT * FROM organigramm ORDER BY sortierung`),
      db.query(`SELECT * FROM befoerderungen ORDER BY nachname`)
    ]);

    const rolle = req.user.rolle;
    const { rows: perms } = await db.query(`SELECT modul, stufe FROM role_perms WHERE rolle = $1`, [rolle]);
    const rechte = {}; perms.forEach(p => { rechte[p.modul] = p.stufe; });
    const sensibel = (await db.query(`SELECT sensibel FROM roles WHERE name = $1`, [rolle])).rows[0]?.sensibel;

    const daten = {
      personal: personal.rows, raenge: raenge.rows,
      funktionsspalten: funktionsspalten.rows.map(r => r.name),
      funktionen: funktionen.rows.map(r => ({ nr: r.personalnummer, leitung: r.leitung, sonstige: r.sonstige, werte: r.werte })),
      kuendigungen: kuendigungen.rows,
      disziplinSpalten: disziplinSpalten.rows.map(r => r.name),
      disziplin: disziplin.rows.map(r => ({ nr: r.personalnummer, massnahmen: r.massnahmen })),
      richtlinie: { stand: richtlinie.rows[0]?.stand || '', zeilen: richtlinie.rows },
      checklisten: checklisten.rows.map(r => ({ name: r.name, aufgaben: r.aufgaben })),
      dashboard: {
        personal: dashboard.rows.filter(r => r.art === 'personal').map(r => ({ label: r.text, anzahl: r.anzahl })),
        vorlagen: dashboard.rows.filter(r => r.art === 'vorlage').map(r => ({ text: r.text, url: r.url })),
        info: dashboard.rows.filter(r => r.art === 'info').map(r => ({ text: r.text, url: r.url })),
        links: dashboard.rows.filter(r => r.art === 'link').map(r => ({ text: r.text, url: r.url }))
      },
      routine: routine.rows.map(r => ({ nr: r.personalnummer, tage: r.tage, personen: r.personen })),
      sonderzahlungen: sonderzahlungen.rows,
      organigramm: organigramm.rows,
      befoerderungen: befoerderungen.rows
    };

    /* Das Dashboard erhält nur Statistikwerte, keine versteckten Modulinhalte. */
    daten.dashboard.summary = {
      personal: personal.rows.length,
      kuendigungen: kuendigungen.rows.length,
      offeneRueckgaben: kuendigungen.rows.filter(k =>
        ['waffe', 'copnet', 'emd', 'ic', 'discord', 'dienstgegenstaende']
          .some(f => /offen/i.test(k[f] || ''))).length,
      disziplinFaelle: disziplin.rows.filter(d => Array.isArray(d.massnahmen) && d.massnahmen.length > 0).length
    };

    /* Berechtigungen auch bei API-Ausgabe erzwingen, nicht nur Menüpunkte verstecken. */
    const berechtigt = m => (rechte[m] || 0) >= 1;
    if (!berechtigt('bef')) {
      daten.befoerderungen = [];
      daten.raenge = [];
    }
    if (!berechtigt('sonder')) {
      daten.funktionen = [];
      daten.funktionsspalten = [];
    }
    if (!berechtigt('kue')) daten.kuendigungen = [];
    if (!berechtigt('dis')) {
      daten.disziplin = [];
      daten.disziplinSpalten = [];
    }
    if (!berechtigt('rout')) {
      daten.routine = [];
      daten.sonderzahlungen = [];
    }
    if (!berechtigt('chk')) daten.checklisten = [];
    if (!berechtigt('rl')) daten.richtlinie = { stand: '', zeilen: [] };
    if (!berechtigt('org')) daten.organigramm = [];
    if (!berechtigt('dash')) daten.dashboard = { personal: [], vorlagen: [], info: [], links: [], summary: {} };

    if (!berechtigt('pers')) {
      /* Funktions- und Disziplinansichten benötigen Namen, aber keine Personalakte. */
      daten.personal = (berechtigt('sonder') || berechtigt('dis') || berechtigt('bef'))
        ? daten.personal.map(p => ({
            personalnummer: p.personalnummer, vorname: p.vorname, nachname: p.nachname,
            ...(berechtigt('bef') ? {
              status: p.status, dienstgrad: p.dienstgrad,
              letzte_befoerderung: p.letzte_befoerderung,
              naechste_befoerderung: p.naechste_befoerderung,
              por_status: p.por_status, por_notiz: p.por_notiz, por_am: p.por_am
            } : {})
          }))
        : [];
    } else if (!sensibel) {
      daten.personal = daten.personal.map(p => ({
        ...p, handy: null, geburtsdatum: null, urlaub_von: null, urlaub_bis: null
      }));
    }

    res.json({ user: { dienstnummer: req.user.dienstnummer, anzeigename: await nameFuerDienstnummer(req.user), rolle, rechte, sensibel: !!sensibel }, daten });
    console.log('[dashboard] Datenabfrage erfolgreich, Dauer:', Date.now() - beginn, 'ms');
  } catch (e) {
    console.error('[dashboard] Datenabfrage fehlgeschlagen:', e.code || '', e.message);
    next(e);
  }
});

/* ---------- Schreiben ---------- */

app.patch('/api/personal/:nr', requireLogin, requireRight('pers', 2), async (req, res, next) => {
  try {
    const erlaubt = ['vorname', 'nachname', 'geburtsdatum', 'handy', 'waffenschein', 'spind',
      'nebenjob', 'dienstgrad', 'eintrittsdatum', 'arbeitsvertrag', 'ernennungsurkunde',
      'urlaub_von', 'urlaub_bis', 'urlaub_tage', 'bemerkung', 'rsa', 'status', 'gruppe'];
    const felder = [], werte = [];
    erlaubt.forEach(k => {
      if (k in req.body) { werte.push(req.body[k] === '' ? null : req.body[k]); felder.push(`${k} = $${werte.length}`); }
    });
    if (!felder.length) return res.status(400).json({ error: 'Keine Felder übergeben' });
    werte.push(req.params.nr);
    await db.query(`UPDATE personal SET ${felder.join(', ')} WHERE personalnummer = $${werte.length}`, werte);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
      [req.user.id, `Personal ${req.params.nr} geändert`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/personal', requireLogin, requireRight('pers', 2), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await db.query(
      `INSERT INTO personal (personalnummer, gruppe, status, vorname, nachname, geburtsdatum, handy,
        waffenschein, spind, nebenjob, dienstgrad, eintrittsdatum, arbeitsvertrag, ernennungsurkunde,
        urlaub_von, urlaub_bis, urlaub_tage, bemerkung, rsa)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [b.personalnummer, b.gruppe || 'Hauptberuf', b.status || 'Aktiv', b.vorname, b.nachname, b.geburtsdatum || null,
        b.handy, !!b.waffenschein, !!b.spind, b.nebenjob, b.dienstgrad, b.eintrittsdatum || null,
        b.arbeitsvertrag, b.ernennungsurkunde, b.urlaub_von || null, b.urlaub_bis || null, b.urlaub_tage, b.bemerkung, b.rsa]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')`,
      [req.user.id, `Personal ${b.personalnummer} angelegt`]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* Geschützter CopNet-Zugang: AES-256-GCM, eigener Schlüssel aus Render-
   Umgebungsvariablen, keine Passwörter in Bootstrap oder allgemeinen Logs. */
function copnetSchluessel() {
  const raw = process.env.COPNET_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw Object.assign(new Error('Verschlüsselungsschlüssel nicht konfiguriert'), { httpStatus: 503 });
  }
  return Buffer.from(raw, 'hex');
}
function copnetVerschluesseln(plain) {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', copnetSchluessel(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),ct.toString('base64')].join('.');
}
function copnetEntschluesseln(verschluesselt) {
  if (!verschluesselt) return '';
  const [iv,tag,ct] = String(verschluesselt).split('.');
  if (!iv || !tag || !ct) throw new Error('Ungültiges Verschlüsselungsformat');
  const decipher = createDecipheriv('aes-256-gcm', copnetSchluessel(), Buffer.from(iv,'base64'));
  decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct,'base64')),decipher.final()]).toString('utf8');
}
async function requireSensitivePersonnel(req,res,next) {
  try {
    const row = (await db.query('SELECT sensibel FROM roles WHERE name=$1',[req.user.rolle])).rows[0];
    if (!row?.sensibel) return res.status(403).json({error:'Zugriff auf Zugangsdaten nicht erlaubt'});
    next();
  } catch(err) { next(err); }
}
app.get('/api/copnet/:nr',requireLogin,requireRight('pers',1),requireSensitivePersonnel,async(req,res,next)=>{
  try{
    const nr=Number(req.params.nr);
    if(!Number.isSafeInteger(nr)||nr<1)return res.status(400).json({error:'Ungültige Personalnummer'});
    const found=(await db.query('SELECT personalnummer FROM personal WHERE personalnummer=$1',[nr])).rows;
    if(!found.length)return res.status(404).json({error:'Person nicht gefunden'});
    const row=(await db.query('SELECT dienstnummer,passwort_verschluesselt FROM copnet_zugaenge WHERE personalnummer=$1',[nr])).rows[0];
    res.json({dienstnummer:row?.dienstnummer||'',passwort:copnetEntschluesseln(row?.passwort_verschluesselt||'')});
  }catch(e){next(e)}
});
app.put('/api/copnet/:nr',requireLogin,requireRight('pers',2),requireSensitivePersonnel,async(req,res,next)=>{
  try{
    const nr=Number(req.params.nr);
    if(!Number.isSafeInteger(nr)||nr<1)return res.status(400).json({error:'Ungültige Personalnummer'});
    const dn=String(req.body.dienstnummer||'').trim();
    const pw=String(req.body.passwort||'');
    if(dn.length>120||pw.length>500)return res.status(400).json({error:'Zugangsdaten zu lang'});
    const verschluesselt=copnetVerschluesseln(pw);
    const {rows}=await db.query(
      `INSERT INTO copnet_zugaenge (personalnummer,dienstnummer,passwort_verschluesselt)
         SELECT personalnummer,$2,$3 FROM personal WHERE personalnummer=$1
         ON CONFLICT (personalnummer) DO UPDATE SET dienstnummer=EXCLUDED.dienstnummer,
           passwort_verschluesselt=EXCLUDED.passwort_verschluesselt,aktualisiert=now()
         RETURNING personalnummer`,[nr,dn,verschluesselt]);
    if(!rows.length)return res.status(404).json({error:'Person nicht gefunden'});
    await db.query("INSERT INTO log (user_id,aktion,art) VALUES ($1,$2,'edit')",
      [req.user.id,'CopNet-Zugang bei Personalnummer '+nr+' aktualisiert']);
    res.json({ok:true});
  }catch(e){next(e)}
});

/* Sonderfunktionen zuweisen und entziehen */
app.post('/api/funktion', requireLogin, requireRight('sonder', 2), async (req, res, next) => {
  try {
    const { nr, funktion, wert } = req.body;
    const { rows } = await db.query(
      `UPDATE sonderfunktionen SET werte = jsonb_set(werte, ARRAY[$2], $3::jsonb), aktualisiert = now()
        WHERE personalnummer = $1 RETURNING werte`, [nr, funktion, JSON.stringify(!!wert)]);
    if (!rows.length) return res.status(404).json({ error: 'Person nicht gefunden' });
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')`,
      [req.user.id, `${wert ? 'Zugewiesen' : 'Entzogen'}: ${funktion} bei ${nr}`]);
    res.json({ ok: true, werte: rows[0].werte });
  } catch (e) { next(e); }
});

/* Sonderfunktionen und Fortbildungen gemeinsam speichern. */
app.patch('/api/sonder/:nr', requireLogin, requireRight('sonder', 2), async (req, res, next) => {
  try {
    const nr = Number(req.params.nr);
    if (!Number.isSafeInteger(nr) || nr < 1) return res.status(400).json({ error: 'Ungültige Personalnummer' });
    const werte = req.body.werte;
    if (!werte || typeof werte !== 'object' || Array.isArray(werte)) return res.status(400).json({ error: 'Ungültige Zuordnung' });
    const { rows: spalten } = await db.query('SELECT name FROM sonderfunktionsspalten');
    const erlaubte = new Set(spalten.map(x => x.name));
    if (Object.keys(werte).some(x => !erlaubte.has(x) || typeof werte[x] !== 'boolean')) return res.status(400).json({ error: 'Ungültige Fortbildung' });
    const leitung = String(req.body.leitung || '').trim();
    const sonstige = String(req.body.sonstige || '').trim();
    if (leitung.length > 500 || sonstige.length > 500) return res.status(400).json({ error: 'Text zu lang' });
    const { rows } = await db.query(
      `INSERT INTO sonderfunktionen (personalnummer, leitung, sonstige, werte)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (personalnummer) DO UPDATE SET
         leitung = EXCLUDED.leitung, sonstige = EXCLUDED.sonstige,
         werte = EXCLUDED.werte, aktualisiert = now()
       RETURNING personalnummer`, [nr, leitung, sonstige, JSON.stringify(werte)]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
      [req.user.id, `Fortbildungen/Funktionen von ${nr} geändert`]);
    res.json({ ok: true, personalnummer: rows[0].personalnummer });
  } catch (e) { next(e); }
});

/* Freigabe durch den Polizeioberrat (POR) verwalten. */
app.patch('/api/por/:nr', requireLogin, requireRight('bef', 2), async (req, res, next) => {
  try {
    const nr = Number(req.params.nr);
    const status = String(req.body.status || '');
    const notiz = String(req.body.notiz || '').trim();
    if (!Number.isSafeInteger(nr) || nr < 1) return res.status(400).json({ error: 'Ungültige Personalnummer' });
    if (!['offen', 'beantragt', 'genehmigt', 'abgelehnt'].includes(status))
      return res.status(400).json({ error: 'Ungültiger POR-Status' });
    if (notiz.length > 1000) return res.status(400).json({ error: 'Notiz zu lang' });
    const datum = status === 'genehmigt'
      ? String(req.body.datum || new Date().toISOString().slice(0, 10)) : null;
    if (datum && (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(Date.parse(datum))))
      return res.status(400).json({ error: 'Ungültiges Datum' });
    const { rows } = await db.query(
      'UPDATE personal SET por_status = $1, por_notiz = $2, por_am = $3 WHERE personalnummer = $4 RETURNING personalnummer, por_status',
      [status, notiz, datum, nr]);
    if (!rows.length) return res.status(404).json({ error: 'Personalnummer nicht gefunden' });
    await db.query("INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')",
      [req.user.id, 'POR-Freigabe bei ' + nr + ': ' + status]);
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

/* Beförderung: Frist und POR-Status innerhalb einer DB-Transaktion prüfen.
   Ein Client darf weder einen Rang überspringen noch den POR-Status umgehen. */
app.post('/api/befoerdern', requireLogin, requireRight('bef', 2), async (req, res, next) => {
  const nr = Number(req.body.nr);
  if (!Number.isSafeInteger(nr) || nr < 1) return res.status(400).json({ error: 'Ungültige Personalnummer' });
  const fail = (status, message) => Object.assign(new Error(message), { httpStatus: status });
  const client = await db.connect().catch(next);
  if (!client) return;
  try {
    await client.query('BEGIN');
    const pResult = await client.query(
      'SELECT personalnummer, vorname, nachname, status, dienstgrad, por_status, por_am, letzte_befoerderung, naechste_befoerderung FROM personal WHERE personalnummer = $1 FOR UPDATE',
      [nr]);
    if (!pResult.rows.length) throw fail(404, 'Personalnummer nicht gefunden');
    const p = pResult.rows[0];
    if (p.status === 'Gekündigt') throw fail(409, 'Gekündigtes Personal kann nicht befördert werden');
    if (p.por_status !== 'genehmigt') throw fail(403, 'Beförderung nur mit gültiger POR-Freigabe möglich');
    const raenge = (await client.query('SELECT name, tage FROM raenge ORDER BY sortierung, name')).rows;
    const i = raenge.findIndex(r => r.name === p.dienstgrad);
    if (i < 0 || !raenge[i].tage || !raenge[i + 1])
      throw fail(409, 'Für diesen Dienstgrad ist keine weitere Beförderung vorgesehen');
    const naechsterRang = raenge[i + 1].name;
    if (req.body.neuer_rang && req.body.neuer_rang !== naechsterRang)
      throw fail(409, 'Der nächste Dienstgrad stimmt nicht mit der Dienstgradfolge überein');
    const pruefung = await client.query(
      'SELECT COALESCE($1::date, $2::date + $3::integer) AS faellig',
      [p.naechste_befoerderung, p.letzte_befoerderung, Number(raenge[i].tage)]);
    const faellig = pruefung.rows[0].faellig;
    if (!faellig) throw fail(409, 'Es fehlt ein gültiges Datum für die Beförderungsfrist');
    if (Date.parse(String(faellig)) > Date.now())
      throw fail(409, 'Beförderungsfrist ist noch nicht abgelaufen');
    const grund = String(req.body.grund || 'Beförderung nach Dienstzeit').trim();
    if (grund.length > 1000) throw fail(400, 'Beförderungsgrund zu lang');
    await client.query(
      "UPDATE personal SET dienstgrad=$1, letzte_befoerderung=CURRENT_DATE, naechste_befoerderung=NULL, por_status='offen', por_notiz='', por_am=NULL WHERE personalnummer=$2",
      [naechsterRang, nr]);
    await client.query(
      "INSERT INTO befoerderungen (personalnummer, vorname, nachname, rang, neu_rang, grund, am, por) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7)",
      [nr, p.vorname, p.nachname, p.dienstgrad, naechsterRang, grund, 'POR genehmigt']);
    await client.query(
      "INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')",
      [req.user.id, 'Befördert: ' + nr + ' ' + p.dienstgrad + ' → ' + naechsterRang + ' (POR genehmigt)']);
    await client.query('COMMIT');
    res.json({ ok: true, neuer_rang: naechsterRang });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.httpStatus) res.status(e.httpStatus).json({ error: e.message });
    else next(e);
  } finally { client.release(); }
});

/* Kündigung anlegen */
app.post('/api/kuendigung', requireLogin, requireRight('kue', 2), async (req, res, next) => {
  try {
    const b = req.body;
    const { rows } = await db.query(
      `INSERT INTO kuendigungen (personalnummer, vorname, nachname, rang, grund, handy, vertrag, eintritt,
        urkunde, zeugnis, kuendigung, waffe, copnet, emd, ic, discord, dienstgegenstaende, anzeige)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [b.nr, b.vorname, b.nachname, b.rang, b.grund, b.handy, b.vertrag, b.eintritt || null, b.urkunde, b.zeugnis,
        b.kuendigung, b.waffe || 'Offen', b.copnet || 'Offen', b.emd || 'Offen', b.ic || 'Offen',
        b.discord || 'Offen', b.dienstgegenstaende || 'Offen', b.anzeige || 'Nein']);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')`,
      [req.user.id, `Kündigung angelegt: ${b.nachname}`]);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

/* Statuswechsel in der Kündigungsliste. Werte serverseitig prüfen. */
app.patch('/api/kuendigung/:id', requireLogin, requireRight('kue', 2), async (req, res, next) => {
  try {
    const erlaubte = {
      waffe: ['Offen', 'Informiert'],
      copnet: ['Offen', 'Entfernt'],
      emd: ['Offen', 'Entfernt'],
      ic: ['Offen', 'Entfernt'],
      discord: ['Offen', 'Entfernt'],
      dienstgegenstaende: ['Offen', 'Entfernt'],
      anzeige: ['Nein', 'Ja']
    };
    const keys = Object.keys(req.body || {});
    if (keys.length !== 1 || !Object.hasOwn(erlaubte, keys[0]))
      return res.status(400).json({ error: 'Ungültiges Feld' });
    const feld = keys[0], status = req.body[feld];
    if (!erlaubte[feld].includes(status))
      return res.status(400).json({ error: 'Ungültiger Status' });
    const { rows } = await db.query(
      `UPDATE kuendigungen SET ${feld} = $1 WHERE id = $2 RETURNING id`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Kündigung nicht gefunden' });
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
      [req.user.id, `Kündigung ${req.params.id}: ${feld} → ${status}`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Entfernen ausschließlich nach Bestätigung im Frontend und Berechtigung auf dem Server. */
app.delete('/api/kuendigung/:id', requireLogin, requireRight('kue', 2), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM kuendigungen WHERE id = $1 RETURNING id, vorname, nachname', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Kündigung nicht gefunden' });
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'del')`,
      [req.user.id, `Kündigung gelöscht: ${rows[0].vorname || ''} ${rows[0].nachname || ''} (ID ${rows[0].id})`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------- Benutzerverwaltung: ausschließlich Admin ---------- */

function nurAdmin(req, res, next) {
  if (req.user.rolle !== 'Administrator') {
    return res.status(403).json({ error: 'Nur der Administrator darf Zugänge verwalten' });
  }
  next();
}

app.get('/api/users', requireLogin, nurAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, dienstnummer, anzeigename, rolle, muss_passwort_aendern, gesperrt, erstellt FROM users ORDER BY dienstnummer`);
    const { rows: rollen } = await db.query(`SELECT name, farbe, sensibel FROM roles ORDER BY name`);
    const { rows: perms } = await db.query(`SELECT rolle, modul, stufe FROM role_perms`);
    res.json({ users: rows, rollen, perms });
  } catch (e) { next(e); }
});

app.post('/api/users', requireLogin, nurAdmin, async (req, res, next) => {
  try {
    const { dienstnummer, anzeigename, rolle, startpasswort } = req.body;
    if (!dienstnummer || !anzeigename || !rolle) return res.status(400).json({ error: 'Dienstnummer, Name und Rolle nötig' });
    if (String(startpasswort || '').length < 8) return res.status(400).json({ error: 'Startpasswort min. 8 Zeichen' });
    const { rows: r } = await db.query(`SELECT 1 FROM roles WHERE name = $1`, [rolle]);
    if (!r.length) return res.status(400).json({ error: 'Unbekannte Rolle' });
    const { rows } = await db.query(
      `INSERT INTO users (dienstnummer, anzeigename, rolle, passwort_hash, muss_passwort_aendern)
       VALUES ($1,$2,$3,$4,true) RETURNING id, dienstnummer, anzeigename, rolle`,
      [String(dienstnummer).trim(), anzeigename, rolle, await hashPassword(String(startpasswort))]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')`,
      [req.user.id, `Zugang angelegt: ${dienstnummer} ${anzeigename}`]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Diese Dienstnummer gibt es schon' });
    next(e);
  }
});

app.patch('/api/users/:id', requireLogin, nurAdmin, async (req, res, next) => {
  try {
    const { anzeigename, rolle, gesperrt, neues_passwort } = req.body;
    // Den einzigen Administrator nicht versehentlich durch den eigenen Dialog aussperren.
    if (Number(req.params.id) === Number(req.user.id) &&
       (gesperrt === true || (rolle != null && rolle !== 'Administrator'))) {
      return res.status(400).json({ error: 'Eigenen Administratorzugang nicht sperren oder herabstufen' });
    }
    if (rolle != null && !(await db.query('SELECT 1 FROM roles WHERE name=$1', [rolle])).rows.length)
      return res.status(400).json({ error: 'Unbekannte Rolle' });
    const felder = [], werte = [];
    if (anzeigename != null) { werte.push(anzeigename); felder.push(`anzeigename = $${werte.length}`); }
    if (rolle != null) { werte.push(rolle); felder.push(`rolle = $${werte.length}`); }
    if (gesperrt != null) { werte.push(!!gesperrt); felder.push(`gesperrt = $${werte.length}`); }
    if (neues_passwort) {
      if (String(neues_passwort).length < 8) return res.status(400).json({ error: 'Passwort min. 8 Zeichen' });
      werte.push(await hashPassword(String(neues_passwort)));
      felder.push(`passwort_hash = $${werte.length}`);
      felder.push(`muss_passwort_aendern = true`);
    }
    if (!felder.length) return res.status(400).json({ error: 'Keine Änderung übergeben' });
    werte.push(req.params.id);
    await db.query(`UPDATE users SET ${felder.join(', ')} WHERE id = $${werte.length}`, werte);
    await db.query(`DELETE FROM sessions WHERE user_id = $1`, [req.params.id]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
      [req.user.id, `Zugang geändert: ID ${req.params.id}`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/users/:id', requireLogin, nurAdmin, async (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ error: 'Der eigene Zugang kann nicht gelöscht werden' });
    }
    const { rows } = await db.query(`DELETE FROM users WHERE id = $1 RETURNING dienstnummer`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Zugang nicht gefunden' });
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'del')`,
      [req.user.id, `Zugang gelöscht: ${rows[0].dienstnummer}`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});


/* Berechtigungsmatrix: ausschließlich Administrator, Administratormatrix bleibt fest. */
app.patch('/api/rollen/:rolle/recht/:modul', requireLogin, nurAdmin, async (req, res, next) => {
  try {
    const rolle = req.params.rolle, modul = req.params.modul;
    const stufe = req.body?.stufe;
    const erlaubteModule = new Set(['dash', 'pers', 'bef', 'rout', 'sonder', 'dis',
      'kue', 'chk', 'rl', 'org', 'bl', 'log']);
    if (rolle === 'Administrator')
      return res.status(403).json({ error: 'Administratorrechte sind fest' });
    if (!erlaubteModule.has(modul) || ![0, 1, 2].includes(stufe))
      return res.status(400).json({ error: 'Ungültiges Modul oder Berechtigungsstufe' });
    const hatRolle = (await db.query('SELECT 1 FROM roles WHERE name=$1', [rolle])).rows.length;
    if (!hatRolle) return res.status(404).json({ error: 'Rolle nicht vorhanden' });
    await db.query(
      `INSERT INTO role_perms (rolle, modul, stufe) VALUES ($1, $2, $3)
       ON CONFLICT (rolle, modul) DO UPDATE SET stufe = EXCLUDED.stufe`, [rolle, modul, stufe]
    );
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
      [req.user.id, `Rollenrecht geändert: ${rolle}/${modul} → ${stufe}`]);
    res.json({ ok: true, rolle, modul, stufe });
  } catch(e) { next(e); }
});

app.get('/api/log', requireLogin, requireRight('log', 1), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT l.zeit, l.aktion, l.art, COALESCE(u.anzeigename, '–') AS benutzer
         FROM log l LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.zeit DESC LIMIT 500`);
    res.json(rows);
  } catch (e) { next(e); }
});

/* ---------- Fehler ---------- */

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Fehler' });
});

/* ---------- Start ---------- */

initDb()
  .then(() => app.listen(PORT, () => console.log(`Portal läuft auf Port ${PORT}`)))
  .catch(e => { console.error('Start fehlgeschlagen', e); process.exit(1); });
