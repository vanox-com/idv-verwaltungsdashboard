import {VORLAGEN} from './dokumentVorlagen.js';
import {befuellen} from './dokumentBefuellen.js';
import {validDate,originOk,googleCodeToken,googleDocsUpload,deleteGoogleDoc} from './dokumentOAuth.js';

const fail=(code,msg)=>Object.assign(new Error(msg),{httpStatus:code});
const iso=x=>x instanceof Date?x.toISOString().slice(0,10):String(x||'').slice(0,10);
const allowed=(rights,type)=>Number(rights[VORLAGEN[type]?.recht]||0)>=2;

function fieldsFor(type,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail(400,'Dokumentangaben fehlen');
 const f={};
 const keys=['datum','beginn','enddatum','praktikumsdatum','anrede','strasse','hausnummer',
  'wohnort','unterzeichner','rang','sachverhalt','paragraphen','begruendung',
  'taetigkeit','arbeitgeber','probezeit','uhrzeit_von','uhrzeit_bis','stufe'];
 for(const k of keys){
  const v=input[k]==null?'':String(input[k]).trim();
  if(v.length>(['sachverhalt','paragraphen','begruendung'].includes(k)?3000:160))
   throw fail(400,'Text zu lang: '+k);
  f[k]=v;
 }
 if(!validDate(f.datum))throw fail(400,'Ausstellungsdatum fehlt');
 if(f.unterzeichner.split(/\s+/).length<2||!f.rang)
  throw fail(400,'Unterzeichner mit Vorname, Nachname und Dienstgrad erforderlich');
 const extra={
  abmahnung:['sachverhalt','paragraphen','stufe'],
  fristgerecht:['enddatum'],fristlos:['begruendung'],
  hauptvertrag:['beginn','probezeit'],pmavertrag:['beginn'],
  nebenvertrag:['beginn','arbeitgeber','taetigkeit'],
  praktikum:['wohnort'],praktikumsbestaetigung:['praktikumsdatum','uhrzeit_von','uhrzeit_bis'],
  nebenjob:['arbeitgeber']
 }[type];
 if(!extra)throw fail(400,'Unbekannter Dokumenttyp');
 for(const k of extra)if(!f[k])throw fail(400,'Pflichtfeld fehlt: '+k);
 for(const k of ['beginn','enddatum','praktikumsdatum'])
  if(f[k]&&!validDate(f[k]))throw fail(400,'Ungültiges Datum: '+k);
 if(type==='abmahnung'&&![1,2,3].includes(Number(f.stufe)))throw fail(400,'Ungültige Abmahnungsstufe');
 return f;
}
export function dokumentRoutes(app,db,requireLogin,effektiveRechte,zertGoogleOAuth){
 app.get('/api/dokumentgenerator/status',requireLogin,(req,res)=>{
  const c=zertGoogleOAuth();res.json({eingerichtet:!!c,clientId:c?.id||null});
 });
 app.get('/api/dokumentgenerator/archiv',requireLogin,async(req,res,next)=>{
  try{
   const rights=await effektiveRechte(req.user);
   const nr=Number(req.query.nr||0);
   if(!Number.isSafeInteger(nr)||nr<0)throw fail(400,'Ungültige Personalnummer');
   const {rows}=await db.query(
    'SELECT id,personalnummer,person_name,typ,titel,url,kontext_id,erstellt FROM generierte_dokumente WHERE ($1::integer=0 OR personalnummer=$1) ORDER BY erstellt DESC,id DESC LIMIT 400',[nr]);
   res.json(rows.filter(r=>allowed(rights,r.typ)));
  }catch(e){next(e);}
 });
 app.post('/api/dokumentgenerator/erstellen',requireLogin,async(req,res,next)=>{
  let token=null,fileId=null,saved=false;
  try{
   const body=req.body||{},type=String(body.typ||''),tpl=VORLAGEN[type];
   if(!tpl)throw fail(400,'Unbekannte Vorlage');
   const rights=await effektiveRechte(req.user);
   if(!allowed(rights,type))throw fail(403,'Keine Berechtigung zum Dokumentgenerator');
   if(!originOk(req))throw fail(403,'Ungültiger Anmeldeursprung');
   const oauth=zertGoogleOAuth();
   if(!oauth)throw fail(503,'Google OAuth nicht eingerichtet');
   const code=body.google_code;
   if(typeof code!=='string'||code.length<15||code.length>2048)
    throw fail(400,'Persönliche Google-Anmeldung fehlt');
   const f=fieldsFor(type,body.felder);
   const nr=Number(body.nr||0),kontext=Number(body.kontext||0);
   if(!Number.isSafeInteger(nr)||nr<0||!Number.isSafeInteger(kontext)||kontext<0)
    throw fail(400,'Ungültige Aktenzuordnung');
   const praktik=type==='praktikum'||type==='praktikumsbestaetigung';
   if(!nr&&!praktik)throw fail(400,'Bitte Personalakte auswählen');
   if(['fristgerecht','fristlos'].includes(type)&&!kontext)
    throw fail(400,'Kündigungsvorgang auswählen');
   let person=null;
   if(nr)person=(await db.query(
    'SELECT personalnummer,vorname,nachname,geburtsdatum,eintrittsdatum,dienstgrad FROM personal WHERE personalnummer=$1',[nr])).rows[0];
   if(!person&&nr)throw fail(404,'Personalakte nicht gefunden');
   if(!person){
    const e=body.extern||{};
    if(!praktik||typeof e.vorname!=='string'||typeof e.nachname!=='string'||
     !e.vorname.trim()||!e.nachname.trim()||!validDate(e.geburtsdatum))
      throw fail(400,'Praktikant: Vorname, Nachname und Geburtsdatum eintragen');
    person={vorname:e.vorname.trim().slice(0,120),nachname:e.nachname.trim().slice(0,120),geburtsdatum:e.geburtsdatum};
   }
   person.geburtsdatum=iso(person.geburtsdatum);
   if(!validDate(person.geburtsdatum))throw fail(400,'Geburtsdatum fehlt in der Personalakte');
   if(['fristgerecht','fristlos'].includes(type)){
    const k=(await db.query('SELECT personalnummer,kuendigung FROM kuendigungen WHERE id=$1',[kontext])).rows[0];
    if(!k)throw fail(404,'Kündigung nicht gefunden');
    if(Number(k.personalnummer)!==nr)throw fail(409,'Kündigung gehört zu anderer Personalakte');
   }
   const title=tpl.titel+' – '+person.vorname+' '+person.nachname;
   const docx=await befuellen(type,person,f);
   token=await googleCodeToken(code,req.get('origin'),oauth);
   fileId=await googleDocsUpload(token,title,docx);
   const link='https://docs.google.com/document/d/'+fileId+'/edit';
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    if(type==='abmahnung'){
     const record=await client.query('SELECT slots FROM disziplin WHERE personalnummer=$1 FOR UPDATE',[nr]);
     const slots=Array.isArray(record.rows[0]?.slots)?record.rows[0].slots.slice():Array(6).fill(null);
     const index=Number(f.stufe);
     if(slots[index]?.u)throw fail(409,'Für diese Abmahnung ist bereits ein Dokument hinterlegt');
     slots[index]={done:true,t:f.sachverhalt.slice(0,1500),u:link,d:f.datum};
     await client.query("INSERT INTO disziplin(personalnummer,slots,bemerkung) VALUES($1,$2::jsonb,'') ON CONFLICT(personalnummer) DO UPDATE SET slots=EXCLUDED.slots,aktualisiert=now()",[nr,JSON.stringify(slots)]);
    }
    if(['fristgerecht','fristlos'].includes(type)){
     const existing=await client.query('SELECT kuendigung FROM kuendigungen WHERE id=$1 FOR UPDATE',[kontext]);
     if(!existing.rowCount)throw fail(404,'Kündigung wurde gelöscht');
     const current=String(existing.rows[0].kuendigung||'');
     if(current.includes('https://'))throw fail(409,'Kündigungsdokument bereits hinterlegt');
     await client.query('UPDATE kuendigungen SET kuendigung=$1 WHERE id=$2',
      [JSON.stringify({t:title,u:link}),kontext]);
    }
    if(type.includes('vertrag')&&!praktik){
     await client.query("UPDATE personal SET arbeitsvertrag=$1,arbeitsvertrag_url=$2 WHERE personalnummer=$3 AND COALESCE(arbeitsvertrag_url,'')=''",[title,link,nr]);
    }
    await client.query('INSERT INTO generierte_dokumente(personalnummer,person_name,typ,titel,url,kontext_id,erstellt_von) VALUES($1,$2,$3,$4,$5,$6,$7)',
     [nr||null,person.vorname+' '+person.nachname,type,title,link,kontext||null,req.user.id]);
    await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",[req.user.id,'Dokument erstellt: '+title]);
    await client.query('COMMIT');saved=true;
   }catch(e){await client.query('ROLLBACK');throw e;}
   finally{client.release();}
   res.json({ok:true,titel:title,url:link});
  }catch(e){
   if(fileId&&token&&!saved)await deleteGoogleDoc(token,fileId);
   if(e.httpStatus)return res.status(e.httpStatus).json({error:e.message});
   // Fehler an den Originalvorlagen dem Bearbeiter konkret anzeigen.
   if(/^(Originalvorlage|Vorlage|Word-Inhalt|Google Drive hat|Kein bearbeitbares)/.test(e.message)){
    console.warn('[Dokumentgenerator] Vorlage/Google:',e.message);
    return res.status(422).json({error:e.message});
   }
   console.error('[Dokumentgenerator]',e.message);next(e);
  }
 });
}
