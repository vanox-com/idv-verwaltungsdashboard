import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDienstnummerAntraege} from '../src/dienstnummerAntraege.js';

function harness({differentIdentity=false,ownApproval=false}={}){
 const personal=new Map([
  [2,{personalnummer:2,vorname:'Dr. Florian',nachname:'Mayer',
       eintrittsdatum:'2025-12-22',geburtsdatum:'2000-02-01',
       status:'Aktiv',administrativ_geloescht_am:null,rev:'100',dienstgrad:'Polizeihauptkommissar A12'}],
  [13,{personalnummer:13,vorname:differentIdentity?'Fremde':'Dr. Florian',
       nachname:'Mayer',eintrittsdatum:'2025-12-22',geburtsdatum:'2000-02-01',
       status:'Aktiv',administrativ_geloescht_am:null,rev:'101',dienstgrad:'Erster Polizeihauptkommissar'}]
 ]);
 const accounts=[{id:4,dienstnummer:'02',rolle:'Leitungsdienst'}];
 const applications=[];
 const mutations=[];
 const routes=new Map();
 const app={get(path,...m){routes.set('GET '+path,m.at(-1))},
            post(path,...m){routes.set('POST '+path,m.at(-1))}};
 const db={
  async connect(){return {query,release(){}}},
  async query(...args){return query(...args)}
 };
 async function query(s,p=[]){
  const sql=s.trim();
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[],rowCount:0};
  if(sql.startsWith('SELECT *,xmin::text AS rev FROM personal')){
   return {rows:p[0].map(n=>personal.get(n)).filter(Boolean).map(x=>({...x})),rowCount:2};
  }
  if(sql.startsWith('SELECT id,dienstnummer,rolle FROM users')){
   return {rows:accounts.filter(a=>p[0].includes(Number(a.dienstnummer))).map(x=>({...x})),rowCount:1};
  }
  if(sql.startsWith('INSERT INTO dienstnummer_antraege(')){
   const a={id:applications.length+1,alt_nr:p[0],ziel_nr:p[1],art:p[2],begruendung:p[3],
    quell_name:p[4],ziel_name:p[5],pruefstand:JSON.parse(p[6]),antragsteller_id:p[7],status:'beantragt'};
   applications.push(a);
   return {rows:[{id:a.id}],rowCount:1};
  }
  if(sql.startsWith('SELECT * FROM dienstnummer_antraege WHERE id=')){
   const a=applications.find(x=>x.id===p[0]);return {rows:a?[{...a}]:[],rowCount:a?1:0};
  }
  if(sql.startsWith('UPDATE users SET dienstnummer=')){
   const u=accounts.find(x=>x.id===p[1]&&x.dienstnummer===p[2]);
   if(u){u.dienstnummer=p[0];mutations.push('account');}
   return {rows:[],rowCount:u?1:0};
  }
  if(sql.startsWith('UPDATE personal SET administrativ_geloescht_am=')){
   const a=personal.get(p[0]);
   if(a){a.administrativ_geloescht_am='now';mutations.push('archiveOld');}
   return {rows:[],rowCount:a?1:0};
  }
  if(sql.startsWith('UPDATE dienstnummer_antraege SET')){
   const a=applications.find(x=>x.id===p[0]);
   a.status=p[1];a.entscheider_id=p[2];
   mutations.push('decide');return {rows:[],rowCount:1};
  }
  if(sql.startsWith('SELECT set_config(')||sql.startsWith('INSERT INTO log(')||sql.startsWith('INSERT INTO personal_audit('))
   return {rows:[],rowCount:1};
  throw new Error('Unexpected SQL in test: '+sql.slice(0,120));
 }
 const rights=u=>u.roleRights??{pers:2,por:0};
 registerDienstnummerAntraege(app,db,(r,res,next)=>next(),rights);
 async function call(method,path,{user,body,params}={}){
  let statusCode=200,response;
  const res={
   status(n){statusCode=n;return this},
   json(x){response=x;return this}
  };
  const req={user:user??{id:5,rolle:'Leitungsdienst',dienstnummer:'05',roleRights:{pers:2,por:0}},
    body:body??{},params:params??{}};
  const next=e=>{if(e)throw e};
  const fn=routes.get(method+' '+path);
  assert.ok(fn,'Missing route '+path);
  await fn(req,res,next);
  return {statusCode,response};
 }
 return {call,personal,accounts,applications,mutations};
}
const submit={alt_nr:2,ziel_nr:13,art:'zugang',begruendung:'Rücktritt und Übernahme DN 13'};

