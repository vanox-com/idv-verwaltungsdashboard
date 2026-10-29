import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';
import { createHash } from 'node:crypto';

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
  await excelPersonalLinksUebernehmen();
  await kuendigungsLinksAusExcelUebernehmen();
  await disziplinLinksUebernehmen();
  await originaleDashboardLinksUebernehmen();
  await textbausteineAusPdfUebernehmen();
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

/* Links der hochgeladenen Original-Excel: privates kompaktes Format
   `<Personalnummer><a|e>:<Google-Doc-ID>`; keine Dokument-IDs im GitHub-Code.
   Eindeutige Zuordnung über Personalnummer plus Dokumenttyp. Nur bestehende
   Dokumentnamen werden verlinkt; bereits gespeicherte URLs nie überschrieben. */
async function excelPersonalLinksUebernehmen() {
  const raw=process.env.PERSONAL_XLSX_IDS_IMPORT;
  if (!raw) return;
  const entries=raw.split(';').filter(Boolean);
  if (entries.length > 250) throw new Error('Excel-Linkimport: zu viele Einträge');
  const gesehen=new Set();
  let hinzugefuegt=0,uebersprungen=0;
  for (const entry of entries) {
    const m=/^([1-9][0-9]{0,5})([ae]):([a-zA-Z0-9_-]{15,120})$/.exec(entry);
    if (!m) throw new Error('Excel-Linkimport: fehlerhaftes Eintragsformat');
    const [ ,nummer,typ,id]=m;
    const key=nummer+':'+typ;
    if (gesehen.has(key)) throw new Error('Excel-Linkimport: doppelte Zuordnung');
    gesehen.add(key);
    const feld=typ==='a'?'arbeitsvertrag':'ernennungsurkunde';
    const url='https://docs.google.com/document/d/'+id+'/edit';
    // Kein Zugriff auf andere Personalfelder und kein Überschreiben bestehender Links.
    const result=await db.query(
      'UPDATE personal SET '+feld+'_url=$1 WHERE personalnummer=$2 '+
      'AND lower(btrim(COALESCE('+feld+",''))) LIKE $3 "+
      'AND COALESCE('+feld+"_url,'')=''",
      [url,Number(nummer),typ==='a'?'%arbeitsvertrag%':'%ernennungsurkunde%']
    );
    if (result.rowCount) hinzugefuegt++;
    else uebersprungen++;
  }
  if(hinzugefuegt)console.log('Excel-Personal-Dokumentlinks ergänzt: '+hinzugefuegt);
  if(uebersprungen)console.log('Excel-Personal-Dokumentlinks unverändert: '+uebersprungen);
}


/* Kündigungslinks aus privatem Render-Environment: keine URLs im GitHub-Code.
   Historische Kündigungen werden nur bei übereinstimmender Vorgangs-ID,
   Personalnummer und Namenssignatur verknüpft; vorhandene Links nie überschreiben. */
