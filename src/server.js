import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
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

/* Effektive Rechte: Ausnahme pro Benutzer > Gruppenrolle.
   Administrator bleibt privilegiert, ohne dass Einzel-Ausnahmen ihn aussperren. */
async function effektiveRechte(u) {
  const {rows}=await db.query(
    `SELECT modul,stufe FROM role_perms WHERE rolle=$1`,[u.rolle]);
  const rechte={};
  rows.forEach(r=>{rechte[r.modul]=Number(r.stufe)});
  if(u.rolle!=='Administrator') {
    const {rows:ausnahmen}=await db.query(
      'SELECT modul,stufe FROM user_perms WHERE user_id=$1',[u.id]);
    ausnahmen.forEach(r=>{rechte[r.modul]=Number(r.stufe)});
  }
  return rechte;
}
function requireRight(modul, stufe = 1) {
  return async (req,res,next)=>{
    try {
      const {rows}=await db.query(
        `SELECT COALESCE(
           CASE WHEN $3='Administrator' THEN NULL ELSE
             (SELECT stufe FROM user_perms WHERE user_id=$1 AND modul=$2) END,
           (SELECT stufe FROM role_perms WHERE rolle=$3 AND modul=$2),0) AS stufe`,
        [req.user.id,modul,req.user.rolle]);
      if(Number(rows[0]?.stufe||0)<stufe)
        return res.status(403).json({error:'Kein Recht für diesen Bereich'});
      next();
    }catch(e){next(e)}
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
    const rechte = await effektiveRechte(u);
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

/* Globale Startseiten-Kacheln: ausschließlich feste IDs ohne freies HTML. */
const DASHBOARD_WIDGET_IDS=new Set(["kpi-personal","kpi-kuendigungen","kpi-rueckgaben","kpi-disziplin","kpi-aktiv","kpi-neu30","kpi-urlaub","kpi-bef","panel-bef","panel-gruppen","panel-inaktiv","panel-geb","panel-jub","panel-dienstblatt","panel-links","panel-vorlagen","panel-info","panel-status","panel-neue","panel-bekanntmachungen"]);


/* Globale Dashboard-Anordnung darf nur ein Administrator verändern.
   Änderungen werden versioniert und in PostgreSQL dauerhaft gespeichert. */
app.put('/api/dashboard-layout',requireLogin,async(req,res,next)=>{
  try{
    if(req.user.rolle!=='Administrator')return res.status(403).json({error:'Nur Administratoren dürfen das Dashboard anpassen'});
    const version=req.body?.version,items=req.body?.items;
    if(!Number.isSafeInteger(version)||version<0||
       !Array.isArray(items)||items.length>DASHBOARD_WIDGET_IDS.size||
       !items.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&
         DASHBOARD_WIDGET_IDS.has(x.id)&&typeof x.sichtbar==='boolean')||
       new Set(items.map(x=>x.id)).size!==items.length)
      return res.status(400).json({error:'Ungültige Dashboard-Konfiguration'});
    const result=version===0?
      await db.query(
        'INSERT INTO dashboard_layout(id,items,version) VALUES(1,$1::jsonb,1) '+
        'ON CONFLICT(id) DO NOTHING RETURNING items,version',
        [JSON.stringify(items)]):
      await db.query(
        'UPDATE dashboard_layout SET items=$1::jsonb,version=version+1,aktualisiert=now() '+
        'WHERE id=1 AND version=$2 RETURNING items,version',
        [JSON.stringify(items),version]);
    if(!result.rows.length)return res.status(409).json({error:'Das Dashboard wurde bereits geändert. Bitte die Seite neu laden.'});
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Dashboard-Kacheln und Anordnung angepasst']);
    res.json(result.rows[0]);
  }catch(err){next(err)}
});

/* Dienstliche Bekanntmachungen: nur Administratoren können Inhalte verändern. */
app.post('/api/bekanntmachungen',requireLogin,async(req,res,next)=>{
  try {
    if(req.user.rolle!=='Administrator')return res.status(403).json({error:'Nur Administratoren'});
    const titel=String(req.body?.titel||'').trim(),inhalt=String(req.body?.inhalt||'').trim();
    if(!titel||!inhalt||titel.length>140||inhalt.length>3000)
      return res.status(400).json({error:'Titel (max. 140) und Inhalt (max. 3000) erforderlich'});
    const {rows}=await db.query('INSERT INTO bekanntmachungen(titel,inhalt) VALUES($1,$2) RETURNING id',[titel,inhalt]);
    res.json(rows[0]);
  }catch(e){next(e)}
});
app.put('/api/bekanntmachungen/:id',requireLogin,async(req,res,next)=>{
  try {
    if(req.user.rolle!=='Administrator')return res.status(403).json({error:'Nur Administratoren'});
    const id=Number(req.params.id),titel=String(req.body?.titel||'').trim(),inhalt=String(req.body?.inhalt||'').trim();
    if(!Number.isSafeInteger(id)||id<1||!titel||!inhalt||titel.length>140||inhalt.length>3000)
      return res.status(400).json({error:'Ungültige Bekanntmachung'});
    const {rowCount}=await db.query('UPDATE bekanntmachungen SET titel=$1,inhalt=$2 WHERE id=$3',[titel,inhalt,id]);
    if(!rowCount)return res.status(404).json({error:'Nicht gefunden'});
    res.json({ok:true});
  }catch(e){next(e)}
});
app.delete('/api/bekanntmachungen/:id',requireLogin,async(req,res,next)=>{
  try {
    if(req.user.rolle!=='Administrator')return res.status(403).json({error:'Nur Administratoren'});
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Ungültige ID'});
    await db.query('DELETE FROM bekanntmachungen WHERE id=$1',[id]);
    res.json({ok:true});
  }catch(e){next(e)}
});


/* Administrierbare Auswahlfelder: globale Werte werden serverseitig geprüft. */
app.get('/api/system-optionen',requireLogin,async(req,res,next)=>{
 try{
  const {rows}=await db.query('SELECT schluessel,werte FROM system_optionen ORDER BY schluessel');
  res.json(Object.fromEntries(rows.map(x=>[x.schluessel,x.werte])));
 }catch(e){next(e)}
});
app.put('/api/system-optionen/:key',requireLogin,async(req,res,next)=>{
 try{
  if(req.user.rolle!=='Administrator')return res.status(403).json({error:'Nur Administratoren'});
  const key=req.params.key;
  if(!['mitarbeitergruppen','beschaeftigungsarten'].includes(key))return res.status(400).json({error:'Unbekanntes Feld'});
  const werte=req.body?.werte;
  if(!Array.isArray(werte)||werte.length<1||werte.length>40||!werte.every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=80)||new Set(werte).size!==werte.length)
   return res.status(400).json({error:'Ungültige Auswahlwerte'});
  const required=key==='beschaeftigungsarten'?['Hauptberuf','Nebenberuf']:['Mittlerer Dienst','Gehobener Dienst','Polizeirat','Leitungsdienst','Nicht zugeordnet'];
  if(required.some(x=>!werte.includes(x)))return res.status(400).json({error:'Basiswerte dürfen nicht entfernt werden'});
  if(key==='beschaeftigungsarten' && (werte.length!==2||werte.some(x=>!required.includes(x))))return res.status(400).json({error:'Beschäftigungsarten bleiben Hauptberuf und Nebenberuf'});
  await db.query('INSERT INTO system_optionen(schluessel,werte) VALUES($1,$2::jsonb) ON CONFLICT(schluessel) DO UPDATE SET werte=EXCLUDED.werte,aktualisiert=now()',[key,JSON.stringify(werte)]);
  await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",[req.user.id,'Systemoptionen geändert: '+key]);
  res.json({ok:true});
 }catch(e){next(e)}
});
app.get('/api/personal/:nr/verlauf',requireLogin,requireRight('pers',1),requireRight('persverlauf',1),async(req,res,next)=>{
 try{
  const nr=Number(req.params.nr);
  if(!Number.isSafeInteger(nr)||nr<1)return res.status(400).json({error:'Ungültige Personalnummer'});
  const {rows:person}=await db.query('SELECT personalnummer,eintrittsdatum FROM personal WHERE personalnummer=$1',[nr]);
  const audit=await db.query("SELECT a.zeit,a.aenderungen,COALESCE(u.anzeigename,'–') AS benutzer FROM personal_audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.personalnummer=$1 ORDER BY a.zeit DESC LIMIT 100",[nr]);
  if(!person.length)return res.status(404).json({error:'Personalakte nicht gefunden'});
  const events=[];
  if(person[0].eintrittsdatum)events.push({zeit:person[0].eintrittsdatum,aktion:'Eintritt in den Dienst',art:'eintritt'});
  const logs=await db.query("SELECT l.zeit,l.aktion,l.art,COALESCE(u.anzeigename,'–') AS benutzer FROM log l LEFT JOIN users u ON u.id=l.user_id WHERE (l.aktion ~* ('(Personal|Personalnummer|Disziplinarakte|Kündigung automatisch angelegt):? '||$1::text||'([^0-9]|$)')) ORDER BY l.zeit DESC LIMIT 100",[nr]);
  const rightsHistory=await effektiveRechte(req.user);
  events.push(...logs.rows.filter(x=>rightsHistory.dis>=1||!x.aktion.startsWith('Disziplinarakte')));
  for(const a of audit.rows){for(const [feld,werte] of Object.entries(a.aenderungen||{}))events.push({zeit:a.zeit,aktion:feld+': '+String(werte.alt??'–')+' → '+String(werte.neu??'–'),benutzer:a.benutzer,art:'aenderung'});}
  if((await effektiveRechte(req.user)).dis>=1){
   const ds=await db.query('SELECT slots FROM disziplin WHERE personalnummer=$1',[nr]);
   const names=['Ermahnung','Verwarnung','Abmahnung','Suspendierung','Degradierung','Entlassung'];
   (ds.rows[0]?.slots||[]).forEach((x,i)=>{if(x?.done)events.push({zeit:x.d||null,aktion:'Disziplinarmaßnahme: '+(x.t||names[i]||'Maßnahme'),art:'disziplin'});});
  }
  res.json(events.sort((a,b)=>String(b.zeit||'').localeCompare(String(a.zeit||''))));
 }catch(e){next(e)}
});

