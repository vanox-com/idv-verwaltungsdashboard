const defaults=['Mündliche Ermahnung','Schriftliche Verwarnung','Schriftliche Abmahnung',
 'Degradierung nach PDV §28','Beförderungssperre','Entlassung nach PDV §33',
 'Anordnung von Weiterbildungskursen','Entziehung abgelegter Prüfungen','Nicht diensttauglich',
 'Anordnung sportlicher oder erzieherischer Maßnahmen','Suspendierung']
 .map((text,i)=>({id:i+1,text}));

import {createHash} from 'node:crypto';
const invalid=(res,msg)=>res.status(400).json({error:msg});
async function snapshot(client){
 const [r,o]=await Promise.all([
  client.query('SELECT id,stand,pdv,text_kurz,mild,hart,sonst,anmerkung,sortierung FROM richtlinie ORDER BY sortierung,id'),
  client.query("SELECT werte FROM system_optionen WHERE schluessel='disziplin_massnahmen'")
 ]);
 const massnahmen=o.rows[0]?.werte??defaults;
 const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['stand','pdv','text_kurz','mild','hart','sonst','anmerkung'].includes(k)?String(v??''):v])));
 const revision=createHash('sha256').update(JSON.stringify([rows,massnahmen])).digest('hex');
 return {zeilen:rows,massnahmen,revision,stand:rows[0]?.stand||''};
}
export function registerDisziplinRichtlinie(app,db,requireLogin,effektiveRechte){
 app.get('/api/disziplinrichtlinie',requireLogin,async(req,res,next)=>{
  try{
   const rights=await effektiveRechte(req.user);
   if((rights.rl||0)<1)return res.status(403).json({error:'Keine Leseberechtigung'});
   res.json(await snapshot(db));
  }catch(e){next(e)}
 });
 app.put('/api/disziplinrichtlinie',requireLogin,async(req,res,next)=>{
  let rights;
  try{rights=await effektiveRechte(req.user)}catch(e){return next(e)}
  if((rights.rlbearb||0)<2)return res.status(403).json({error:'Keine Berechtigung zum Bearbeiten der Richtlinie'});
  const {massnahmen,zeilen,revision,stand}=req.body||{};
  if(!Array.isArray(massnahmen)||massnahmen.length>100||!Array.isArray(zeilen)||zeilen.length>1000||typeof revision!=='string')
   return invalid(res,'Ungültige Richtliniendaten');
  const ids=new Set();
  for(const m of massnahmen){
   if(!Number.isInteger(m?.id)||m.id<1||m.id>9999||typeof m.text!=='string'||m.text.trim().length<2||m.text.length>250||ids.has(m.id))
    return invalid(res,'Ungültiger oder doppelter Maßnahmenpunkt');
   ids.add(m.id);
  }
  for(const row of zeilen){
   if(!row||!['pdv','text_kurz','mild','hart','sonst','anmerkung'].every(k=>typeof row[k]==='string'&&row[k].length<=2000)||
      !row.pdv.trim()||!row.text_kurz.trim())return invalid(res,'Ungültiger Richtlinieneintrag');
   for(const field of ['mild','hart']){
    const match=row[field].trim().match(/^Punkt\s+(\d+)$/i);
    if(match&&!ids.has(Number(match[1])))return invalid(res,'Ein Eintrag verweist auf einen entfernten Maßnahmenpunkt '+match[1]);
   }
  }
  const client=await db.connect().catch(next);if(!client)return;
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock($1)',[715286]);
   const current=await snapshot(client);
   if(current.revision!==revision){await client.query('ROLLBACK');return res.status(409).json({error:'Richtlinie wurde inzwischen geändert. Bitte neu laden.'});}
   await client.query("INSERT INTO system_optionen(schluessel,werte) VALUES('disziplin_massnahmen',$1::jsonb) ON CONFLICT(schluessel) DO UPDATE SET werte=EXCLUDED.werte,aktualisiert=now()",[JSON.stringify(massnahmen)]);
   await client.query('DELETE FROM richtlinie');
   for(const [i,row] of zeilen.entries())await client.query(
    'INSERT INTO richtlinie(stand,pdv,text_kurz,mild,hart,sonst,anmerkung,sortierung) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [String(stand||'').slice(0,100),row.pdv,row.text_kurz,row.mild,row.hart,row.sonst,row.anmerkung,i]);
   await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",[req.user.id,'Disziplinarrichtlinie bearbeitet ('+zeilen.length+' Einträge, '+massnahmen.length+' Maßnahmen)']);
   await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
 });
}