async function kuendigungsLinksAusExcelUebernehmen(){
 const raw=process.env.KUE_EXCEL_LINKS_IMPORT;if(!raw)return;
 if(raw.length>16000)throw new Error('Kündigungsimport: zu große Quelle');
 const records=raw.split(';').filter(Boolean);
 if(records.length>100)throw new Error('Kündigungsimport: zu viele Vorgänge');
 const fields=['vertrag','urkunde','zeugnis','kuendigung'];
 const labels=['Arbeitsvertrag','Ernennungsurkunde','Arbeitszeugnis','Kündigung'];
 const hash=value=>createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex').slice(0,12);
 const expand=code=>{
  const v=code.slice(1);
  if(code[0]==='?'&&/^[a-z0-9_-]{15,120}$/i.test(v))return 'https://docs.google.com/document/d/'+v+'/edit';
  if(code[0]==='@'&&/^[a-z0-9_-]{15,120}$/i.test(v))return 'https://drive.google.com/file/d/'+v+'/view';
  if(code[0]==='#'&&v.split('/').length===3&&v.split('/').every(x=>/^[0-9]+$/.test(x)))return 'https://discord.com/channels/'+v;
  throw new Error('Kündigungsimport: ungültiger Link');
 };
 let neu=0,vorhanden=0,abweichend=0;
 const keys=new Set();
 for(const record of records){
  const pos1=record.indexOf('-'),pos2=record.indexOf('-',pos1+1),pos3=record.indexOf('-',pos2+1);
  const id=Number(record.slice(0,pos1)),nr=Number(record.slice(pos1+1,pos2)),signatur=record.slice(pos2+1,pos3),pairs=record.slice(pos3+1);
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(nr)||nr<1||!/^[a-f0-9]{12}$/.test(signatur)||!pairs)
   throw new Error('Kündigungsimport: ungültige Vorgangskennung');
  const result=await db.query('SELECT id,personalnummer,vorname,nachname,vertrag,urkunde,zeugnis,kuendigung FROM kuendigungen WHERE id=$1 AND personalnummer=$2',[id,nr]);
  const k=result.rows[0],ident=k?hash(nr+'|'+String(k.vorname||'').trim()+'|'+String(k.nachname||'').trim()):'';
  for(const pair of pairs.split(',')){
   const sep=pair.indexOf(':'),ix=Number(pair.slice(0,sep));
   if(sep!==1||![0,1,2,3].includes(ix))throw new Error('Kündigungsimport: ungültiger Dokumenttyp');
   const field=fields[ix],url=expand(pair.slice(sep+1)),key=id+'|'+field;
   if(keys.has(key))throw new Error('Kündigungsimport: doppelte Dokumentzuordnung');
   keys.add(key);
   if(!k||ident!==signatur){abweichend++;continue;}
   let title=String(k[field]||'').trim();
   if(title.startsWith('{')){
    try{const parsed=JSON.parse(title);
     if(parsed&&typeof parsed==='object'&&parsed.u){vorhanden++;continue;}
     if(parsed&&typeof parsed==='object')title=String(parsed.t||'').trim();
    }catch(e){}
   }
   if(title.toLowerCase().startsWith('https://')){vorhanden++;continue;}
   const display=(!title||title==='////')?labels[ix]:title;
   const updated=await db.query('UPDATE kuendigungen SET '+field+'=$1 WHERE id=$2 AND COALESCE('+field+",'')=$3",
     [JSON.stringify({t:display,u:url}),id,k[field]??'']);
   if(updated.rowCount){neu++;k[field]=JSON.stringify({t:display,u:url});}else abweichend++;
  }
 }
 console.log('Kündigungslinks aus Excel: '+neu+' ergänzt, '+vorhanden+' vorhanden, '+abweichend+' nicht zugeordnet');
}
/* Die ursprünglich in Excel hinter den Dashboard-Titeln verborgenen Links.
   Quellen stehen in einer privaten Render-Environment-Variable und nicht in
   GitHub. Nur neue Einträge werden ergänzt; bestehende redaktionelle
   Änderungen überschreiben wir beim Neustart niemals. */
async function originaleDashboardLinksUebernehmen() {
  const raw=process.env.DASHBOARD_EXCEL_LINKS_IMPORT;
  if(!raw)return;
  let quelle;
  try { quelle=JSON.parse(raw); }
  catch(e){throw new Error('Dashboard-Excel-Import: ungültiges JSON')}
  if(!Array.isArray(quelle)||quelle.length>80)
    throw new Error('Dashboard-Excel-Import: ungültige Eintragsliste');
  const seen=new Set();
  let hinzugefuegt=0,vorhanden=0;
  for(const entry of quelle){
    if(!entry||typeof entry!=='object'||
       !['vorlage','info','link'].includes(entry.art)||
       typeof entry.text!=='string'||!entry.text.trim()||entry.text.length>220||
       typeof entry.url!=='string'||entry.url.length>2048||
       !Number.isSafeInteger(entry.sortierung)||entry.sortierung<0)
      throw new Error('Dashboard-Excel-Import: ungültiger Eintrag');
    let url;
    try{url=new URL(entry.url)}
    catch(e){throw new Error('Dashboard-Excel-Import: ungültiger Link')}
    if(url.protocol!=='https:'||url.username||url.password||
       !['docs.google.com','forms.gle','emergencydispatch.de'].includes(url.hostname))
      throw new Error('Dashboard-Excel-Import: unsicherer oder unerwarteter Link');
    const key=entry.art+'|'+entry.text.trim();
    if(seen.has(key))throw new Error('Dashboard-Excel-Import: doppelter Titel '+key);
    seen.add(key);
    const result=await db.query(
      `INSERT INTO dashboard(art,text,url,sortierung)
       SELECT $1,$2,$3,$4 WHERE NOT EXISTS (
         SELECT 1 FROM dashboard WHERE art=$1 AND text=$2
       )`,
      [entry.art,entry.text.trim(),url.href,entry.sortierung]);
    if(result.rowCount===1)hinzugefuegt++;
    else vorhanden++;
  }
  console.log('Dashboard: '+hinzugefuegt+' Links aus Excel ergänzt, '+vorhanden+' schon vorhanden');
}