test('normaler Bearbeiter kann beantragen, aber Antrag verändert weder Login noch Personal',async()=>{
 const h=harness();
 const r=await h.call('POST','/api/dienstnummer-antraege',{body:submit});
 assert.equal(r.statusCode,201);
 assert.equal(r.response.status,'beantragt');
 assert.equal(h.accounts[0].dienstnummer,'02');
 assert.equal(h.personal.get(2).administrativ_geloescht_am,null);
 assert.deepEqual(h.mutations,[]);
});
test('POR-Genehmigung verlegt nur den Login und archiviert die doppelte Quellakte',async()=>{
 const h=harness();
 await h.call('POST','/api/dienstnummer-antraege',{body:submit});
 const result=await h.call('POST','/api/dienstnummer-antraege/:id/entscheidung',
 {user:{id:6,rolle:'Polizeirat',dienstnummer:'06',roleRights:{pers:1,por:2}},
  params:{id:'1'},body:{status:'genehmigt',notiz:''}});
 assert.equal(result.statusCode,200);
 assert.equal(h.accounts[0].dienstnummer,'13');
 assert.ok(h.personal.get(2).administrativ_geloescht_am);
 assert.equal(h.personal.get(13).dienstgrad,'Erster Polizeihauptkommissar');
 assert.equal(h.applications[0].status,'genehmigt');
});
test('POR-Ablehnung verändert keine Personaldaten',async()=>{
 const h=harness();
 await h.call('POST','/api/dienstnummer-antraege',{body:submit});
 const result=await h.call('POST','/api/dienstnummer-antraege/:id/entscheidung',
  {user:{id:6,rolle:'Polizeirat',roleRights:{por:2}},
   params:{id:'1'},body:{status:'abgelehnt',notiz:'Nicht vorgesehen'}});
 assert.equal(result.statusCode,200);
 assert.equal(h.accounts[0].dienstnummer,'02');
 assert.equal(h.personal.get(2).administrativ_geloescht_am,null);
 assert.equal(h.applications[0].status,'abgelehnt');
});
test('fremde belegte Zielakte darf nicht überschrieben werden',async()=>{
 const h=harness({differentIdentity:true});
 const result=await h.call('POST','/api/dienstnummer-antraege',{body:submit});
 assert.equal(result.statusCode,409);
 assert.equal(h.applications.length,0);
});
test('bereits entschiedener Antrag kann nicht nochmals genehmigt werden',async()=>{
 const h=harness();
 await h.call('POST','/api/dienstnummer-antraege',{body:submit});
 const approver={id:6,rolle:'Polizeirat',roleRights:{por:2}};
 const args={user:approver,params:{id:'1'},body:{status:'genehmigt',notiz:''}};
 await h.call('POST','/api/dienstnummer-antraege/:id/entscheidung',args);
 const result=await h.call('POST','/api/dienstnummer-antraege/:id/entscheidung',args);
 assert.equal(result.statusCode,409);
 assert.deepEqual(h.mutations,['account','archiveOld','decide']);
});
test('eigene Anträge dürfen außer Administrator nicht selbst genehmigt werden',async()=>{
 const h=harness();
 await h.call('POST','/api/dienstnummer-antraege',{body:submit,
  user:{id:5,rolle:'Polizeirat',roleRights:{pers:2,por:2}}});
 const result=await h.call('POST','/api/dienstnummer-antraege/:id/entscheidung',{
  user:{id:5,rolle:'Polizeirat',roleRights:{por:2}},
  params:{id:'1'},body:{status:'genehmigt',notiz:''}});
 assert.equal(result.statusCode,403);
 assert.equal(h.accounts[0].dienstnummer,'02');
});
test('mit Personal-Leserecht ist nur ein eigener Antrag möglich',async()=>{
 const h=harness();
 const user={id:4,rolle:'Mitarbeiter',dienstnummer:'02',roleRights:{pers:1,por:0}};
 const mine=await h.call('POST','/api/dienstnummer-antraege',{user,body:submit});
 assert.equal(mine.statusCode,201);
 const other=await h.call('POST','/api/dienstnummer-antraege',{user,
  body:{...submit,alt_nr:7}});
 assert.equal(other.statusCode,403);
});
