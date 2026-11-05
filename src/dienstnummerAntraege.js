/* POR-genehmigte Dienstnummernwechsel.
 * Bestehende Zielakten werden nie überschrieben. Vergangene Vorgänge und
 * Anwesenheiten behalten die alte historische Dienstnummer. */
const CURRENT=new Set(['Aktiv','Abgemeldet','Inaktiv','Suspendiert']);
const FK_TABLES=new Set(['copnet_zugaenge','disziplin','generierte_dokumente','personal_fristen','personal_rangantraege','sonderfunktionen']);
const num=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>=1&&n<=999999?n:null;};
const date=v=>v instanceof Date?v.toISOString().slice(0,10):v?String(v).slice(0,10):'';
const lower=v=>String(v||'').trim().toLocaleLowerCase('de-DE');
const fullName=p=>[p.vorname,p.nachname].filter(Boolean).join(' ').trim();
const error=(code,message)=>Object.assign(new Error(message),{httpStatus:code});
const employment=n=>n>=51&&n<=60?'Nebenberuf':'Hauptberuf';
const safeIdentifier=n=>{if(!/^[a-z_]+$/.test(n))throw error(500,'Ungültiger SQL-Bezeichner');return '"'+n+'"';};

async function checkNumbers(client,oldNr,newNr,kind,locked=false){
 const locking=locked?' FOR UPDATE':'';
 const personal=await client.query(
  'SELECT *,xmin::text AS rev FROM personal WHERE personalnummer=ANY($1::integer[]) ORDER BY personalnummer'+locking,[[oldNr,newNr]]);
 const old=personal.rows.find(p=>Number(p.personalnummer)===oldNr);
 const target=personal.rows.find(p=>Number(p.personalnummer)===newNr);
 if(!old||old.administrativ_geloescht_am||!CURRENT.has(old.status))
  throw error(409,'Quell-Dienstnummer ist nicht mehr aktiv');
 const users=await client.query(
  "SELECT id,dienstnummer,rolle FROM users WHERE dienstnummer ~ '^[0-9]{1,6}$' AND dienstnummer::int=ANY($1::integer[]) ORDER BY id"+locking,
  [[oldNr,newNr]]);
 const account=users.rows.find(u=>Number(u.dienstnummer)===oldNr);
 if(users.rows.some(u=>Number(u.dienstnummer)===newNr))
  throw error(409,'Ziel-Dienstnummer hat bereits einen Panel-Zugang');
 if(kind==='zugang'){
  if(!target||target.administrativ_geloescht_am||!CURRENT.has(target.status)||!account||
     !['Polizeirat','Leitungsdienst','Administrator'].includes(account.rolle))
   throw error(409,'Zugangswechsel benötigt zwei aktuelle Personalakten und einen Quell-Login');
  if(lower(old.vorname)!==lower(target.vorname)||lower(old.nachname)!==lower(target.nachname)||
     date(old.geburtsdatum)!==date(target.geburtsdatum)||
     date(old.eintrittsdatum)!==date(target.eintrittsdatum))
   throw error(409,'Ziel-Personalakte gehört nicht eindeutig derselben Person');
 }else if(kind==='personal'){
  if(target&&!target.administrativ_geloescht_am)
   throw error(409,'Die Zielnummer ist noch aktiv belegt. Nur freie oder administrativ gelöschte Nummern können umnummeriert werden');
 }else throw error(400,'Ungültige Art der Dienstnummernänderung');
 return {old,target,account,stamp:{
   oldRevision:old.rev,targetRevision:target?.rev??null,
   accountId:account?.id??null,accountNumber:account?.dienstnummer??null,
   oldName:fullName(old),targetName:target?fullName(target):null,
   oldEntry:date(old.eintrittsdatum),targetEntry:date(target?.eintrittsdatum)
 }};
}
/* Erneute Belegung einer aus dem Papierkorb freigegebenen Dienstnummer.
 * Historische Akte und Beziehungen vor dem Wiederverwenden unveränderlich
 * sichern; alte Zuordnungen nicht an den neuen Stelleninhaber vererben.
 * Aufgerufen ausschließlich innerhalb der POR-Genehmigungstransaktion. */