/* Die Originaltexte aus „Textvorlagen Rat.pdf“ werden aus einer
   privaten Render-Umgebungsvariablen übertragen, nicht ins öffentliche
   GitHub-Repository geschrieben. Vorhandene Texte nicht überschreiben. */
async function textbausteineAusPdfUebernehmen(){
  const raw=process.env.POLIZEIRAT_TEXTBAUSTEINE_IMPORT;
  if(!raw)return;
  let daten;
  try{daten=JSON.parse(raw)}catch(e){throw new Error('Textbaustein-PDF: ungültiges JSON')}
  if(!Array.isArray(daten)||daten.length>100)throw new Error('Textbaustein-PDF: ungültige Liste');
  const keys=new Set();
  let angelegt=0;
  for(const eintrag of daten){
    if(!eintrag||typeof eintrag!=='object'||
      typeof eintrag.schluessel!=='string'||!/^[a-z0-9-]{3,80}$/.test(eintrag.schluessel)||
      !['Bewerbungen','Praktikanten','Beschwerden'].includes(eintrag.kategorie)||
      typeof eintrag.titel!=='string'||!eintrag.titel.trim()||eintrag.titel.length>160||
      typeof eintrag.inhalt!=='string'||!eintrag.inhalt.trim()||eintrag.inhalt.length>10000||
      !Number.isSafeInteger(eintrag.sortierung)||eintrag.sortierung<0||eintrag.sortierung>1000)
      throw new Error('Textbaustein-PDF: fehlerhafter Eintrag');
    if(keys.has(eintrag.schluessel))throw new Error('Textbaustein-PDF: doppelter Schlüssel');
    keys.add(eintrag.schluessel);
    const r=await db.query(
      'INSERT INTO textbausteine(schluessel,kategorie,titel,inhalt,sortierung) '+
      'VALUES($1,$2,$3,$4,$5) ON CONFLICT(schluessel) DO NOTHING',
      [eintrag.schluessel,eintrag.kategorie,eintrag.titel,eintrag.inhalt,eintrag.sortierung]);
    angelegt+=r.rowCount;
  }
  console.log('Textbausteine aus PDF ergänzt: '+angelegt);
}

/* Disziplinardokumente aus privatem Altbestand: nur freie Slots ergänzen.
   URLs werden nicht in das öffentliche Repository aufgenommen. */
async function disziplinLinksUebernehmen(){
 const raw=process.env.DISZIPLIN_DOKUMENTE_IMPORT;if(!raw)return;
 let rows;try{rows=JSON.parse(raw)}catch{throw new Error('Disziplin-Linkimport: ungültiges JSON')}
 if(!Array.isArray(rows)||rows.length>100)throw new Error('Disziplin-Linkimport: ungültige Liste');
 let count=0;
 for(const item of rows){
  if(!Number.isSafeInteger(item.nr)||item.nr<1||!Number.isInteger(item.slot)||item.slot<0||item.slot>5||
     typeof item.t!=='string'||!item.t.trim()||typeof item.u!=='string'||typeof item.d!=='string')
   throw new Error('Disziplin-Linkimport: ungültiger Datensatz');
  const url=new URL(item.u);
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.username||url.password)
   throw new Error('Disziplin-Linkimport: nur Google Docs erlaubt');
  const r=await db.query(`UPDATE disziplin SET slots=jsonb_set(
   CASE WHEN jsonb_typeof(slots)='array' AND jsonb_array_length(slots)=6 THEN slots
    ELSE '[null,null,null,null,null,null]'::jsonb END,
   ARRAY[$2::text],$3::jsonb,true)
   WHERE personalnummer=$1 AND (
    slots IS NULL OR slots='[]'::jsonb OR
    (jsonb_typeof(slots)='array' AND jsonb_array_length(slots)=6
     AND (slots->$2::int IS NULL OR slots->$2::int='null'::jsonb OR
       (slots->$2::int->>'u' IS NULL AND slots->$2::int->>'t'=$4 AND slots->$2::int->>'d'=$5)))
   )`,[item.nr,item.slot,JSON.stringify({done:true,t:item.t,u:url.href,d:item.d}),item.t,item.d]);
  count+=r.rowCount;
 }
 console.log('Disziplin-Dokumentlinks aus Altbestand ergänzt: '+count);
}
