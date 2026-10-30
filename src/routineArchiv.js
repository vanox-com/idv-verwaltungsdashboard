/* Rutine-/Anwesenheitsarchiv mit revisionsfähigem Anwesenheitssnapshot.
   Archivieren und Wiederherstellen werden jeweils atomar mit dem aktiven
   Routineplan gespeichert. */
const err=(status,message)=>Object.assign(new Error(message),{httpStatus:status});
const validIso=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');
 return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value?null:value;
};
const toIso=value=>{
 if(typeof value!=='string')return null;
 if(validIso(value))return value;
 const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
 return m?validIso(m[3]+'-'+m[2]+'-'+m[1]):null;
};
const toGerman=iso=>iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4);
function validatePlan(plan){
 if(!plan||!Array.isArray(plan.tage)||!Array.isArray(plan.personen))
  throw err(409,'Routineplan enthält keine gültigen Termin- und Anwesenheitslisten');
 const count=plan.tage.length;
 for(const p of plan.personen){
  if(!Number.isSafeInteger(Number(p.nr))||!Array.isArray(p.anwesend)||p.anwesend.length!==count)
   throw err(409,'Anwesenheitsliste ist nicht mit den Routineterminen synchron');
 }
}
async function change(db,req,res,next,action){
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)
  return res.status(400).json({error:'Ungültige Routine'});
 const client=await db.connect().catch(next);if(!client)return;
 try{
  await client.query('BEGIN');
  const {rows}=await client.query(
   'SELECT id,tage,personen FROM routine WHERE id=$1 FOR UPDATE',[id]);
  const plan=rows[0];
  if(!plan)throw err(404,'Routineplan nicht gefunden');
  validatePlan(plan);
  const result=await action(client,plan);
  await client.query(
   'UPDATE routine SET tage=$1::jsonb,personen=$2::jsonb WHERE id=$3',
   [JSON.stringify(plan.tage),JSON.stringify(plan.personen),id]);
  await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
   [req.user.id,result.log]);
  await client.query('COMMIT');
  res.json({ok:true,...result.data});
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  if(e.httpStatus)return res.status(e.httpStatus).json({error:e.message});
  if(e.code==='23505')return res.status(409).json({error:'Dieser Termin liegt bereits im Archiv'});
  next(e);
 }finally{client.release()}
}
export function registerRoutineArchive(app,db,requireLogin,requireRight){
 app.get('/api/routine/:id/archiv',requireLogin,requireRight('rout',1),
  requireRight('routarchiv',1),async(req,res,next)=>{
   try{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<1)
     return res.status(400).json({error:'Ungültige Routine'});
    const existing=await db.query('SELECT 1 FROM routine WHERE id=$1',[id]);
    if(!existing.rowCount)return res.status(404).json({error:'Routineplan nicht gefunden'});
    const {rows}=await db.query(
     'SELECT a.id,a.routine_id,a.datum,a.teilnehmer,a.archiviert_am,'+
     'COALESCE(u.anzeigename,\'Unbekannt\') AS archiviert_von '+
     'FROM routine_archiv a LEFT JOIN users u ON u.id=a.archiviert_von '+
     'WHERE a.routine_id=$1 ORDER BY a.datum DESC,a.id DESC LIMIT 400',[id]);
    res.json(rows);
   }catch(e){next(e)}
  });
 app.post('/api/routine/:id/archiv',requireLogin,requireRight('rout',1),
  requireRight('routarchiv',2),async(req,res,next)=>change(db,req,res,next,async(client,plan)=>{
   const datum=validIso(req.body?.datum);
   if(!datum)throw err(400,'Ungültiges Termindatum');
   const index=plan.tage.findIndex(t=>toIso(t)===datum);
   if(index<0)throw err(404,'Termin ist nicht mehr aktiv');
   const exists=await client.query(
    'SELECT id FROM routine_archiv WHERE routine_id=$1 AND datum=$2 FOR UPDATE',
    [plan.id,datum]);
   if(exists.rowCount)throw err(409,'Termin befindet sich bereits im Archiv');
   // Vor dem Entfernen aller Spaltenwerte den vollständigen Stand sichern.
   const snapshot=plan.personen.map(p=>({
    nr:Number(p.nr),vorname:String(p.vorname||''),nachname:String(p.nachname||''),
    abgemeldet:p.abgemeldet===true,anwesend:p.anwesend[index]===true
   }));
   await client.query(
    'INSERT INTO routine_archiv(routine_id,datum,teilnehmer,archiviert_von) VALUES($1,$2,$3::jsonb,$4)',
    [plan.id,datum,JSON.stringify(snapshot),req.user.id]);
   plan.tage.splice(index,1);
   for(const person of plan.personen)person.anwesend.splice(index,1);
   return {log:'Routine '+plan.id+': Termin '+toGerman(datum)+' archiviert',
    data:{datum,anzahl:snapshot.length}};
  }));
 app.post('/api/routine/:id/archiv/:archivId/wiederherstellen',
  requireLogin,requireRight('rout',1),requireRight('routarchiv',2),
  async(req,res,next)=>change(db,req,res,next,async(client,plan)=>{
   const archivId=Number(req.params.archivId);
   if(!Number.isSafeInteger(archivId)||archivId<1)
    throw err(400,'Ungültiger Archiveintrag');
   const {rows}=await client.query(
    'SELECT id,datum,teilnehmer FROM routine_archiv WHERE id=$1 AND routine_id=$2 FOR UPDATE',
    [archivId,plan.id]);
   if(!rows.length)throw err(404,'Archivtermin nicht gefunden');
   const archived=rows[0];
   const datum=archived.datum instanceof Date
    ?archived.datum.toISOString().slice(0,10):String(archived.datum).slice(0,10);
   if(!validIso(datum)||!Array.isArray(archived.teilnehmer))
    throw err(409,'Archiv enthält ungültige Termindaten');
   if(plan.tage.some(t=>toIso(t)===datum))
    throw err(409,'Der Termin ist bereits wieder aktiv');
   if(plan.tage.length>=52)throw err(409,'Maximal 52 aktive Routinetermine');
   const index=plan.tage.findIndex(t=>toIso(t)>datum);
   const position=index<0?plan.tage.length:index;
   const byNumber=new Map(archived.teilnehmer.map(p=>[Number(p.nr),p.anwesend===true]));
   plan.tage.splice(position,0,toGerman(datum));
   for(const person of plan.personen){
    person.anwesend.splice(position,0,byNumber.get(Number(person.nr))===true);
   }
   await client.query('DELETE FROM routine_archiv WHERE id=$1 AND routine_id=$2',
    [archivId,plan.id]);
   return {log:'Routine '+plan.id+': Archivtermin '+toGerman(datum)+' wiederhergestellt',
    data:{datum}};
  }));
}
