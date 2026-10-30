import {ANWAERTER_PRUEFUNGEN} from './befPruefungMap.js';
/* Prüfungsstatus aller drei Anwärterlaufbahnen und geschützte Richtlinien. */
const bad=(code,msg)=>Object.assign(new Error(msg),{httpStatus:code});
export function registerBefRichtRoutes(app,db,requireLogin,requireRight){
 app.patch('/api/bef/pruefung/:nr',requireLogin,requireRight('bef',2),async(req,res,next)=>{
  try{
   const nr=Number(req.params.nr),bestanden=req.body?.bestanden;
   if(!Number.isSafeInteger(nr)||nr<1||typeof bestanden!=='boolean')
    throw bad(400,'Ungültiger Prüfungsstatus');
   const p=(await db.query('SELECT dienstgrad FROM personal WHERE personalnummer=$1',[nr])).rows[0];
   if(!p)throw bad(404,'Personalakte nicht gefunden');
   const pruefung=ANWAERTER_PRUEFUNGEN[p.dienstgrad];
   if(!pruefung)
    throw bad(409,'Prüfungsstatus nur für PM-, PK- und KK-Anwärter änderbar');
   await db.query(
    "INSERT INTO sonderfunktionen(personalnummer,leitung,sonstige,werte) VALUES($1,'','',jsonb_build_object($3::text,$2::boolean))"+
    " ON CONFLICT(personalnummer) DO UPDATE SET werte=COALESCE(sonderfunktionen.werte,'{}'::jsonb)||jsonb_build_object($3::text,$2::boolean),aktualisiert=now()",
    [nr,bestanden,pruefung.code]);
   await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
    [req.user.id,pruefung.code+'-Prüfung bei Nr. '+nr+': '+(bestanden?'bestanden':'notwendig')]);
   res.json({ok:true,personalnummer:nr,bestanden,pruefung:pruefung.code});
  }catch(err){if(err.httpStatus)return res.status(err.httpStatus).json({error:err.message});next(err)}
 });
 app.get('/api/befricht',requireLogin,requireRight('befricht',1),async(req,res,next)=>{
  try{const {rows}=await db.query('SELECT name,abk,tage,bemerkung,grund,sortierung,naechster_rang FROM raenge ORDER BY sortierung,name');
   res.json(rows);
  }catch(err){next(err)}
 });
 app.patch('/api/befricht/:name',requireLogin,requireRight('befricht',2),async(req,res,next)=>{
  try{
   const name=String(req.params.name||''),body=req.body||{};
   if(!name||name.length>120)throw bad(400,'Ungültiger Dienstgrad');
   const days=body.tage;
   if(days!==null&&(!Number.isInteger(days)||days<1||days>3650))
    throw bad(400,'Wartezeit muss eine ganze Zahl zwischen 1 und 3650 Tagen sein oder leer bleiben');
   if(typeof body.bemerkung!=='string'||typeof body.grund!=='string'||
       body.bemerkung.length>1500||body.grund.length>500)
    throw bad(400,'Ungültige Bemerkung oder Begründung');
   const entries=await db.query('SELECT name,naechster_rang FROM raenge WHERE name=$1',[name]);
   const entry=entries.rows[0];if(!entry)throw bad(404,'Dienstgrad nicht gefunden');
   if(ANWAERTER_PRUEFUNGEN[name]&&days!==null)
    throw bad(400,'PM-, PK- und KK-Anwärter haben keine Mindestwartezeit; entscheidend ist die bestandene Prüfung');
   if(!entry.naechster_rang&&days!==null)
    throw bad(400,'Ein Enddienstgrad ohne Folgerang kann keine Beförderungsfrist haben');
   const result=await db.query(
    'UPDATE raenge SET tage=$1,bemerkung=$2,grund=$3 WHERE name=$4 RETURNING name,tage,bemerkung,grund,naechster_rang',
    [days,body.bemerkung.trim(),body.grund.trim(),name]);
   await db.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",
    [req.user.id,'Beförderungsrichtlinie geändert: '+name+' ('+(days===null?'keine Frist':days+' Tage')+')']);
   res.json({ok:true,regel:result.rows[0]});
  }catch(err){if(err.httpStatus)return res.status(err.httpStatus).json({error:err.message});next(err)}
 });
}
