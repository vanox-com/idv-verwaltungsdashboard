import express from 'express';
import cookieParser from 'cookie-parser';
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

function requireLogin(handler) {
  return async (req, res, next) => {
    try {
      const u = await currentUser(req);
      if (!u) return res.status(401).json({ error: 'Nicht angemeldet' });
      if (u.nur_passwortwechsel) return res.status(403).json({ error: 'Passwortwechsel erforderlich' });
      req.user = u;
      next();
    } catch (e) { next(e); }
  };
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
      daten.personal = (berechtigt('sonder') || berechtigt('dis'))
        ? daten.personal.map(p => ({
            personalnummer: p.personalnummer, vorname: p.vorname, nachname: p.nachname
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

/* Beförderung durchführen */
app.post('/api/befoerdern', requireLogin, requireRight('bef', 2), async (req, res, next) => {
  try {
    const { nr, neuer_rang, grund, am } = req.body;
    const { rows } = await db.query(`SELECT dienstgrad, vorname, nachname FROM personal WHERE personalnummer = $1`, [nr]);
    if (!rows.length) return res.status(404).json({ error: 'Person nicht gefunden' });
    await db.query(`UPDATE personal SET dienstgrad = $1 WHERE personalnummer = $2`, [neuer_rang, nr]);
    await db.query(
      `INSERT INTO befoerderungen (personalnummer, vorname, nachname, rang, neu_rang, grund, am)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [nr, rows[0].vorname, rows[0].nachname, rows[0].dienstgrad, neuer_rang, grund, am || null]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')`,
      [req.user.id, `Befördert: ${rows[0].nachname} ${rows[0].dienstgrad} → ${neuer_rang}`]);
    res.json({ ok: true });
  } catch (e) { next(e); }
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

/* Statuswechsel in der Kündigungsliste */
app.patch('/api/kuendigung/:id', requireLogin, requireRight('kue', 2), async (req, res, next) => {
  try {
    const erlaubt = ['waffe', 'copnet', 'emd', 'ic', 'discord', 'dienstgegenstaende', 'anzeige'];
    const feld = erlaubt.find(k => k in req.body);
    if (!feld) return res.status(400).json({ error: 'Unbekanntes Feld' });
    await db.query(`UPDATE kuendigungen SET ${feld} = $1 WHERE id = $2`, [req.body[feld], req.params.id]);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
      [req.user.id, `Kündigung ${req.params.id}: ${feld} → ${req.body[feld]}`]);
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
