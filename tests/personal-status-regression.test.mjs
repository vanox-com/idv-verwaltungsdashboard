import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PERSONNEL_STATUSES,validPersonnelStatus,repairMarkClarkStatus} from '../src/personalStatus.js';

test('only actual employee statuses can be saved',()=>{
  for(const value of ['Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten'])
    assert.equal(validPersonnelStatus(value),true,value);
  for(const value of ['Hauptberuf','Nebenberuf','','frei',null,{},'Aktiv '])
    assert.equal(validPersonnelStatus(value),false,String(value));
  assert.equal(validPersonnelStatus('Gekündigt',{creating:true}),false);
  assert.equal(validPersonnelStatus('Aktiv',{creating:true}),true);
  assert.deepEqual([...PERSONNEL_STATUSES],['Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten']);
});
test('create-person SQL stores actual status and employment in the right columns',()=>{
  const s=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(s,/INSERT INTO personal \(personalnummer, gruppe, beschaeftigungsart, status, vorname/);
  assert.match(s,/VALUES \(\$1,\$2,\$22,\$3,\$4,\$5,\$6/);
  assert.match(s,/if\(Object\.hasOwn\(b,'status'\)&&!validPersonnelStatus\(b\.status,\{creating:true\}\)\)/);
  assert.match(s,/if\(Object\.hasOwn\(body,'status'\)&&!validPersonnelStatus\(body\.status\)\)/);
  assert.doesNotMatch(s,/VALUES \(\$1,\$2,\$3,\$22,\$4,\$5,\$6/);
});
test('UI never offers employment types as personnel status',()=>{
  const s=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(s,/const statusAlle = \['Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten'\]/);
  assert.doesNotMatch(s,/const statusAlle = \[[^\n]+D\.personal/);
});
function pool({changed=false,failAudit=false}={}){
  const statements=[];
  const client={
    async query(sql,params=[]){
      statements.push({sql,params});
      if(sql.startsWith('UPDATE personal'))return {rowCount:changed?1:0};
      if(failAudit&&sql.startsWith('INSERT INTO personal_audit'))throw Error('Audit unavailable');
      return {rowCount:1};
    },
    release(){statements.push({sql:'RELEASE',params:[]});}
  };
  return {connect:async()=>client,statements};
}
test('guarded repair updates DN48 and logs audit exactly once',async()=>{
  const db=pool({changed:true});
  assert.equal(await repairMarkClarkStatus(db),true);
  assert.equal(db.statements[0].sql,'BEGIN');
  assert.match(db.statements[1].sql,/WHERE personalnummer=48/);
  assert.match(db.statements[1].sql,/status='Hauptberuf'/);
  assert.match(db.statements[1].sql,/beschaeftigungsart='Hauptberuf'/);
  assert.match(db.statements[1].sql,/lower\(btrim\(coalesce\(nachname,''\)\)\)='clark'/);
  assert.equal(db.statements.filter(x=>x.sql.startsWith('INSERT INTO personal_audit')).length,1);
  assert.equal(db.statements.filter(x=>x.sql.startsWith('INSERT INTO log')).length,1);
  assert.deepEqual(db.statements.slice(-2).map(x=>x.sql),['COMMIT','RELEASE']);
});
test('idempotent repair never audits or mutates an already fixed row',async()=>{
  const db=pool();
  assert.equal(await repairMarkClarkStatus(db),false);
  assert.equal(db.statements.filter(x=>x.sql.startsWith('INSERT INTO')).length,0);
  assert.deepEqual(db.statements.slice(-2).map(x=>x.sql),['COMMIT','RELEASE']);
});
test('audit failure rolls back the targeted repair',async()=>{
  const db=pool({changed:true,failAudit:true});
  await assert.rejects(()=>repairMarkClarkStatus(db),/Audit unavailable/);
  assert.deepEqual(db.statements.slice(-2).map(x=>x.sql),['ROLLBACK','RELEASE']);
});