async function archivierteZielnummerVorbereiten(client,target,approver){
 if(!target?.administrativ_geloescht_am)
  throw error(409,'Die Zielnummer ist nicht mehr im Papierkorb');
 const nr=Number(target.personalnummer);
 const tabellen=['sonderfunktionen','disziplin','copnet_zugaenge','personal_fristen',
   'personal_rangantraege','generierte_dokumente','befoerderungen','personal_audit'];
 const folgedaten={};
 for(const table of tabellen){
  const result=await client.query('SELECT * FROM '+table+' WHERE personalnummer=$1 FOR UPDATE',[nr]);
  folgedaten[table]=result.rows;
 }
 const routine=await client.query(
  "SELECT id,tage,personen FROM routine WHERE jsonb_typeof(personen)='array' "+
  "AND EXISTS(SELECT 1 FROM jsonb_array_elements(personen) x WHERE x->>'nr'=$1) FOR UPDATE",[String(nr)]);
 folgedaten.routine=routine.rows.map(r=>({
  id:r.id,tage:r.tage,teilnehmer:r.personen.filter(p=>p&&Number(p.nr)===nr)
 }));
 const {rev,...original}=target;
 await client.query(
  'INSERT INTO personalnummer_neubelegungen(personalnummer,vergeben_von,vorher,folgedaten) VALUES($1,$2,$3::jsonb,$4::jsonb)',
  [nr,approver,JSON.stringify(original),JSON.stringify(folgedaten)]);
 for(const table of ['sonderfunktionen','disziplin','copnet_zugaenge','personal_fristen',
   'personal_rangantraege','personal_audit'])
  await client.query('DELETE FROM '+table+' WHERE personalnummer=$1',[nr]);
 await client.query('UPDATE generierte_dokumente SET personalnummer=NULL WHERE personalnummer=$1',[nr]);
 await client.query('UPDATE befoerderungen SET personalnummer=NULL WHERE personalnummer=$1',[nr]);
 for(const r of routine.rows){
  await client.query('UPDATE routine SET personen=$1::jsonb WHERE id=$2',
   [JSON.stringify(r.personen.filter(p=>!p||Number(p.nr)!==nr)),r.id]);
 }
}