/* Mitteilungen sind nur für die konkret zugewiesenen Konten abrufbar. */
app.get('/api/mitteilungen',requireLogin,requireRight('mitteilungen',1),async(req,res,next)=>{
 try{
  const {rows}=await db.query(
   'SELECT m.id,m.titel,m.inhalt,m.erstellt FROM portal_meldungen m JOIN portal_meldung_empfaenger e ON e.meldung_id=m.id WHERE e.user_id=$1 AND e.ausgeblendet_am IS NULL AND (m.sichtbar_ab IS NULL OR m.sichtbar_ab<=now()) AND (m.sichtbar_bis IS NULL OR m.sichtbar_bis>now()) ORDER BY m.erstellt DESC LIMIT 30',[req.user.id]);
  res.json(rows);
 }catch(e){next(e)}
});
app.get('/api/mitteilungen/empfaenger',requireLogin,requireRight('mitteilungen',2),async(req,res,next)=>{
 try{
  const {rows}=await db.query('SELECT id,anzeigename,rolle,dienstnummer FROM users WHERE gesperrt=false ORDER BY anzeigename');
  const groups=await db.query("SELECT DISTINCT gruppe FROM personal WHERE gruppe IS NOT NULL AND gruppe <> '' ORDER BY gruppe");
  res.json({users:rows,gruppen:groups.rows.map(x=>x.gruppe)});
 }catch(e){next(e)}
});
app.post('/api/mitteilungen',requireLogin,requireRight('mitteilungen',2),async(req,res,next)=>{
 const b=req.body||{},titel=String(b.titel||'').trim(),inhalt=String(b.inhalt||'').trim();
 const start=b.sichtbar_ab?new Date(b.sichtbar_ab):null,ende=b.sichtbar_bis?new Date(b.sichtbar_bis):null;
 if((start&&!Number.isFinite(start.getTime()))||(ende&&!Number.isFinite(ende.getTime()))||(start&&ende&&ende<=start))return res.status(400).json({error:'Ungültiger Anzeigezeitraum'});
 const ids=Array.isArray(b.userIds)?b.userIds:[];
 const rollen=Array.isArray(b.rollen)?b.rollen:[];
 const gruppen=Array.isArray(b.gruppen)?b.gruppen:[];
 if(!titel||!inhalt||titel.length>140||inhalt.length>3000||ids.length>500||rollen.length>30||gruppen.length>40||
    !ids.every(x=>Number.isSafeInteger(x)&&x>0)||!rollen.every(x=>typeof x==='string'&&x.length<100)||!gruppen.every(x=>typeof x==='string'&&x.length<100)||
    (!ids.length&&!rollen.length&&!gruppen.length))return res.status(400).json({error:'Ungültige Mitteilung oder Empfänger'});
 const client=await db.connect().catch(next);if(!client)return;
 try{
  await client.query('BEGIN');
  const recipients=await client.query(
    "SELECT DISTINCT u.id FROM users u LEFT JOIN personal p ON p.personalnummer = CASE WHEN u.dienstnummer ~ '^[0-9]{1,9}$' THEN u.dienstnummer::int ELSE NULL END WHERE u.gesperrt=false AND (u.id=ANY($1::int[]) OR u.rolle=ANY($2::text[]) OR p.gruppe=ANY($3::text[]))",
    [ids,rollen,gruppen]);
  if(!recipients.rows.length){await client.query('ROLLBACK');return res.status(400).json({error:'Keine gültigen Empfänger'});}
  const {rows}=await client.query('INSERT INTO portal_meldungen(titel,inhalt,absender_id,sichtbar_ab,sichtbar_bis) VALUES($1,$2,$3,$4,$5) RETURNING id',[titel,inhalt,req.user.id,start,ende]);
  for(const r of recipients.rows)await client.query('INSERT INTO portal_meldung_empfaenger(meldung_id,user_id) VALUES($1,$2)',[rows[0].id,r.id]);
  await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",[req.user.id,'Mitteilung an '+recipients.rows.length+' Empfänger erstellt']);
  await client.query('COMMIT');
  res.json({ok:true,anzahl:recipients.rows.length});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
});

/* Senderverwaltung: alle Nachrichten samt Zeitraum, unabhängig von ihrer Sichtbarkeit. */
app.get('/api/mitteilungen/verwaltung',requireLogin,requireRight('mitteilungen',2),async(req,res,next)=>{
 try{const {rows}=await db.query(`SELECT m.id,m.titel,m.inhalt,m.erstellt,m.sichtbar_ab,m.sichtbar_bis,
 COUNT(e.user_id)::int AS empfaenger FROM portal_meldungen m
 LEFT JOIN portal_meldung_empfaenger e ON e.meldung_id=m.id
 GROUP BY m.id ORDER BY m.erstellt DESC LIMIT 150`);res.json(rows)}catch(e){next(e)}
});
app.patch('/api/mitteilungen/:id',requireLogin,requireRight('mitteilungen',2),async(req,res,next)=>{
 try{
  const id=Number(req.params.id),b=req.body||{},titel=String(b.titel||'').trim(),inhalt=String(b.inhalt||'').trim();
  const start=b.sichtbar_ab?new Date(b.sichtbar_ab):null,ende=b.sichtbar_bis?new Date(b.sichtbar_bis):null;
  if(!Number.isSafeInteger(id)||id<1||!titel||!inhalt||titel.length>140||inhalt.length>3000||
    (start&&!Number.isFinite(start.getTime()))||(ende&&!Number.isFinite(ende.getTime()))||(start&&ende&&ende<=start))
   return res.status(400).json({error:'Ungültige Mitteilung oder Zeitraum'});
  const result=await db.query('UPDATE portal_meldungen SET titel=$1,inhalt=$2,sichtbar_ab=$3,sichtbar_bis=$4 WHERE id=$5',[titel,inhalt,start,ende,id]);
  if(!result.rowCount)return res.status(404).json({error:'Mitteilung nicht gefunden'});
  res.json({ok:true});
 }catch(e){next(e)}
});
app.delete('/api/mitteilungen/:id',requireLogin,requireRight('mitteilungen',2),async(req,res,next)=>{
 try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Ungültige ID'});
  const r=await db.query('DELETE FROM portal_meldungen WHERE id=$1',[id]);
  if(!r.rowCount)return res.status(404).json({error:'Mitteilung nicht gefunden'});
  res.json({ok:true});
 }catch(e){next(e)}
});
app.post('/api/mitteilungen/:id/ausblenden',requireLogin,requireRight('mitteilungen',1),async(req,res,next)=>{
 try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Ungültige ID'});
  const r=await db.query('UPDATE portal_meldung_empfaenger SET ausgeblendet_am=now() WHERE meldung_id=$1 AND user_id=$2',[id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:'Mitteilung nicht vorhanden'});
  res.json({ok:true});
 }catch(e){next(e)}
});
app.get('/api/personalstatistik',requireLogin,requireRight('pers',1),async(req,res,next)=>{
 try{
  const {rows}=await db.query("SELECT COALESCE(NULLIF(gruppe,''),'Nicht zugeordnet') AS gruppe,beschaeftigungsart,status,COUNT(*)::int AS anzahl FROM personal GROUP BY 1,2,3");
  const mon=await db.query("SELECT to_char(eintrittsdatum,'YYYY-MM') AS monat,count(*)::int AS anzahl FROM personal WHERE eintrittsdatum >= CURRENT_DATE - INTERVAL '12 months' GROUP BY 1 ORDER BY 1");
  res.json({gruppen:rows,eintritte:mon.rows});
 }catch(e){next(e)}
});

app.get('/api/backup-status',requireLogin,requireRight('backup',1),async(req,res,next)=>{
 try{const {rows}=await db.query('SELECT CURRENT_TIMESTAMP AS geprueft_am,pg_database_size(current_database())::bigint AS datenbank_bytes,current_database() AS datenbank,version() AS postgres_version');
 res.json({datenbank:rows[0].datenbank,bytes:String(rows[0].datenbank_bytes),geprueft_am:rows[0].geprueft_am,plan:'free',automatische_sicherungen:'Nicht bestätigt',wiederherstellung:'Nicht im Portal verfügbar',ablauf_am:'2026-11-27',hinweis:'Der kostenlose Render-Postgres-Dienst kann ablaufen. Diese Übersicht ist KEIN Backup und erstellt keine Sicherung.'});
 }catch(e){next(e)}
});

/* Design wird zentral gespeichert; nur Administratoren dürfen es ändern. */

const DESIGN_MOTIVE=['wappen','verlauf','ohne','nachtblau','stahl','raster','licht','minimal','einsatzszene','streife-nacht','streife-einsatz','polizeiweste'];
const DESIGN_KEYS=['flaeche','seitenleiste','rahmen','schrift','sekundaer','highlight'];
const HEX=/^#[0-9a-fA-F]{6}$/;
function valideDesign(d){
 return d&&typeof d.akzent==='string'&&HEX.test(d.akzent)&&Number.isInteger(d.schleier)&&d.schleier>=65&&d.schleier<=97&&DESIGN_MOTIVE.includes(d.hintergrund)&&
 (d.extras===undefined||(d.extras&&typeof d.extras==='object'&&!Array.isArray(d.extras)&&
 Object.keys(d.extras).every(k=>[...DESIGN_KEYS,'modus','preset'].includes(k))&&
 DESIGN_KEYS.every(k=>d.extras[k]===undefined||HEX.test(d.extras[k]))&&
 (d.extras.modus===undefined||['dunkel','hell'].includes(d.extras.modus))&&
 (d.extras.preset===undefined||['flori'].includes(d.extras.preset))));
}
const THEME_DEFAULT={akzent:'#5b86ba',schleier:88,hintergrund:'wappen',extras:{}};
app.get('/api/portal-design',requireLogin,async(req,res,next)=>{
 try{
  const [def,own]=await Promise.all([
   db.query('SELECT akzent,schleier,hintergrund,extras FROM portal_design WHERE id=1'),
   db.query('SELECT akzent,schleier,hintergrund,extras FROM portal_design_personal WHERE user_id=$1',[req.user.id])
  ]);
  res.json({...(own.rows[0]||def.rows[0]||THEME_DEFAULT),standard:def.rows[0]||THEME_DEFAULT,persoenlich:!!own.rows.length});
 }catch(e){next(e)}
});
app.put('/api/portal-design',requireLogin,requireRight('design',2),async(req,res,next)=>{
 try{
  if(!valideDesign(req.body))return res.status(400).json({error:'Ungültige Designeinstellungen'});
  const {akzent,schleier,hintergrund,extras={}}=req.body;
  await db.query('UPDATE portal_design SET akzent=$1,schleier=$2,hintergrund=$3,extras=$4::jsonb,aktualisiert=now() WHERE id=1',[akzent,schleier,hintergrund,JSON.stringify(extras)]);
  res.json({ok:true});
 }catch(e){next(e)}
});
app.put('/api/portal-design/personal',requireLogin,async(req,res,next)=>{
 try{
  if(!valideDesign(req.body))return res.status(400).json({error:'Ungültige Designeinstellungen'});
  const {akzent,schleier,hintergrund,extras={}}=req.body;
  await db.query('INSERT INTO portal_design_personal(user_id,akzent,schleier,hintergrund,extras) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(user_id) DO UPDATE SET akzent=$2,schleier=$3,hintergrund=$4,extras=$5::jsonb,aktualisiert=now()',[req.user.id,akzent,schleier,hintergrund,JSON.stringify(extras)]);
  res.json({ok:true});
 }catch(e){next(e)}
});
app.delete('/api/portal-design/personal',requireLogin,async(req,res,next)=>{
 try{await db.query('DELETE FROM portal_design_personal WHERE user_id=$1',[req.user.id]);res.json({ok:true})}catch(e){next(e)}
});
/* Der Generator liefert nur Akten, die der Nutzer ohnehin lesen darf. */

/* Rechte-Simulator zeigt nur effektive Rechte an; verändert keine Konten. */
app.get('/api/rechtesimulator',requireLogin,requireRight('rechtesimulator',1),async(req,res,next)=>{
 try{
  const {rows}=await db.query('SELECT id,anzeigename,dienstnummer,rolle,gesperrt FROM users ORDER BY anzeigename');
  res.json(rows);
 }catch(e){next(e)}
});
app.get('/api/rechtesimulator/:id',requireLogin,requireRight('rechtesimulator',1),async(req,res,next)=>{
 try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Ungültiges Konto'});
  const {rows}=await db.query('SELECT id,anzeigename,dienstnummer,rolle,gesperrt FROM users WHERE id=$1',[id]);
  if(!rows.length)return res.status(404).json({error:'Konto nicht gefunden'});
  const rechte=await effektiveRechte(rows[0]);
  res.json({user:rows[0],rechte});
 }catch(e){next(e)}
});
/* Historische Entwicklung nur aus belegten Eintritts- und Kündigungsdaten; keine Rückrechnung aus Status. */
app.get('/api/personalentwicklung',requireLogin,requireRight('pers',1),async(req,res,next)=>{
 try{
  const [ein,aus]=await Promise.all([
   db.query("SELECT to_char(eintrittsdatum,'YYYY-MM') AS monat,COUNT(*)::int AS anzahl FROM personal WHERE eintrittsdatum IS NOT NULL AND eintrittsdatum<=CURRENT_DATE GROUP BY 1 ORDER BY 1"),
   db.query("SELECT to_char(zeit,'YYYY-MM') AS monat,COUNT(*)::int AS anzahl FROM log WHERE art='edit' AND aktion ILIKE 'Personal % gekündigt%' GROUP BY 1 ORDER BY 1")
  ]);
  const [kuendigungen,unbekannt]=await Promise.all([
   db.query("SELECT to_char(kuendigungsdatum,'YYYY-MM') AS monat,COUNT(*)::int AS anzahl FROM kuendigungen WHERE kuendigungsdatum IS NOT NULL GROUP BY 1 ORDER BY 1"),
   db.query('SELECT COUNT(*)::int AS anzahl FROM kuendigungen WHERE kuendigungsdatum IS NULL')
  ]);
  res.json({eintritte:ein.rows,austritteProtokoll:aus.rows,kuendigungen:kuendigungen.rows,kuendigungenOhneDatum:unbekannt.rows[0]?.anzahl||0,hinweis:'Eintritte und datierte Kündigungen stammen aus gespeicherten Vorgängen. Ältere Kündigungen ohne belegtes Datum werden nicht einem Monat zugeordnet.'});
 }catch(e){next(e)}
});
/* ---------- Lesen ---------- */

