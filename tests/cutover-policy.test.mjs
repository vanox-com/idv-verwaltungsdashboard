import test from 'node:test';
import assert from 'node:assert/strict';
import {readinessErrors,executionErrors,REQUIRED_RELEASE_GATES,
  FINAL_ACKNOWLEDGEMENTS} from '../scripts/mysql/cutover-policy.mjs';

const fullyApproved=()=>({
  schema_import_real_mysql8:true,smoke_pdo_mysql8:true,
  releases:Object.fromEntries(REQUIRED_RELEASE_GATES.map(g=>[g,true]))
});
const safeEnv=()=>({
  ...FINAL_ACKNOWLEDGEMENTS,
  SOURCE_DATABASE_URL:'postgresql://ci-only:dummy@127.0.0.1:5432/idv_source_ci',
  MYSQL_DESTINATION_URL:'mysql://ci-only:dummy@127.0.0.1:3306/idv_target_ci',
  IDV_EXPECTED_SOURCE_DATABASE:'idv_source_ci',
  IDV_EXPECTED_TARGET_DATABASE:'idv_target_ci'
});

test('all nine release gates are mandatory and no extras are silently accepted',()=>{
 const config=fullyApproved();
 assert.equal(readinessErrors(config).length,0);
 for(const gate of REQUIRED_RELEASE_GATES){
  const blocked=fullyApproved();blocked.releases[gate]=false;
  assert.ok(readinessErrors(blocked).some(v=>v.includes(gate)),gate);
  delete blocked.releases[gate];
  assert.ok(readinessErrors(blocked).some(v=>v.includes(gate)),gate+' missing');
 }
 config.releases.unknown_release_gate=true;
 assert.ok(readinessErrors(config).some(v=>v.includes('unknown_release_gate')));
 assert.ok(readinessErrors({}).length>0);
});

test('execution requires all explicit acknowledgments and restore-tested backup',()=>{
 const approved=safeEnv();
 assert.deepEqual(executionErrors(approved),[]);
 for(const name of Object.keys(FINAL_ACKNOWLEDGEMENTS)){
  const blocked=safeEnv();delete blocked[name];
  assert.ok(executionErrors(blocked).some(s=>s.includes(name)),name);
 }
 const weak=safeEnv();weak.IDV_BACKUP_CONFIRMED='YES';
 assert.ok(executionErrors(weak).some(s=>s.includes('IDV_BACKUP_CONFIRMED')));
});

test('target identity and URL protocols are validated before any connection',()=>{
 let e=safeEnv();e.MYSQL_DESTINATION_URL='mysql://user:pwd@example.test/other';
 assert.ok(executionErrors(e).some(s=>s.includes('Ziel: Datenbankname')));
 e=safeEnv();e.MYSQL_DESTINATION_URL='postgresql://user:pwd@example.test/idv_target_ci';
 assert.ok(executionErrors(e).some(s=>s.includes('MySQL-Zielverbindung')));
 e=safeEnv();e.SOURCE_DATABASE_URL='not-a-database';
 assert.ok(executionErrors(e).some(s=>s.includes('PostgreSQL-Quellverbindung')));
 e=safeEnv();e.IDV_EXPECTED_SOURCE_DATABASE='some-other-source';
 assert.ok(executionErrors(e).some(s=>s.includes('Quelle: Datenbankname')));
 e=safeEnv();e.IDV_EXPECTED_TARGET_DATABASE='';
 assert.ok(executionErrors(e).some(s=>s.includes('Ziel: ausdrücklich')));
});
test('no secrets, source data or live systems are needed for validation',()=>{
 const config=fullyApproved(),env=safeEnv();
 assert.equal(readinessErrors(config).length,0);
 assert.equal(executionErrors(env).length,0);
});