async function executeApproved(client,request,context,approver){
 const from=Number(request.alt_nr),to=Number(request.ziel_nr);
 await client.query("SELECT set_config('idv.benutzer',$1,true)",[String(approver)]);
 if(request.art==='zugang'){
  const moved=await client.query('UPDATE users SET dienstnummer=$1 WHERE id=$2 AND dienstnummer=$3',
    [String(to).padStart(2,'0'),context.account.id,context.account.dienstnummer]);
  if(moved.rowCount!==1)throw error(409,'Quell-Login wurde geändert');
  // Source is a duplicate staff record of the same person. Archive it,
  // but retain original data/links and historical associations.
  const saved=await client.query(
   'UPDATE personal SET administrativ_geloescht_am=now(),administrativ_geloescht_von=$2 WHERE personalnummer=$1 AND administrativ_geloescht_am IS NULL',
   [from,approver]);
  if(saved.rowCount!==1)throw error(409,'Quell-Personalakte nicht mehr aktuell');
 }else{
  // PostgreSQL FK relationships must be reparented before deleting source.
  const fks=(await client.query(
   "SELECT c.relname AS tablename,ARRAY(SELECT a.attname FROM unnest(f.conkey) x(n) JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=x.n) AS columns"+
   " FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid WHERE f.contype='f' AND f.confrelid='personal'::regclass")).rows;
  for(const fk of fks){
   if(!FK_TABLES.has(fk.tablename)||fk.columns.length!==1||fk.columns[0]!=='personalnummer')
    throw error(409,'Unbekannte Personal-Fremdschlüsselreferenz. Änderung abgebrochen');
  }
  const cols=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='personal' ORDER BY ordinal_position")).rows.map(x=>x.column_name);
  const attrs=cols.filter(x=>x!=='personalnummer');
  if(context.target){
   // Einträge im Papierkorb gelten als frei; der alte DN-13-Datenstand
   // wandert vor der POR-Umnummerierung in die Neubelegungshistorie.
   await archivierteZielnummerVorbereiten(client,context.target,approver);
   const assignments=attrs.map(col=>safeIdentifier(col)+'=source.'+safeIdentifier(col)).join(',');
   const changed=await client.query(
    'UPDATE personal AS destination SET '+assignments+
    ' FROM personal AS source WHERE source.personalnummer=$1 AND '+
    'destination.personalnummer=$2 AND destination.administrativ_geloescht_am IS NOT NULL '+
    'RETURNING destination.personalnummer',[from,to]);
   if(changed.rowCount!==1)throw error(409,'Archivierte Zielakte konnte nicht übernommen werden');
  }else{
   await client.query(
    'INSERT INTO personal ("personalnummer",'+attrs.map(safeIdentifier).join(',')+') SELECT $2,'+
    attrs.map(safeIdentifier).join(',')+' FROM personal WHERE personalnummer=$1',[from,to]);
  }
  await client.query('UPDATE personal SET beschaeftigungsart=$2 WHERE personalnummer=$1',[to,employment(to)]);
  for(const fk of fks){
   await client.query('UPDATE '+safeIdentifier(fk.tablename)+' SET personalnummer=$2 WHERE personalnummer=$1',[from,to]);
  }
  await client.query('UPDATE routine SET personalnummer=$2 WHERE personalnummer=$1',[from,to]);
  if(context.account){
   // Vollständige Personalumstellung ist KEIN neuer/fortlaufender Panel-Zugang.
   // Nach einem Rücktritt entfallen die vorherigen Leitungsrechte. Das alte
   // Benutzerkonto bleibt für die Audit-Historie erhalten, wird aber gesperrt
   // und unter einer NICHT numerischen Archivkennung abgelegt. Dadurch sind
   // beide Dienstnummern für spätere berechtigte Zuordnungen frei.
   const archivLogin='archiv-'+from+'-'+context.account.id;
   const locked=await client.query(
    'UPDATE users SET dienstnummer=$1,gesperrt=true WHERE id=$2 AND dienstnummer=$3',
    [archivLogin,context.account.id,context.account.dienstnummer]);
   if(locked.rowCount!==1)throw error(409,'Panel-Zugang wurde zwischenzeitlich geändert');
   await client.query('DELETE FROM sessions WHERE user_id=$1',[context.account.id]);
  }
  await client.query('DELETE FROM personal WHERE personalnummer=$1',[from]);
 }
 await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
  [approver,'POR-Dienstnummer '+from+' → '+to+' ('+request.art+') genehmigt und umgesetzt']);
 await client.query('INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES($1,$2,$3::jsonb)',
  [to,approver,JSON.stringify({dienstnummer:{alt:from,neu:to},typ:request.art})]);
}
export function registerDienstnummerAntraege(app,db,requireLogin,effektiveRechte){
 app.get('/api/dienstnummer-antraege',requireLogin,async(req,res,next)=>{
  try{
   const rights=await effektiveRechte(req.user);
   if((rights.pers||0)<1&&(rights.por||0)<1)
    return res.status(403).json({error:'Kein Recht auf Dienstnummern-Anträge'});
   const all=(rights.por||0)>=1||req.user.rolle==='Administrator';
   const where=all?'':'WHERE a.antragsteller_id=$1';
   const result=await db.query(
    "SELECT a.id,a.alt_nr,a.ziel_nr,a.art,a.begruendung,a.status,a.quell_name,a.ziel_name,"+
    "a.entscheidungsnotiz,a.erstellt,a.entschieden_am,a.antragsteller_id,a.entscheider_id,"+
    "COALESCE(u.anzeigename,'–') AS antragsteller,COALESCE(e.anzeigename,'–') AS entscheider "+
    "FROM dienstnummer_antraege a LEFT JOIN users u ON u.id=a.antragsteller_id "+
    "LEFT JOIN users e ON e.id=a.entscheider_id "+where+
    " ORDER BY (a.status='beantragt') DESC,a.erstellt DESC,a.id DESC LIMIT 200",all?[]:[req.user.id]);
   res.json({antraege:result.rows,darfGenehmigen:(rights.por||0)>=2,darfBeantragen:(rights.pers||0)>=1});
  }catch(e){next(e)}
 });
 app.post('/api/dienstnummer-antraege',requireLogin,async(req,res,next)=>{
  let rights;
  try{rights=await effektiveRechte(req.user)}catch(e){return next(e)}
  const from=num(req.body?.alt_nr),to=num(req.body?.ziel_nr);
  if((rights.pers||0)<1||((rights.pers||0)<2&&Number(req.user.dienstnummer)!==from))
   return res.status(403).json({error:'Mit Personal-Leserecht darfst du nur für deine eigene Dienstnummer einen Antrag stellen'});
  const kind=String(req.body?.art||''),reason=String(req.body?.begruendung||'').trim();
  if(!from||!to||from===to||!['zugang','personal'].includes(kind)||reason.length<8||reason.length>1000)
   return res.status(400).json({error:'Gültige Nummern, Antragsart und Begründung (8–1000 Zeichen) erforderlich'});
  const client=await db.connect().catch(next);if(!client)return;
  try{
   await client.query('BEGIN');
   const current=await checkNumbers(client,from,to,kind,true);
   const created=await client.query(
    'INSERT INTO dienstnummer_antraege(alt_nr,ziel_nr,art,begruendung,quell_name,ziel_name,pruefstand,antragsteller_id) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id',
    [from,to,kind,reason,fullName(current.old),current.target?fullName(current.target):'',
     JSON.stringify(current.stamp),req.user.id]);
   await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'add')",
    [req.user.id,'Dienstnummern-Antrag '+from+' → '+to+' an POR gestellt']);
   await client.query('COMMIT');
   res.status(201).json({ok:true,id:created.rows[0].id,status:'beantragt'});
  }catch(e){
   await client.query('ROLLBACK').catch(()=>{});
   if(e.code==='23505')return res.status(409).json({error:'Für die Ausgangsnummer besteht bereits ein offener Antrag'});
   if(e.httpStatus)return res.status(e.httpStatus).json({error:e.message});
   next(e);
  }finally{client.release()}
 });
 app.post('/api/dienstnummer-antraege/:id/entscheidung',requireLogin,async(req,res,next)=>{
  let rights;
  try{rights=await effektiveRechte(req.user)}catch(e){return next(e)}
  if((rights.por||0)<2)return res.status(403).json({error:'Nur POR-Berechtigte dürfen entscheiden'});
  const id=Number(req.params.id),status=String(req.body?.status||''),note=String(req.body?.notiz||'').trim();
  if(!Number.isSafeInteger(id)||id<1||!['genehmigt','abgelehnt'].includes(status)||note.length>1000||
    (status==='abgelehnt'&&note.length<5))
   return res.status(400).json({error:'Ungültige POR-Entscheidung oder fehlende Begründung'});
  const client=await db.connect().catch(next);if(!client)return;
  try{
   await client.query('BEGIN');
   const got=await client.query('SELECT * FROM dienstnummer_antraege WHERE id=$1 FOR UPDATE',[id]);
   const application=got.rows[0];
   if(!application)throw error(404,'Antrag nicht gefunden');
   if(application.status!=='beantragt')throw error(409,'Antrag ist bereits abgeschlossen');
   if(status==='genehmigt'){
    if(Number(application.antragsteller_id)===Number(req.user.id)&&req.user.rolle!=='Administrator')
     throw error(403,'Eigene Anträge dürfen nur durch einen anderen POR-Berechtigten entschieden werden');
    const context=await checkNumbers(client,Number(application.alt_nr),Number(application.ziel_nr),application.art,true);
    if(JSON.stringify(context.stamp)!==JSON.stringify(application.pruefstand))
     throw error(409,'Personal- oder Kontodaten haben sich verändert. Bitte neuen Antrag stellen');
    await executeApproved(client,application,context,req.user.id);
   }
   await client.query('UPDATE dienstnummer_antraege SET status=$2,entscheider_id=$3,entscheidungsnotiz=$4,entschieden_am=now() WHERE id=$1',
    [id,status,req.user.id,note]);
   await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
    [req.user.id,'POR-Dienstnummern-Antrag #'+id+' '+status]);
   await client.query('COMMIT');
   res.json({ok:true,status,umgesetzt:status==='genehmigt'});
  }catch(e){
   await client.query('ROLLBACK').catch(()=>{});
   if(e.httpStatus)return res.status(e.httpStatus).json({error:e.message});
   if(e.code==='23505'||e.code==='23503')return res.status(409).json({error:'Zielnummer inzwischen belegt oder Datenverknüpfung verhindert Wechsel'});
   next(e);
  }finally{client.release()}
 });
}