app.get('/api/bootstrap', requireLogin, async (req, res, next) => {
  const beginn = Date.now();
  console.log('[dashboard] Datenabfrage gestartet, Dienstnummer:', req.user.dienstnummer);
  try {
    const [personal, raenge, funktionen, funktionsspalten, kuendigungen, disziplin,
      disziplinSpalten, richtlinie, checklisten, checklistenStatus, dashboard, routine, sonderzahlungen,
      organigramm, befoerderungen, dashboardLayout, bekanntmachungen] = await Promise.all([
      db.query(`SELECT * FROM personal ORDER BY personalnummer`),
      db.query(`SELECT * FROM raenge ORDER BY sortierung, name`),
      db.query(`SELECT * FROM sonderfunktionen`),
      db.query(`SELECT * FROM sonderfunktionsspalten ORDER BY sortierung`),
      db.query(`SELECT * FROM kuendigungen ORDER BY nachname`),
      db.query(`SELECT * FROM disziplin ORDER BY personalnummer`),
      db.query(`SELECT * FROM disziplinspalten ORDER BY sortierung`),
      db.query(`SELECT * FROM richtlinie ORDER BY sortierung`),
      db.query(`SELECT * FROM checklisten ORDER BY sortierung`),
      db.query(`SELECT name,punkt,erledigt FROM checklisten_status`),
      db.query(`SELECT * FROM dashboard ORDER BY sortierung`),
      db.query(`SELECT * FROM routine ORDER BY sortierung`),
      db.query(`SELECT * FROM sonderzahlungen ORDER BY nachname`),
      db.query(`SELECT * FROM organigramm ORDER BY sortierung`),
      db.query(`SELECT * FROM befoerderungen ORDER BY nachname`),
      db.query(`SELECT items,version FROM dashboard_layout WHERE id=1`),
      db.query(`SELECT id,titel,inhalt,erstellt FROM bekanntmachungen ORDER BY erstellt DESC,id DESC LIMIT 30`)
    ]);

    const rolle = req.user.rolle;
    const rechte = await effektiveRechte(req.user);
    const sensibel = (await db.query(`SELECT sensibel FROM roles WHERE name = $1`, [rolle])).rows[0]?.sensibel;

    const daten = {
      personal: personal.rows, raenge: raenge.rows,
      funktionsspalten: funktionsspalten.rows.map(r => r.name),
      funktionen: funktionen.rows.map(r => ({ nr: r.personalnummer, leitung: r.leitung, sonstige: r.sonstige, werte: r.werte })),
      kuendigungen: kuendigungen.rows,
      disziplinSpalten: disziplinSpalten.rows.map(r => r.name),
      disziplin: disziplin.rows.map(r => ({ nr: r.personalnummer, massnahmen: r.massnahmen, slots: r.slots, bemerkung: r.bemerkung })),
      richtlinie: { stand: richtlinie.rows[0]?.stand || '', zeilen: richtlinie.rows },
      checklisten: checklisten.rows.map(r => ({ name: r.name, aufgaben: r.aufgaben })),
      checklistenStatus: checklistenStatus.rows,
      dashboard: {
        layout: dashboardLayout.rows[0]||{items:[],version:0},
        bekanntmachungen: bekanntmachungen.rows,
        personal: dashboard.rows.filter(r => r.art === 'personal').map(r => ({ label: r.text, anzahl: r.anzahl })),
        vorlagen: dashboard.rows.filter(r => r.art === 'vorlage').map(r => ({ text: r.text, url: r.url })),
        info: dashboard.rows.filter(r => r.art === 'info').map(r => ({ text: r.text, url: r.url })),
        links: dashboard.rows.filter(r => r.art === 'link').map(r => ({ text: r.text, url: r.url }))
      },
      routine: routine.rows.map(r => ({ id: r.id, nr: r.personalnummer, tage: r.tage, personen: r.personen })),
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
      disziplinFaelle: disziplin.rows.filter(d =>
        (Array.isArray(d.massnahmen) && d.massnahmen.length > 0) ||
        (Array.isArray(d.slots) && d.slots.some(x => x && (x.done || x.t || x.u || x.d)))).length
    };

    /* Berechtigungen auch bei API-Ausgabe erzwingen, nicht nur Menüpunkte verstecken. */
    const berechtigt = m => (rechte[m] || 0) >= 1;

    /* Die Original-Startseite zeigt aktuelle Ereignisse.
       Ereignisdaten verlassen den Server nur bei entsprechendem Modulrecht. */
    const heute = berlinTodayUtc();
    const heuteMs = heute.getTime();
    const isoDatum = value => value
      ? (value instanceof Date ? value.toISOString().slice(0,10) : String(value).slice(0,10))
      : '';
    const dateDays = iso => Math.round((Date.parse(iso+'T00:00:00Z') - heuteMs)/86400000);
    const personenName = p => [p.vorname,p.nachname].filter(Boolean).join(' ');
    const neu30=personal.rows.filter(p=>{
      const datum=isoDatum(p.eintrittsdatum);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(datum))return false;
      const d=dateDays(datum);
      return d<=0&&d>=-29;
    });
    const aktiveStatus=new Set(['Aktiv']);
    daten.dashboard.summary.aktiv=personal.rows.filter(p=>aktiveStatus.has(p.status)).length;
    daten.dashboard.summary.neu30=berechtigt('pers')?neu30.length:null;
    daten.dashboard.summary.urlaub=berechtigt('pers')?personal.rows.filter(p=>{
      const von=isoDatum(p.urlaub_von),bis=isoDatum(p.urlaub_bis);
      return /^\d{4}-\d{2}-\d{2}$/.test(von)&&/^\d{4}-\d{2}-\d{2}$/.test(bis)&&
        von<=isoDatum(heute)&&bis>=isoDatum(heute);
    }).length:null;
    daten.dashboard.neueinstellungen=berechtigt('pers')?neu30
      .map(p=>({name:personenName(p),gruppe:p.gruppe||'',eintritt:isoDatum(p.eintrittsdatum)}))
      .sort((a,b)=>b.eintritt.localeCompare(a.eintritt)).slice(0,8):[];
    const statusCounts=new Map();
    for(const p of personal.rows){
      const st=p.status||'Nicht zugeordnet';
      statusCounts.set(st,(statusCounts.get(st)||0)+1);
    }
    daten.dashboard.statusverteilung=[...statusCounts].map(([name,anzahl])=>({name,anzahl}))
      .sort((a,b)=>b.anzahl-a.anzahl||a.name.localeCompare(b.name,'de'));

    const gruppen = new Map();
    for (const p of personal.rows) {
      const key=p.gruppe||'Nicht zugeordnet';
      gruppen.set(key,(gruppen.get(key)||0)+1);
    }
    daten.dashboard.gruppen = [...gruppen].map(([name,anzahl])=>({name,anzahl}))
      .sort((a,b)=>b.anzahl-a.anzahl||a.name.localeCompare(b.name,'de'));
    // Beschäftigungsarten und Mitarbeitergruppen getrennt auswerten.
    const dienstgruppen=['Mittlerer Dienst','Gehobener Dienst','Polizeirat','Leitungsdienst','Nicht zugeordnet'];
    const arten=['Hauptberuf','Nebenberuf'];
    const matrix=dienstgruppen.map(gruppe=>({gruppe,hauptberuf:0,nebenberuf:0,gesamt:0}));
    const nachGruppe=new Map(matrix.map(z=>[z.gruppe,z]));
    const summen={hauptberuf:0,nebenberuf:0,gesamt:0};
    for(const p of personal.rows){
      const art=p.beschaeftigungsart==='Nebenberuf'?'nebenberuf':'hauptberuf';
      const gruppe=nachGruppe.has(p.gruppe)?p.gruppe:'Nicht zugeordnet';
      const zeile=nachGruppe.get(gruppe);
      zeile[art]++; zeile.gesamt++;
      summen[art]++; summen.gesamt++;
    }
    daten.dashboard.beschaeftigung={summen,gruppen:matrix};
    daten.dashboard.inaktiv = berechtigt('pers') ? personal.rows
      .filter(p=>['Abgemeldet','Suspendiert','Inaktiv'].includes(p.status))
      .map(p=>({nummer:p.personalnummer,name:personenName(p),status:p.status,dienstgrad:p.dienstgrad||''}))
      : [];
    daten.dashboard.faellige = [];
    if (berechtigt('bef')) {
      const raengeListe=raenge.rows;
      const alleFaelligen=personal.rows.filter(p=>p.status!=='Gekündigt').flatMap(p=>{
        const i=raengeListe.findIndex(r=>r.name===p.dienstgrad);
        const current=raengeListe[i],next=raengeListe[i+1];
        if (!current||!next||!Number(current.tage)) return [];
        let faellig=isoDatum(p.naechste_befoerderung);
        if (!faellig && p.letzte_befoerderung) {
          const letzte=isoDatum(p.letzte_befoerderung);
          const d=new Date(letzte+'T00:00:00Z');
          if (Number.isNaN(d.getTime()))return [];
          d.setUTCDate(d.getUTCDate()+Number(current.tage));
          faellig=d.toISOString().slice(0,10);
        }
        if (!faellig || dateDays(faellig)>0)return [];
        return [{nummer:p.personalnummer,name:personenName(p),dienstgrad:p.dienstgrad,
          naechsterRang:next.name,faellig,porStatus:p.por_status||'offen'}];
      }).sort((a,b)=>a.faellig.localeCompare(b.faellig));
      daten.dashboard.faellige=alleFaelligen.slice(0,8);
      daten.dashboard.summary.faelligeBef=alleFaelligen.length;
    }
    if(!berechtigt('bef'))daten.dashboard.summary.faelligeBef=null;
    const kommenderJahrestag=(value,minimum)=>{
      const iso=isoDatum(value);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
      const year=Number(iso.slice(0,4)),month=Number(iso.slice(5,7)),day=Number(iso.slice(8,10));
      let next=new Date(Date.UTC(heute.getUTCFullYear(),month-1,day));
      if(next.getTime()<heuteMs)next=new Date(Date.UTC(heute.getUTCFullYear()+1,month-1,day));
      const rest=Math.round((next.getTime()-heuteMs)/86400000);
      const jahre=next.getUTCFullYear()-year;
      if(rest<0||rest>30||jahre<minimum)return null;
      return {tage:rest,jahre};
    };
    const vorschau=(feld,minimum)=>personal.rows
      .filter(p=>p.status!=='Gekündigt')
      .flatMap(p=>{
        const j=kommenderJahrestag(p[feld],minimum);
        return j?[{nummer:p.personalnummer,name:personenName(p),dienstgrad:p.dienstgrad||'',...j}]:[];
      }).sort((a,b)=>a.tage-b.tage||a.name.localeCompare(b.name,'de'));
    daten.dashboard.geburtstage=berechtigt('geb')?vorschau('geburtsdatum',0):[];
    daten.dashboard.jubilaeen=berechtigt('jub')?vorschau('eintrittsdatum',1):[];
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
    if (!berechtigt('chk')) { daten.checklisten = []; daten.checklistenStatus = []; }
    if (!berechtigt('rl')) daten.richtlinie = { stand: '', zeilen: [] };
    if (!berechtigt('org')) daten.organigramm = [];
    if (!berechtigt('dash')) daten.dashboard = { personal: [], vorlagen: [], info: [], links: [], summary: {},layout:{items:[],version:0} };

    if (!berechtigt('pers')) {
      /* Funktions- und Disziplinansichten benötigen Namen, aber keine Personalakte. */
      daten.personal = (berechtigt('sonder') || berechtigt('dis') || berechtigt('bef') || berechtigt('rout'))
        ? daten.personal.map(p => ({
            personalnummer: p.personalnummer, vorname: p.vorname, nachname: p.nachname,
            ...(berechtigt('dis') ? { dienstgrad: p.dienstgrad } : {}),
            ...(berechtigt('bef') ? {
              status: p.status, dienstgrad: p.dienstgrad,
              letzte_befoerderung: p.letzte_befoerderung,
              naechste_befoerderung: p.naechste_befoerderung,
              por_status: p.por_status, por_notiz: p.por_notiz, por_am: p.por_am
            } : {})
          }))
        : [];
    } else if (!sensibel) {
      /* Aus einer geschützten Vollakte dürfen keine vertraulichen Dokumente,
         Notizen, Geburtstage oder Urlaubsdaten im Netzwerk ankommen. */
      daten.personal = daten.personal.map(p => ({
        personalnummer: p.personalnummer, vorname: p.vorname, nachname: p.nachname,
        gruppe: p.gruppe, beschaeftigungsart: p.beschaeftigungsart, status: p.status, dienstgrad: p.dienstgrad,
        nebenjob: p.nebenjob, eintrittsdatum: p.eintrittsdatum,
        waffenschein: p.waffenschein, spind: p.spind,
        ...(berechtigt('bef') ? {
          letzte_befoerderung: p.letzte_befoerderung,
          naechste_befoerderung: p.naechste_befoerderung,
          por_status: p.por_status, por_notiz: p.por_notiz, por_am: p.por_am
        } : {})
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

/* Dienstgrade vorhandener Mitarbeiter werden ausschließlich über den
   transaktional abgesicherten POR-Beförderungsablauf geändert. */
const vertraulichePersonalFelder = new Set([
  'geburtsdatum', 'handy', 'arbeitsvertrag', 'ernennungsurkunde',
  'arbeitsvertrag_url', 'ernennungsurkunde_url',
  'urlaub_von', 'urlaub_bis', 'urlaub_tage', 'bemerkung', 'rsa',
  'waffenschein', 'spind'
]);
async function darfVertraulichesPersonalBearbeiten(rolle, daten) {
  if (!Object.keys(daten).some(k => vertraulichePersonalFelder.has(k))) return true;
  const {rows} = await db.query('SELECT sensibel FROM roles WHERE name=$1', [rolle]);
  return !!rows[0]?.sensibel;
}
function dokumentLinksValidieren(body) {
  for (const feld of ['arbeitsvertrag_url','ernennungsurkunde_url']) {
    if (!Object.hasOwn(body,feld)) continue;
    if (typeof body[feld] !== 'string' || body[feld].length > 2048)
      return 'Ungültiger Dokumentenlink';
    const wert=body[feld].trim();
    if (!wert) { body[feld]=''; continue; }
    try {
      const link=new URL(wert);
      if (link.protocol !== 'https:' || !link.hostname.includes('.') ||
          link.username || link.password || /\s/.test(wert))
        return 'Bitte einen gültigen HTTPS-Dokumentenlink eingeben';
      body[feld]=link.href;
    } catch(e) { return 'Bitte einen gültigen HTTPS-Dokumentenlink eingeben'; }
  }
  return null;
}
/* Kündigt jemand über die Personalakte, wird der Kündigungsvorgang
   mit denselben Daten in EINER Datenbanktransaktion angelegt. Die
   Personalsperre verhindert parallele automatische Doppelvorgänge.
   Bereits vorhandene manuelle/alte Einträge werden nicht dupliziert. */
app.patch('/api/personal/:nr', requireLogin, requireRight('pers', 2), async (req,res,next)=>{
  const nr=Number(req.params.nr);
  if(!Number.isSafeInteger(nr)||nr<1)
    return res.status(400).json({error:'Ungültige Personalnummer'});
  const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  if(Object.hasOwn(body,'dienstgrad'))
    return res.status(409).json({error:'Dienstgrad ausschließlich über die Beförderungsverwaltung ändern'});
  const beantragterRang=String(body.beantragter_rang||'').trim();
  const rangBegruendung=String(body.rang_begruendung||'').trim();
  const rangDatum=body.rang_datum?String(body.rang_datum):null;
  if(rangDatum&&(!/^\d{4}-\d{2}-\d{2}$/.test(rangDatum)||!Number.isFinite(Date.parse(rangDatum))))return res.status(400).json({error:'Ungültiges Beförderungsdatum',feld:'letzte_befoerderung'});
  if(beantragterRang && (beantragterRang.length>150||rangBegruendung.length>1000))
    return res.status(400).json({error:'Ungültiger Rangänderungsantrag',feld:'dienstgrad'});
  if(!await darfVertraulichesPersonalBearbeiten(req.user.rolle,body))
    return res.status(403).json({error:'Kein Recht für vertrauliche Personalfelder'});
  const linkFehler=dokumentLinksValidieren(body);
  if(linkFehler)return res.status(400).json({error:linkFehler});
  const grund=body.kuendigungsgrund;
  if(Object.hasOwn(body,'kuendigungsgrund')&&typeof grund!=='string')
    return res.status(400).json({error:'Kündigungsgrund muss Text sein'});
  if(typeof grund==='string'&&grund.trim().length>1000)
    return res.status(400).json({error:'Kündigungsgrund darf maximal 1000 Zeichen lang sein'});
  const erlaubt=['vorname','nachname','geburtsdatum','handy','waffenschein','spind',
    'nebenjob','eintrittsdatum','arbeitsvertrag','ernennungsurkunde',
    'arbeitsvertrag_url','ernennungsurkunde_url',
    'urlaub_von','urlaub_bis','urlaub_tage','bemerkung','rsa','status','gruppe','beschaeftigungsart'];
  const felder=[],werte=[];
  erlaubt.forEach(k=>{
    if(Object.hasOwn(body,k)){
      werte.push(body[k]==='' ? (['arbeitsvertrag_url','ernennungsurkunde_url'].includes(k)?'':null) : body[k]);
      felder.push(k+' = $'+werte.length);
    }
  });
  if(!felder.length)return res.status(400).json({error:'Keine Felder übergeben'});
  const client=await db.connect().catch(next);
  if(!client)return;
  try{
    await client.query('BEGIN');
    const {rows:vorher}=await client.query(
      'SELECT personalnummer,status,vorname,nachname,dienstgrad,handy,gruppe,beschaeftigungsart,nebenjob,'+
      'arbeitsvertrag,ernennungsurkunde,arbeitsvertrag_url,ernennungsurkunde_url,eintrittsdatum '+
      'FROM personal WHERE personalnummer=$1 FOR UPDATE',[nr]);
    if(!vorher.length){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'Personalakte nicht gefunden'});
    }
    if(beantragterRang){
      const rangCheck=await client.query('SELECT 1 FROM raenge WHERE name=$1',[beantragterRang]);
      if(!rangCheck.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'Gewählter Dienstgrad ist unbekannt',feld:'dienstgrad'});}
      const open=await client.query("SELECT 1 FROM personal_rangantraege WHERE personalnummer=$1 AND status='beantragt'",[nr]);
      if(open.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Für diese Personalakte besteht bereits ein offener Rangantrag',feld:'dienstgrad'});}
    }
    const wechsel=Object.hasOwn(body,'status')&&body.status==='Gekündigt'&&vorher[0].status!=='Gekündigt';
    if(wechsel){
      /* Das Recht für die Personalakte alleine berechtigt NICHT zur
         Erstellung von Kündigungsvorgängen. */
      const {rows:rechte}=await client.query(
        'SELECT COALESCE('+
        "CASE WHEN $3='Administrator' THEN NULL ELSE "+
        '(SELECT stufe FROM user_perms WHERE user_id=$1 AND modul=$2) END,'+
        '(SELECT stufe FROM role_perms WHERE rolle=$3 AND modul=$2),0) AS stufe',
        [req.user.id,'kue',req.user.rolle]);
      if(Number(rechte[0]?.stufe||0)<2){
        await client.query('ROLLBACK');
        return res.status(403).json({error:'Zum Kündigen ist zusätzlich „Kündigungen → Bearbeiten“ erforderlich'});
      }
      if(!String(grund||'').trim()){
        await client.query('ROLLBACK');
        return res.status(400).json({error:'Bitte einen Kündigungsgrund angeben'});
      }
    }
    werte.push(nr);
    const {rows:aktualisiert}=await client.query(
      'UPDATE personal SET '+felder.join(', ')+' WHERE personalnummer=$'+werte.length+
      ' RETURNING personalnummer,vorname,nachname,dienstgrad,handy,arbeitsvertrag,'+
      'ernennungsurkunde,arbeitsvertrag_url,ernennungsurkunde_url,eintrittsdatum',werte);
    let rangantragAngelegt=false;
    if(beantragterRang){
      await client.query('INSERT INTO personal_rangantraege(personalnummer,alter_rang,beantragter_rang,begruendung,antragsteller_id,korrigiertes_befoerderungsdatum) VALUES($1,$2,$3,$4,$5,$6)',[nr,vorher[0].dienstgrad||'',beantragterRang,rangBegruendung,req.user.id,rangDatum]);
      rangantragAngelegt=true;
    }
    let kuendigungAngelegt=false,kuendigungVorhanden=false;
    if(wechsel){
      const {rows:vorhanden}=await client.query(
        'SELECT id FROM kuendigungen WHERE personalnummer=$1 ORDER BY id DESC LIMIT 1',[nr]);
      kuendigungVorhanden=vorhanden.length>0;
      if(!kuendigungVorhanden){
        const p=aktualisiert[0];
        const dokument=(titel,url)=>url?JSON.stringify({t:String(titel||'Dokument'),u:String(url)}):
          String(titel||'');
        await client.query(
          'INSERT INTO kuendigungen '+
          '(personalnummer,vorname,nachname,rang,grund,handy,vertrag,eintritt,urkunde) '+
          'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [nr,p.vorname,p.nachname,p.dienstgrad,grund.trim(),p.handy,
            dokument(p.arbeitsvertrag,p.arbeitsvertrag_url),p.eintrittsdatum,
            dokument(p.ernennungsurkunde,p.ernennungsurkunde_url)]);
        kuendigungAngelegt=true;
        await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",
          [req.user.id,'Kündigung automatisch angelegt: '+nr+' '+[p.vorname,p.nachname].filter(Boolean).join(' ')]);
      }
    }
    const auditFelder=['vorname','nachname','status','gruppe','beschaeftigungsart','nebenjob','eintrittsdatum'];
    const geaendert={};
    for(const feld of auditFelder){
      if(Object.hasOwn(body,feld)){
        const vorherWert=vorher[0][feld]??null, nachherWert=body[feld]||null;
        if(String(vorherWert??'')!==String(nachherWert??''))geaendert[feld]={alt:vorherWert,neu:nachherWert};
      }
    }
    if(Object.keys(geaendert).length)await client.query(
      'INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES($1,$2,$3::jsonb)',
      [nr,req.user.id,JSON.stringify(geaendert)]);
    await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Personal '+nr+' geändert'+(wechsel?' (Status: Gekündigt)':'')]);
    await client.query('COMMIT');
    res.json({ok:true,rangantrag_angelegt:rangantragAngelegt,kuendigung_angelegt:kuendigungAngelegt,kuendigung_vorhanden:kuendigungVorhanden});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    next(e);
  }finally{client.release()}
});

app.post('/api/personal', requireLogin, requireRight('pers', 2), async (req, res, next) => {
  try {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (!await darfVertraulichesPersonalBearbeiten(req.user.rolle, b))
      return res.status(403).json({ error: 'Kein Recht für vertrauliche Personalfelder' });
    const linkFehler = dokumentLinksValidieren(b);
    if (linkFehler) return res.status(400).json({error:linkFehler});
    const nr=Number(b.personalnummer);
    if (!Number.isSafeInteger(nr) || nr < 1)
      return res.status(400).json({ error: 'Ungültige Personalnummer' });
    if (!String(b.vorname || '').trim() || !String(b.nachname || '').trim())
      return res.status(400).json({ error: 'Vor- und Nachname nötig' });
    if(b.status==='Gekündigt')
      return res.status(400).json({error:'Bitte erst die Personalakte anlegen und anschließend über „Bearbeiten“ kündigen'});
    const { rows } = await db.query(
      `INSERT INTO personal (personalnummer, gruppe, beschaeftigungsart, status, vorname, nachname, geburtsdatum, handy,
        waffenschein, spind, nebenjob, dienstgrad, eintrittsdatum, arbeitsvertrag, ernennungsurkunde,
        urlaub_von, urlaub_bis, urlaub_tage, bemerkung, rsa, arbeitsvertrag_url, ernennungsurkunde_url)
       VALUES ($1,$2,$3,$22,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING personalnummer,vorname,nachname,gruppe,status,dienstgrad`,
      [nr, b.gruppe || 'Nicht zugeordnet', b.status || 'Aktiv', b.vorname, b.nachname, b.geburtsdatum || null,
        b.handy, !!b.waffenschein, !!b.spind, b.nebenjob, b.dienstgrad, b.eintrittsdatum || null,
        b.arbeitsvertrag, b.ernennungsurkunde, b.urlaub_von || null, b.urlaub_bis || null, b.urlaub_tage, b.bemerkung, b.rsa,
        b.arbeitsvertrag_url || '', b.ernennungsurkunde_url || '', b.beschaeftigungsart === 'Nebenberuf' ? 'Nebenberuf' : 'Hauptberuf']);
    await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'add')`,
      [req.user.id, `Personal ${nr} angelegt`]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Diese Personalnummer gibt es bereits' });
    next(e);
  }
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


/* Disziplinarakten nach den sechs Maßnahmentypen aus der Originaldatei. */
app.patch('/api/disziplin/:nr', requireLogin, requireRight('dis', 2), async(req,res,next)=>{
  try {
    const nr=Number(req.params.nr), slots=req.body?.slots, bemerkung=req.body?.bemerkung;
    if(!Number.isSafeInteger(nr)||nr<1)return res.status(400).json({error:'Ungültige Personalnummer'});
    if(!Array.isArray(slots)||slots.length!==6)return res.status(400).json({error:'Genau sechs Maßnahmenslots erforderlich'});
    if(typeof bemerkung!=='string'||bemerkung.length>4000)
      return res.status(400).json({error:'Bemerkung zu lang'});
    const erlaubte=new Set(['done','t','u','d']);
    const clean=[];
    for(const x of slots){
      if(x===null){clean.push(null);continue;}
      if(!x||typeof x!=='object'||Array.isArray(x)||
         Object.keys(x).some(k=>!erlaubte.has(k))||
         typeof x.done!=='boolean'||typeof x.t!=='string'||
         typeof x.u!=='string'||typeof x.d!=='string')
        return res.status(400).json({error:'Ungültiges Maßnahmenformat'});
      if(x.t.length>1500||x.u.length>2000||x.d.length>10)
        return res.status(400).json({error:'Maßnahmendaten zu lang'});
      if(x.u&& !/^https:\/\/[^\s]+$/i.test(x.u))
        return res.status(400).json({error:'Dokumentenlink muss mit https:// beginnen'});
      if(x.d && (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x.d) ||
         Number.isNaN(Date.parse(x.d))))
        return res.status(400).json({error:'Ungültiges Maßnahmendatum'});
      clean.push({done:x.done,t:x.t,u:x.u,d:x.d});
    }
    const {rows}=await db.query(
      "INSERT INTO disziplin (personalnummer,slots,bemerkung) SELECT personalnummer,$2::jsonb,$3 FROM personal WHERE personalnummer=$1 ON CONFLICT (personalnummer) DO UPDATE SET slots=EXCLUDED.slots,bemerkung=EXCLUDED.bemerkung,aktualisiert=now() RETURNING personalnummer",
      [nr,JSON.stringify(clean),bemerkung]
    );
    if(!rows.length)return res.status(404).json({error:'Personalnummer nicht gefunden'});
    await db.query("INSERT INTO log (user_id,aktion,art) VALUES ($1,$2,'edit')",
      [req.user.id,'Disziplinarakte bei Personalnummer '+nr+' geändert']);
    res.json({ok:true});
  }catch(err){next(err);}
});


/* ---------- Routine und Sonderzahlungen ---------- */
/* Alle Routineänderungen sperren die betreffende Zeile für die Dauer der
   Transaktion. So überschreiben zwei parallele Anwesenheitsklicks nicht
   gegenseitig die Daten des anderen. */
function routineFehler(status, text) {
  const e = new Error(text);
  e.httpStatus = status;
  return e;
}
async function routineAendern(req, res, next, bearbeiten) {
  const id = Number(req.params.id);
  if(!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({error:'Ungültige Routine'});
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const result=await client.query(
      'SELECT id,tage,personen FROM routine WHERE id=$1 FOR UPDATE', [id]);
    if(!result.rows.length) throw routineFehler(404,'Routine nicht gefunden');
    const r=result.rows[0],tage=r.tage,personen=r.personen;
    if(!Array.isArray(tage)||!Array.isArray(personen))
      throw routineFehler(409,'Routine-Daten sind nicht vollständig');
    const text=await bearbeiten({tage,personen,client});
    await client.query('UPDATE routine SET tage=$1::jsonb, personen=$2::jsonb WHERE id=$3',
      [JSON.stringify(tage),JSON.stringify(personen),id]);
    await client.query("INSERT INTO log (user_id,aktion,art) VALUES ($1,$2,'edit')",
      [req.user.id,text]);
    await client.query('COMMIT');
    return res.json({ok:true});
  }catch(e){
    if(client)await client.query('ROLLBACK').catch(()=>{});
    if(e.httpStatus) return res.status(e.httpStatus).json({error:e.message});
    return next(e);
  }finally{ if(client)client.release(); }
}
app.post('/api/routine/:id/anwesenheit',requireLogin,requireRight('rout',2),
  async(req,res,next)=>routineAendern(req,res,next,async({tage,personen})=>{
    const nr=Number(req.body?.nr),i=Number(req.body?.tagIndex),
      anwesend=req.body?.anwesend;
    if(!Number.isSafeInteger(nr)||nr<1||!Number.isSafeInteger(i)||i<0||i>=tage.length||
       typeof anwesend!=='boolean')
      throw routineFehler(400,'Ungültige Person, Termin oder Anwesenheit');
    const p=personen.find(x=>Number(x.nr)===nr);
    if(!p)throw routineFehler(404,'Person nicht im Routineplan');
    if(!Array.isArray(p.anwesend)||p.anwesend.length!==tage.length)
      throw routineFehler(409,'Anwesenheitsliste ist nicht synchron mit den Terminen');
    p.anwesend[i]=anwesend;
    return 'Routine '+req.params.id+': Anwesenheit '+nr+' / '+tage[i]+
      ' → '+(anwesend?'ja':'nein');
  }));
function routineDatum(iso){
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const d=new Date(iso+'T00:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso ? d : null;
}
function routineIsoDatum(tag){
  if(/^\d{4}-\d{2}-\d{2}$/.test(tag))return tag;
  const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(tag);
  return m?m[3]+'-'+m[2]+'-'+m[1]:null;
}
app.post('/api/routine/:id/termin',requireLogin,requireRight('rout',2),
  async(req,res,next)=>routineAendern(req,res,next,async({tage,personen})=>{
    const iso=req.body?.datum, d=routineDatum(iso);
    if(!d)throw routineFehler(400,'Ungültiges Termindatum');
    if(tage.length>=52)throw routineFehler(409,'Maximal 52 Routinetermine');
    if(tage.some(t=>routineIsoDatum(t)===iso))
      throw routineFehler(409,'Termin existiert bereits');
    if(tage.some(t=>!routineDatum(routineIsoDatum(t))))
      throw routineFehler(409,'Ein vorhandenes Termindatum ist ungültig');
    const index=tage.findIndex(t=>routineIsoDatum(t)>iso);
    const pos=index<0?tage.length:index;
    const dd=iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4);
    const alteLaenge=tage.length;
    for(const p of personen){
      if(!Array.isArray(p.anwesend)||p.anwesend.length!==alteLaenge)
        throw routineFehler(409,'Anwesenheitsliste ist nicht synchron mit den Terminen');
      p.anwesend.splice(pos,0,false);
    }
    tage.splice(pos,0,dd);
    return 'Routine '+req.params.id+': Termin '+dd+' angelegt';
  }));
app.post('/api/routine/:id/teilnehmer',requireLogin,requireRight('rout',2),
  async(req,res,next)=>routineAendern(req,res,next,async({tage,personen,client})=>{
    const nr=Number(req.body?.nr);
    if(!Number.isSafeInteger(nr)||nr<1)throw routineFehler(400,'Ungültige Personalnummer');
    if(personen.some(p=>Number(p.nr)===nr))throw routineFehler(409,'Person ist bereits eingetragen');
    if(personen.length>=500)throw routineFehler(409,'Maximal 500 Teilnehmende');
    const {rows}=await client.query(
      'SELECT vorname,nachname,status FROM personal WHERE personalnummer=$1',[nr]);
    if(!rows.length)throw routineFehler(404,'Personalakte nicht gefunden');
    personen.push({nr,vorname:rows[0].vorname||'',nachname:rows[0].nachname||'',
      abgemeldet:rows[0].status==='Abgemeldet',
      anwesend:Array.from({length:tage.length},()=>false)});
    return 'Routine '+req.params.id+': Person '+nr+' aufgenommen';
  }));
app.patch('/api/routine/:id/teilnehmer/:nr',requireLogin,requireRight('rout',2),
  async(req,res,next)=>routineAendern(req,res,next,async({personen})=>{
    const nr=Number(req.params.nr),abgemeldet=req.body?.abgemeldet;
    if(!Number.isSafeInteger(nr)||nr<1||typeof abgemeldet!=='boolean')
      throw routineFehler(400,'Ungültiger Teilnehmerstatus');
    const p=personen.find(x=>Number(x.nr)===nr);
    if(!p)throw routineFehler(404,'Person nicht in dieser Routine');
    p.abgemeldet=abgemeldet;
    return 'Routine '+req.params.id+': Person '+nr+
      (abgemeldet?' als abgemeldet markiert':' wieder aktiviert');
  }));
app.patch('/api/sonderzahlung/:id',requireLogin,requireRight('rout',2),
  async(req,res,next)=>{
    try {
      const id=Number(req.params.id), b=req.body||{};
      if(!Number.isSafeInteger(id)||id<1||
         typeof b.erhalten!=='boolean'||typeof b.betrag!=='string'||
         typeof b.grund!=='string'||typeof b.datum!=='string')
        return res.status(400).json({error:'Ungültige Sonderzahlung'});
      if(b.betrag.length>80||b.grund.length>1000||
         (b.datum&&!routineDatum(b.datum)))
        return res.status(400).json({error:'Ungültiger Betrag, Grund oder Datum'});
      const {rows}=await db.query(
        'UPDATE sonderzahlungen SET erhalten=$1,datum=$2,betrag=$3,grund=$4 WHERE id=$5 RETURNING id',
        [b.erhalten,b.datum||null,b.betrag.trim(),b.grund.trim(),id]);
      if(!rows.length)return res.status(404).json({error:'Sonderzahlung nicht gefunden'});
      await db.query("INSERT INTO log (user_id,aktion,art) VALUES ($1,$2,'edit')",
        [req.user.id,'Sonderzahlung '+id+' aktualisiert']);
      res.json({ok:true});
    }catch(e){next(e);}
  });


/* Eigene Rangänderungen sind keine reguläre Beförderung und verlangen POR-Entscheidung. */
app.get('/api/rangantraege',requireLogin,requireRight('pers',1),async(req,res,next)=>{
 try{
  const {rows}=await db.query(`SELECT a.id,a.personalnummer,a.alter_rang,a.beantragter_rang,a.begruendung,a.status,a.erstellt,a.korrigiertes_befoerderungsdatum,
   p.vorname,p.nachname FROM personal_rangantraege a JOIN personal p ON p.personalnummer=a.personalnummer
   ORDER BY CASE WHEN a.status='beantragt' THEN 0 ELSE 1 END,a.erstellt DESC LIMIT 100`);
  res.json(rows);
 }catch(e){next(e)}
});
app.post('/api/rangantraege',requireLogin,requireRight('pers',2),async(req,res,next)=>{
 try{
  const nr=Number(req.body?.personalnummer),rang=String(req.body?.beantragter_rang||'').trim(),
   grund=String(req.body?.begruendung||'').trim();
  if(!Number.isSafeInteger(nr)||nr<1||grund.length>1000||!rang)return res.status(400).json({error:'Ungültiger Rangantrag'});
  const valid=await db.query('SELECT 1 FROM raenge WHERE name=$1',[rang]);
  if(!valid.rowCount)return res.status(400).json({error:'Unbekannter Dienstgrad'});
  const {rows}=await db.query(`INSERT INTO personal_rangantraege
  (personalnummer,alter_rang,beantragter_rang,begruendung,antragsteller_id)
  SELECT personalnummer,COALESCE(dienstgrad,''),$2,$3,$4 FROM personal
  WHERE personalnummer=$1 AND COALESCE(dienstgrad,'')<>$2
  RETURNING id`,[nr,rang,grund,req.user.id]);
  if(!rows.length)return res.status(409).json({error:'Personalakte fehlt oder Antrag unverändert'});
  res.json({ok:true,id:rows[0].id});
 }catch(e){if(e.code==='23505')return res.status(409).json({error:'Für diese Person besteht bereits ein offener Rangantrag'});next(e)}
});
app.post('/api/rangantraege/:id/entscheidung',requireLogin,requireRight('por',2),async(req,res,next)=>{
 const id=Number(req.params.id),genehmigt=req.body?.genehmigt;
 if(!Number.isSafeInteger(id)||id<1||typeof genehmigt!=='boolean')return res.status(400).json({error:'Ungültige Entscheidung'});
 const client=await db.connect().catch(next);if(!client)return;
 try{
  await client.query('BEGIN');
  const {rows}=await client.query('SELECT * FROM personal_rangantraege WHERE id=$1 FOR UPDATE',[id]);
  const a=rows[0];if(!a||a.status!=='beantragt'){await client.query('ROLLBACK');return res.status(409).json({error:'Antrag nicht mehr offen'});}
  if(genehmigt){
   const result=await client.query("UPDATE personal SET dienstgrad=$1,letzte_befoerderung=COALESCE($4::date,letzte_befoerderung),naechste_befoerderung=CASE WHEN $4::date IS NOT NULL THEN NULL ELSE naechste_befoerderung END WHERE personalnummer=$2 AND COALESCE(dienstgrad,'')=$3",
    [a.beantragter_rang,a.personalnummer,a.alter_rang,a.korrigiertes_befoerderungsdatum]);
   if(!result.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Dienstgrad hat sich inzwischen geändert; Antrag bitte neu stellen'});}
  }
  await client.query('UPDATE personal_rangantraege SET status=$1,entscheider_id=$2,entschieden_am=now() WHERE id=$3',
   [genehmigt?'genehmigt':'abgelehnt',req.user.id,id]);
  await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
   [req.user.id,'Rangantrag '+id+' '+(genehmigt?'genehmigt':'abgelehnt')]);
  await client.query('COMMIT');res.json({ok:true});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
});
/* Freigabe durch den Polizeioberrat (POR) verwalten. */
app.patch('/api/por/:nr', requireLogin, requireRight('bef', 1), async (req, res, next) => {
  try {
    const nr = Number(req.params.nr);
    const status = String(req.body.status || '');
    const notiz = String(req.body.notiz || '').trim();
    if (!Number.isSafeInteger(nr) || nr < 1) return res.status(400).json({ error: 'Ungültige Personalnummer' });
    if (!['offen', 'beantragt', 'genehmigt', 'abgelehnt'].includes(status))
      return res.status(400).json({ error: 'Ungültiger POR-Status' });
    if (notiz.length > 1000) return res.status(400).json({ error: 'Notiz zu lang' });
    /* Antragsteller und Entscheider strikt trennen.
       Status 'beantragt/offen' mit Beförderung bearbeiten; eine
       Genehmigung/Ablehnung ausschließlich mit POR bearbeiten. */
    const rechte = await effektiveRechte(req.user);
    const darfPor = (rechte.por || 0) >= 2;
    const darfAntrag = (rechte.bef || 0) >= 2;
    if (!darfPor && (!darfAntrag || ['genehmigt','abgelehnt'].includes(status)))
      return res.status(403).json({error:'Nur ein POR-Berechtigter darf genehmigen oder ablehnen'});
    const datum = status === 'genehmigt'
      ? String(req.body.datum || new Date().toISOString().slice(0, 10)) : null;
    if (datum && (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(Date.parse(datum))))
      return res.status(400).json({ error: 'Ungültiges Datum' });
    /* Genehmigte oder abgelehnte Anträge können durch Antragsteller
       nicht wieder zurückgesetzt oder überschrieben werden. */
    const { rows } = await db.query(
      `UPDATE personal SET por_status=$1,por_notiz=$2,por_am=$3
         WHERE personalnummer=$4 AND ($5::boolean OR por_status IN ('offen','beantragt'))
         RETURNING personalnummer,por_status`,
      [status,notiz,datum,nr,darfPor]);
    if (!rows.length) {
      const found = (await db.query('SELECT 1 FROM personal WHERE personalnummer=$1',[nr])).rows.length;
      return res.status(found ? 403 : 404).json({error:found
        ? 'Eine POR-Entscheidung darf nur von POR-Berechtigten geändert werden'
        : 'Personalnummer nicht gefunden'});
    }
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
/* Dokumentadressen gezielt pro historischem Kündigungsvorgang pflegen. */
/* Ein Dialog speichert die vier Kündigungsdokumente atomar, ohne die Personaldaten zu ändern. */
app.patch('/api/kuendigung/:id/dokumente',requireLogin,requireRight('kue',2),async(req,res,next)=>{
 try{
  const id=Number(req.params.id),felder=['vertrag','urkunde','zeugnis','kuendigung'];
  const daten=req.body?.dokumente;
  if(!Number.isSafeInteger(id)||id<1||!daten||typeof daten!=='object'||Array.isArray(daten)||
     Object.keys(daten).some(k=>!felder.includes(k))||!felder.every(k=>Object.hasOwn(daten,k)))
   return res.status(400).json({error:'Ungültige Dokumentangaben'});
  const werte=[];
  for(const feld of felder){
   const d=daten[feld];
   if(!d||typeof d!=='object'||Array.isArray(d)||typeof d.name!=='string'||typeof d.url!=='string')
    return res.status(400).json({error:'Dokumentname und Link müssen Text sein',feld});
   const name=d.name.trim(),url=d.url.trim();
   if(name.length>250||url.length>2048)return res.status(400).json({error:'Dokumentenname oder URL zu lang',feld});
   if(url){
    try{const u=new URL(url);
     if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.'))throw Error('Link');
    }catch{return res.status(400).json({error:'Bitte eine gültige HTTPS-URL eingeben',feld});}
   }
   werte.push(name||url?JSON.stringify({t:name||({vertrag:'Arbeitsvertrag',urkunde:'Ernennungsurkunde',zeugnis:'Arbeitszeugnis',kuendigung:'Kündigung'})[feld],u:url}):'');
  }
  const {rows}=await db.query(
   'UPDATE kuendigungen SET vertrag=$1,urkunde=$2,zeugnis=$3,kuendigung=$4 WHERE id=$5 RETURNING id,vertrag,urkunde,zeugnis,kuendigung',
   [...werte,id]);
  if(!rows.length)return res.status(404).json({error:'Kündigung nicht gefunden'});
  await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
    [req.user.id,'Dokumente in Kündigungsvorgang '+id+' bearbeitet']);
  res.json({ok:true,dokumente:rows[0]});
 }catch(err){next(err)}
});
app.patch('/api/kuendigung/:id/dokument',requireLogin,requireRight('kue',2),async(req,res,next)=>{
 try{
  const id=Number(req.params.id),feld=req.body?.feld;
  const erlaubte=['vertrag','urkunde','zeugnis','kuendigung'];
  const name=String(req.body?.name||'').trim(),url=String(req.body?.url||'').trim();
  if(!Number.isSafeInteger(id)||id<1||!erlaubte.includes(feld)||name.length>250||url.length>2048)
   return res.status(400).json({error:'Ungültiger Dokumenteintrag'});
  if(url){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.'))throw Error('bad');}
   catch{return res.status(400).json({error:'Bitte einen gültigen HTTPS-Link eingeben'});}}
  const value=name||url?JSON.stringify({t:name||'Dokument',u:url}):'';
  const r=await db.query('UPDATE kuendigungen SET '+feld+'=$1 WHERE id=$2',[value,id]);
  if(!r.rowCount)return res.status(404).json({error:'Kündigung nicht gefunden'});
  await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",[req.user.id,'Kündigungsdokument '+feld+' im Vorgang '+id+' geändert']);
  res.json({ok:true});
 }catch(e){next(e)}
});
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


/* Checklisten selbst modular verwalten. Status bleibt auch beim Verschieben
   einzelner Punkte erhalten, indem der Client die ursprünglichen Indizes mitsendet.
   Änderungen und Löschen erfolgen vollständig in einer Transaktion. */
function chkValidieren(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Object.assign(new Error('Ungültige Checkliste'),{httpStatus:400});
  const name=String(raw.name||'').trim();
  if(typeof raw.name!=='string'||!name||name.length>120)throw Object.assign(new Error('Name muss 1–120 Zeichen lang sein'),{httpStatus:400});
  if(!Array.isArray(raw.aufgaben)||raw.aufgaben.length>100)throw Object.assign(new Error('Maximal 100 Aufgaben pro Checkliste erlaubt'),{httpStatus:400});
  const aufgaben=raw.aufgaben.map((x,i)=>{
    if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.t!=='string'||
       typeof (x.u??'')!=='string')throw Object.assign(new Error('Ungültige Aufgabe '+(i+1)),{httpStatus:400});
    const t=x.t.trim(),u=(x.u||'').trim();
    if(!t||t.length>500||u.length>2048)throw Object.assign(new Error('Aufgabe '+(i+1)+': Text fehlt oder ist zu lang'),{httpStatus:400});
    if(u){
      try{
        const url=new URL(u);
        if(url.protocol!=='https:'||!url.hostname.includes('.')||url.username||url.password)
          throw new Error('bad');
      }catch{throw Object.assign(new Error('Aufgabe '+(i+1)+': nur gültige HTTPS-Links erlaubt'),{httpStatus:400})}
    }
    return {t,u};
  });
  return {name,aufgaben};
}
function chkFehler(res,next,e){
  if(e.httpStatus)return res.status(e.httpStatus).json({error:e.message});
  if(e.code==='23505')return res.status(409).json({error:'Eine Checkliste mit diesem Namen existiert bereits'});
  next(e);
}
app.post('/api/checklisten',requireLogin,requireRight('chk',2),async(req,res,next)=>{
  let valid;
  try{valid=chkValidieren(req.body)}catch(e){return chkFehler(res,next,e)}
  const client=await db.connect().catch(next);
  if(!client)return;
  try{
    await client.query('BEGIN');
    const {rows}=await client.query(
      'INSERT INTO checklisten(name,aufgaben,sortierung) VALUES($1,$2::jsonb,'+
      'COALESCE((SELECT MAX(sortierung)+1 FROM checklisten),0)) RETURNING name,aufgaben,sortierung',
      [valid.name,JSON.stringify(valid.aufgaben)]);
    await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",
      [req.user.id,'Checkliste angelegt: '+valid.name]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    chkFehler(res,next,e);
  }finally{client.release()}
});
app.put('/api/checklisten/:name',requireLogin,requireRight('chk',2),async(req,res,next)=>{
  const alt=String(req.params.name||'');
  if(!alt||alt.length>250)return res.status(400).json({error:'Ungültiger Checklistenname'});
  let valid;
  try{valid=chkValidieren(req.body)}catch(e){return chkFehler(res,next,e)}
  const zuordnung=req.body.zuordnung;
  if(!Array.isArray(zuordnung)||zuordnung.length!==valid.aufgaben.length||
     !zuordnung.every(i=>i===null||(Number.isSafeInteger(i)&&i>=0))||
     new Set(zuordnung.filter(i=>i!==null)).size!==zuordnung.filter(i=>i!==null).length)
    return res.status(400).json({error:'Ungültige Aufgaben-Zuordnung'});
  const client=await db.connect().catch(next);
  if(!client)return;
  try{
    await client.query('BEGIN');
    const {rows:old}=await client.query(
      'SELECT name,aufgaben,sortierung FROM checklisten WHERE name=$1 FOR UPDATE',[alt]);
    if(!old.length){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'Checkliste nicht gefunden'});
    }
    const bestand=Array.isArray(old[0].aufgaben)?old[0].aufgaben:[];
    if(zuordnung.some(i=>i!==null&&i>=bestand.length)){
      await client.query('ROLLBACK');
      return res.status(400).json({error:'Ungültige alte Aufgabenposition'});
    }
    const {rows:status}=await client.query(
      'SELECT punkt,erledigt FROM checklisten_status WHERE name=$1 ORDER BY punkt FOR UPDATE',[alt]);
    const altStatus=new Map(status.map(x=>[Number(x.punkt),x.erledigt===true]));
    if(valid.name!==alt){
      /* Neuer Name muss zunächst angelegt werden: FK auf name hat nur ON DELETE CASCADE. */
      await client.query(
        'INSERT INTO checklisten(name,aufgaben,sortierung) VALUES($1,$2::jsonb,$3)',
        [valid.name,JSON.stringify(valid.aufgaben),old[0].sortierung]);
      for(let i=0;i<zuordnung.length;i++)
        if(zuordnung[i]!==null&&altStatus.has(zuordnung[i]))
          await client.query(
            'INSERT INTO checklisten_status(name,punkt,erledigt) VALUES($1,$2,$3)',
            [valid.name,i,altStatus.get(zuordnung[i])]);
      await client.query('DELETE FROM checklisten WHERE name=$1',[alt]);
    }else{
      await client.query('UPDATE checklisten SET aufgaben=$2::jsonb WHERE name=$1',
        [alt,JSON.stringify(valid.aufgaben)]);
      await client.query('DELETE FROM checklisten_status WHERE name=$1',[alt]);
      for(let i=0;i<zuordnung.length;i++)
        if(zuordnung[i]!==null&&altStatus.has(zuordnung[i]))
          await client.query(
            'INSERT INTO checklisten_status(name,punkt,erledigt) VALUES($1,$2,$3)',
            [alt,i,altStatus.get(zuordnung[i])]);
    }
    await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Checkliste bearbeitet: '+alt+(valid.name!==alt?' → '+valid.name:'')]);
    await client.query('COMMIT');
    res.json({name:valid.name,aufgaben:valid.aufgaben});
  }catch(e){
    await client.query('ROLLBACK').catch(()=>{});
    chkFehler(res,next,e);
  }finally{client.release()}
});
app.delete('/api/checklisten/:name',requireLogin,requireRight('chk',2),async(req,res,next)=>{
  const name=String(req.params.name||'');
  if(!name||name.length>250)return res.status(400).json({error:'Ungültiger Checklistenname'});
  const client=await db.connect().catch(next);
  if(!client)return;
  try{
    await client.query('BEGIN');
    const {rowCount}=await client.query('DELETE FROM checklisten WHERE name=$1',[name]);
    if(!rowCount){
      await client.query('ROLLBACK');
      return res.status(404).json({error:'Checkliste nicht gefunden'});
    }
    await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'del')",
      [req.user.id,'Checkliste entfernt: '+name]);
    await client.query('COMMIT');
    res.json({ok:true});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}
  finally{client.release()}
});

/* ---------- Checklisten: serverseitig berechtigtes Abhaken ---------- */
app.patch('/api/checklisten/:name/punkte/:index', requireLogin, requireRight('chk',2),
  async (req,res,next)=>{
    try{
      const name=String(req.params.name||'');
      const index=Number(req.params.index), erledigt=req.body?.erledigt;
      if(!name||name.length>250||!Number.isSafeInteger(index)||index<0||
         typeof erledigt!=='boolean')
        return res.status(400).json({error:'Ungültiger Checklistenpunkt'});
      const {rows}=await db.query('SELECT aufgaben FROM checklisten WHERE name=$1',[name]);
      if(!rows.length)return res.status(404).json({error:'Checkliste nicht gefunden'});
      const items=rows[0].aufgaben;
      if(!Array.isArray(items)||index>=items.length)
        return res.status(400).json({error:'Checklistenpunkt nicht vorhanden'});
      await db.query(
        "INSERT INTO checklisten_status (name,punkt,erledigt) VALUES ($1,$2,$3) ON CONFLICT(name,punkt) DO UPDATE SET erledigt=EXCLUDED.erledigt,aktualisiert=now()",
        [name,index,erledigt]);
      await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
        [req.user.id,'Checkliste '+name+' / Punkt '+(index+1)+': '+(erledigt?'erledigt':'offen')]);
      res.json({ok:true,erledigt});
    }catch(err){next(err);}
  });
app.post('/api/checklisten/reset',requireLogin,requireRight('chk',2),async(req,res,next)=>{
  try{
    const result=await db.query('DELETE FROM checklisten_status');
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Alle Checklisten-Häkchen zurückgesetzt ('+result.rowCount+')']);
    res.json({ok:true,anzahl:result.rowCount});
  }catch(err){next(err);}
});


/* ---------- Sperrfristen, Blacklist und Jubiläen ---------- */
function rpValidation(message) {
  return Object.assign(new Error(message), { httpStatus: 400 });
}
function rpText(v, max, label, required = false) {
  if (typeof v !== 'string') throw rpValidation(label + ' muss Text sein');
  const t = v.trim();
  if (t.length > max || (required && !t)) throw rpValidation(label + ' fehlt oder ist zu lang');
  return t;
}
function rpDate(v, label) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw rpValidation(label + ': ungültiges Datum');
  const d = new Date(v + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== v) throw rpValidation(label + ': ungültiges Datum');
  return v;
}
function rpId(raw) {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw rpValidation('Ungültige Eintragsnummer');
  return id;
}
function rpError(err, next, res) {
  if (err.httpStatus) return res.status(err.httpStatus).json({error:err.message});
  return next(err);
}
app.get('/api/sperrfristen', requireLogin, requireRight('sperr', 1), async(req,res,next) => {
  try {
    const {rows} = await db.query('SELECT id,vorname,nachname,art,grund,von,bis,bemerkung FROM sperrfristen ORDER BY erstellt DESC,id DESC');
    res.json(rows);
  } catch(e) { next(e); }
});
app.post('/api/sperrfristen', requireLogin, requireRight('sperr', 2), async(req,res,next) => {
  try {
    const b=req.body||{};
    const vorname=rpText(b.vorname,120,'Vorname');
    const nachname=rpText(b.nachname,120,'Nachname',true);
    const art=rpText(b.art,30,'Art',true);
    if(!['Bewerber','Praktikant'].includes(art)) throw rpValidation('Ungültige Sperrfrist-Art');
    const grund=rpText(b.grund,1500,'Grund'), bemerkung=rpText(b.bemerkung,2000,'Bemerkung');
    const von=rpDate(b.von,'Gültig von'),bis=rpDate(b.bis,'Gültig bis');
    if(von&&bis&&bis<von) throw rpValidation('Enddatum liegt vor dem Beginn');
    const {rows}=await db.query(
      'INSERT INTO sperrfristen (vorname,nachname,art,grund,von,bis,bemerkung) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [vorname,nachname,art,grund,von,bis,bemerkung]);
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",
      [req.user.id,'Sperrfrist angelegt: '+vorname+' '+nachname]);
    res.status(201).json({ok:true,id:rows[0].id});
  }catch(e){rpError(e,next,res);}
});
app.delete('/api/sperrfristen/:id', requireLogin, requireRight('sperr', 2), async(req,res,next) => {
  try{
    const {rows}=await db.query('DELETE FROM sperrfristen WHERE id=$1 RETURNING vorname,nachname',[rpId(req.params.id)]);
    if(!rows.length)return res.status(404).json({error:'Sperrfrist nicht gefunden'});
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'del')",
      [req.user.id,'Sperrfrist gelöscht: '+rows[0].vorname+' '+rows[0].nachname]);
    res.json({ok:true});
  }catch(e){rpError(e,next,res);}
});
app.get('/api/blacklist', requireLogin, requireRight('bl',1), async(req,res,next)=>{
  try{
    const {rows}=await db.query('SELECT id,personalnummer,vorname,nachname,datum,ablauf,handy,bemerkung FROM blacklist ORDER BY erstellt DESC,id DESC');
    res.json(rows);
  }catch(e){next(e);}
});
app.post('/api/blacklist', requireLogin, requireRight('bl',2), async(req,res,next)=>{
  try{
    const b=req.body||{};
    const nummer=rpText(b.personalnummer,30,'Personalnummer');
    const vorname=rpText(b.vorname,120,'Vorname',true);
    const nachname=rpText(b.nachname,120,'Nachname',true);
    const datum=rpDate(b.datum,'Datum'),ablauf=rpDate(b.ablauf,'Ablauf');
    if(datum&&ablauf&&ablauf<datum)throw rpValidation('Ablauf liegt vor dem Eintragungsdatum');
    const handy=rpText(b.handy,150,'Handy'),bemerkung=rpText(b.bemerkung,2000,'Bemerkung');
    const {rows}=await db.query(
      'INSERT INTO blacklist (personalnummer,vorname,nachname,datum,ablauf,handy,bemerkung) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [nummer,vorname,nachname,datum,ablauf,handy,bemerkung]);
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",
      [req.user.id,'Blacklist-Eintrag angelegt: '+vorname+' '+nachname]);
    res.status(201).json({ok:true,id:rows[0].id});
  }catch(e){rpError(e,next,res);}
});
app.delete('/api/blacklist/:id',requireLogin,requireRight('bl',2),async(req,res,next)=>{
  try{
    const {rows}=await db.query('DELETE FROM blacklist WHERE id=$1 RETURNING vorname,nachname',[rpId(req.params.id)]);
    if(!rows.length)return res.status(404).json({error:'Blacklist-Eintrag nicht gefunden'});
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'del')",
      [req.user.id,'Blacklist-Eintrag gelöscht: '+rows[0].vorname+' '+rows[0].nachname]);
    res.json({ok:true});
  }catch(e){rpError(e,next,res);}
});

/* Ausschließlich minimal benötigte Namen, Rang und Termin ausliefern.
   Keine gesamte Personalakte an Rollen ohne Personalberechtigung senden. */
function berlinTodayUtc(){
  const parts = new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric'
  }).formatToParts(new Date());
  const get=type=>Number(parts.find(p=>p.type===type).value);
  return new Date(Date.UTC(get('year'),get('month')-1,get('day')));
}
async function anlaesseDaten(kind){
  const column=kind==='geb'?'geburtsdatum':'eintrittsdatum';
  const {rows}=await db.query(
    'SELECT personalnummer,vorname,nachname,dienstgrad,'+column+
    ' AS ereignis FROM personal WHERE status IS DISTINCT FROM $1 AND '+column+
    ' IS NOT NULL ORDER BY personalnummer',['Gekündigt']);
  const today=berlinTodayUtc(),y=today.getUTCFullYear(),day=86400000;
  const result=[];
  for(const r of rows){
    const raw=r.ereignis;
    const date=raw instanceof Date ? raw.toISOString().slice(0,10) : String(raw).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const year=Number(date.slice(0,4)),month=Number(date.slice(5,7)),dom=Number(date.slice(8,10));
    let next=new Date(Date.UTC(y,month-1,dom));
    if(next.getTime()<today.getTime())next=new Date(Date.UTC(y+1,month-1,dom));
    const age=next.getUTCFullYear()-year;
    const rest=Math.round((next.getTime()-today.getTime())/day);
    if(rest<0||rest>60||(kind==='jub'&&age<1))continue;
    result.push({
      personalnummer:r.personalnummer,
      name:[r.vorname,r.nachname].filter(Boolean).join(' '),
      dienstgrad:r.dienstgrad||'',
      datum:date,
      jahre:age,
      tage:rest
    });
  }
  return result.sort((a,b)=>a.tage-b.tage||a.name.localeCompare(b.name,'de'));
}
app.get('/api/geburtstage',requireLogin,requireRight('geb',1),async(req,res,next)=>{
  try{res.json(await anlaesseDaten('geb'))}catch(e){next(e)}
});
app.get('/api/dienstjubilaeen',requireLogin,requireRight('jub',1),async(req,res,next)=>{
  try{res.json(await anlaesseDaten('jub'))}catch(e){next(e)}
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
    const { rows: userPerms } = await db.query(
      `SELECT user_id,modul,stufe FROM user_perms ORDER BY user_id,modul`);
    res.json({ users: rows, rollen, perms, userPerms });
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
    const erlaubteModule = new Set(['dash','pers','bef','rout','sonder','dis','kue','chk','rl','org','sperr','geb','jub','bl','log','por','texte','rechtesimulator','design','backup','mitteilungen']);
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

/* Individuelle Berechtigungen (null = Rollenrecht wieder übernehmen).
   Kontobearbeitung selbst bleibt ausschließlich Administratoren vorbehalten. */
app.patch('/api/users/:id/recht/:modul',requireLogin,nurAdmin,async(req,res,next)=>{
  try{
    const userId=Number(req.params.id),modul=req.params.modul,stufe=req.body?.stufe;
    const erlaubte=new Set(['dash','pers','bef','rout','sonder','dis','kue','chk','rl','org','sperr','geb','jub','bl','log','por','texte','rechtesimulator','design','backup','mitteilungen']);
    if(!Number.isSafeInteger(userId)||userId<1||!erlaubte.has(modul)||
       ![null,0,1,2].includes(stufe))
      return res.status(400).json({error:'Ungültige Berechtigung'});
    const {rows}=await db.query('SELECT id,rolle,dienstnummer FROM users WHERE id=$1',[userId]);
    if(!rows.length)return res.status(404).json({error:'Konto nicht gefunden'});
    if(rows[0].rolle==='Administrator')
      return res.status(403).json({error:'Administratorrechte sind fest'});
    if(stufe===null)
      await db.query('DELETE FROM user_perms WHERE user_id=$1 AND modul=$2',[userId,modul]);
    else
      await db.query(
        `INSERT INTO user_perms(user_id,modul,stufe) VALUES($1,$2,$3)
         ON CONFLICT(user_id,modul) DO UPDATE SET stufe=EXCLUDED.stufe`,
        [userId,modul,stufe]);
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Individuelles Recht '+rows[0].dienstnummer+'/'+modul+' → '+(stufe===null?'Rolle':stufe)]);
    res.json({ok:true,stufe});
  }catch(e){next(e)}
});

/* Organigramm: Leserecht 1, Bearbeitungsrecht 2. Bestehende
   Original-Zeilen bleiben unverändert. Bearbeitung erfolgt in separater
   JSON-Struktur, mit Versionsprüfung gegen paralleles Überschreiben. */
function orgAusOriginal(rows){
  const zeilen=rows.map(r=>Array.isArray(r.zeile)?r.zeile:[]);
  const leitung=String(zeilen[1]?.[0]||'').trim();
  const raete=(zeilen[3]||[]).map(x=>String(x||'').trim()).filter(Boolean);
  const bereiche=(zeilen[5]||[]).map((raw,col)=>{
    const lines=String(raw||'').split('\n');
    const name=(lines[0]||'').trim();
    const zust=lines.slice(1).join(' ').replace(/^\s*Zuständig\s*:\s*/i,'').trim();
    const tasks=zeilen.slice(7).map(row=>String(row[col]||'').trim()).filter(Boolean);
    return {name,zust,tasks};
  }).filter(b=>b.name);
  return {leitung,raete,bereiche};
}
function orgValidieren(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    return {error:'Ungültige Organigramm-Daten'};
  const {leitung,raete,bereiche}=payload;
  const text=(v,max,needed=false)=>typeof v==='string'&&
    v.trim().length<=max&&(!needed||v.trim().length>0);
  if(!text(leitung,180))return {error:'Ungültiger Polizeioberrat'};
  if(!Array.isArray(raete)||raete.length>20||
     !raete.every(v=>text(v,180,true)))
    return {error:'Ungültige Polizeiräte (maximal 20)'};
  if(!Array.isArray(bereiche)||bereiche.length>20||
     !bereiche.every(b=>b&&typeof b==='object'&&!Array.isArray(b)&&
       text(b.name,180,true)&&text(b.zust,250)&&
       Array.isArray(b.tasks)&&b.tasks.length<=40&&
       b.tasks.every(t=>text(t,500,true))))
    return {error:'Ungültige Aufgabenbereiche (max. 20 Bereiche mit je 40 Aufgaben)'};
  const namen=new Set(bereiche.map(x=>x.name.trim().toLocaleLowerCase('de-DE')));
  if(namen.size!==bereiche.length)return {error:'Aufgabenbereiche dürfen nicht doppelt vorkommen'};
  return {inhalt:{
    leitung:leitung.trim(),raete:raete.map(x=>x.trim()),
    bereiche:bereiche.map(b=>({
      name:b.name.trim(),zust:b.zust.trim(),
      tasks:b.tasks.map(t=>t.trim())
    }))
  }};
}
app.get('/api/organigramm',requireLogin,requireRight('org',1),async(req,res,next)=>{
  try{
    const {rows}=await db.query('SELECT inhalt,version FROM organigramm_layout WHERE id=1');
    if(rows.length)return res.json(rows[0]);
    const original=await db.query('SELECT zeile FROM organigramm ORDER BY sortierung,id');
    res.json({inhalt:orgAusOriginal(original.rows),version:0});
  }catch(e){next(e)}
});
app.put('/api/organigramm',requireLogin,requireRight('org',2),async(req,res,next)=>{
  try{
    const version=req.body?.version;
    if(!Number.isSafeInteger(version)||version<0)
      return res.status(400).json({error:'Ungültige Organigramm-Version'});
    const {inhalt,error}=orgValidieren(req.body?.inhalt);
    if(error)return res.status(400).json({error});
    const {rows}=version===0?await db.query(
      'INSERT INTO organigramm_layout(id,inhalt,version) VALUES(1,$1::jsonb,1) '+
      'ON CONFLICT (id) DO NOTHING RETURNING inhalt,version',
      [JSON.stringify(inhalt)]):
      await db.query(
        'UPDATE organigramm_layout SET inhalt=$1::jsonb,version=version+1,aktualisiert=now() '+
        'WHERE id=1 AND version=$2 RETURNING inhalt,version',
        [JSON.stringify(inhalt),version]);
    if(!rows.length)
      return res.status(409).json({error:'Das Organigramm wurde zwischenzeitlich geändert. Bitte neu laden.'});
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Organigramm geändert (Version '+rows[0].version+')']);
    res.json(rows[0]);
  }catch(e){next(e)}
});

/* Textbausteine werden ausschließlich serverseitig nach Rollen- und
   Dienstnummerrechten ausgeliefert, nie im öffentlichen Frontend eingebettet. */
/* Anzeigen/Kopieren ab Stufe 1, Schreiben/Löschen ab Stufe 2.
   Vorlagenrechte wirken für Rollen und einzelne Dienstnummern. */
function textbausteinEingabe(body){
  if(!body||typeof body!=='object'||Array.isArray(body))
    return {error:'Ungültige Textbaustein-Daten'};
  const grenzen={kategorie:80,titel:160,inhalt:10000};
  const werte={};
  for(const [feld,max] of Object.entries(grenzen)){
    if(typeof body[feld]!=='string')return {error:feld+' muss Text sein'};
    const wert=body[feld].trim();
    if(!wert||wert.length>max)return {error:feld+' fehlt oder ist zu lang'};
    werte[feld]=wert;
  }
  return {werte};
}
function textbausteinSchluessel(param){
  return typeof param==='string'&&/^[a-z0-9-]{3,80}$/.test(param)?param:null;
}
app.get('/api/textbausteine',requireLogin,requireRight('texte',1),async(req,res,next)=>{
  try{
    const {rows}=await db.query(
      'SELECT schluessel,kategorie,titel,inhalt FROM textbausteine WHERE geloescht=false ORDER BY sortierung,schluessel');
    res.json(rows);
  }catch(e){next(e)}
});
app.post('/api/textbausteine',requireLogin,requireRight('texte',2),async(req,res,next)=>{
  try{
    const {werte,error}=textbausteinEingabe(req.body);
    if(error)return res.status(400).json({error});
    const schluessel='neu-'+randomUUID();
    const {rows}=await db.query(
      'INSERT INTO textbausteine(schluessel,kategorie,titel,inhalt,sortierung) '+
      'VALUES($1,$2,$3,$4,(SELECT COALESCE(MAX(sortierung),0)+10 FROM textbausteine)) '+
      'RETURNING schluessel,kategorie,titel,inhalt',
      [schluessel,werte.kategorie,werte.titel,werte.inhalt]);
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",
      [req.user.id,'Textbaustein hinzugefügt: '+werte.titel]);
    res.status(201).json(rows[0]);
  }catch(e){next(e)}
});
app.patch('/api/textbausteine/:schluessel',requireLogin,requireRight('texte',2),async(req,res,next)=>{
  try{
    const schluessel=textbausteinSchluessel(req.params.schluessel);
    if(!schluessel)return res.status(400).json({error:'Ungültiger Textbaustein-Schlüssel'});
    const {werte,error}=textbausteinEingabe(req.body);
    if(error)return res.status(400).json({error});
    const {rows}=await db.query(
      'UPDATE textbausteine SET kategorie=$2,titel=$3,inhalt=$4 '+
      'WHERE schluessel=$1 AND geloescht=false '+
      'RETURNING schluessel,kategorie,titel,inhalt',
      [schluessel,werte.kategorie,werte.titel,werte.inhalt]);
    if(!rows.length)return res.status(404).json({error:'Textbaustein nicht gefunden'});
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
      [req.user.id,'Textbaustein bearbeitet: '+werte.titel]);
    res.json(rows[0]);
  }catch(e){next(e)}
});
app.delete('/api/textbausteine/:schluessel',requireLogin,requireRight('texte',2),async(req,res,next)=>{
  try{
    const schluessel=textbausteinSchluessel(req.params.schluessel);
    if(!schluessel)return res.status(400).json({error:'Ungültiger Textbaustein-Schlüssel'});
    /* Soft-Delete: importierte Vorlagen dürfen bei Neustarts nicht zurückkommen. */
    const {rows}=await db.query(
      'UPDATE textbausteine SET geloescht=true '+
      'WHERE schluessel=$1 AND geloescht=false RETURNING titel',
      [schluessel]);
    if(!rows.length)return res.status(404).json({error:'Textbaustein nicht gefunden'});
    await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'del')",
      [req.user.id,'Textbaustein entfernt: '+rows[0].titel]);
    res.json({ok:true});
  }catch(e){next(e)}
});

app.get('/api/personal-audit',requireLogin,requireRight('log',1),async(req,res,next)=>{
 try{
  const {rows}=await db.query("SELECT a.personalnummer,a.zeit,a.aenderungen,COALESCE(u.anzeigename,'–') AS benutzer FROM personal_audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.zeit DESC LIMIT 200");
  res.json(rows);
 }catch(e){next(e)}
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
  /* Nur bekannte Personalspalten als nutzerfreundliche Feldmeldung herausgeben. */
  const spalten=new Set(['vorname','nachname','personalnummer','dienstgrad','gruppe',
    'geburtsdatum','eintrittsdatum','urlaub_von','urlaub_bis','arbeitsvertrag_url','ernennungsurkunde_url']);
  if(req.path.startsWith('/api/personal') && ['23502','23514','22007','22008','22P02','23505'].includes(err.code)){
    const feld=spalten.has(err.column)?err.column:null;
    const meldung=err.code==='23505'?'Dieser Wert ist bereits vergeben.':
      err.code==='23502'?'Dieses Feld darf nicht leer sein.':
      ['22007','22008'].includes(err.code)?'Bitte ein gültiges Datum eingeben.':
      'Bitte den Feldwert überprüfen.';
    return res.status(400).json({error:feld?feld+': '+meldung:meldung,feld});
  }
  res.status(500).json({ error: 'Interner Fehler' });
});

/* ---------- Start ---------- */

initDb()
  .then(() => app.listen(PORT, () => console.log(`Portal läuft auf Port ${PORT}`)))
  .catch(e => { console.error('Start fehlgeschlagen', e); process.exit(1); });
