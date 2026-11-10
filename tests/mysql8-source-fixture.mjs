/**
 * Entirely synthetic 48-table PostgreSQL source for CI-only migration roundtrip.
 * Does not touch Render or any externally hosted PostgreSQL database.
 */
import pg from 'pg';
import {readFile} from 'node:fs/promises';
const source=process.env.SOURCE_DATABASE_URL;
if(!source||!source.includes('127.0.0.1')&&!source.includes('localhost'))
 throw Error('CI seed may run only against local disposable PostgreSQL');
const client=new pg.Client({connectionString:source});
await client.connect();
try{
 const ddl=await readFile('src/schema.sql','utf8');
 await client.query(ddl);
 const {rows:[catalog]}=await client.query(
  "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')::int AS tables,"+
  "(SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public')::int AS columns");
 if(catalog.tables!==48||catalog.columns!==316)
  throw Error('Synthetic source schema does not match reviewed 48-table/316-column baseline: '+JSON.stringify(catalog));
 const role=await client.query(
  "INSERT INTO roles(name,farbe,sensibel) VALUES('CI Administrator','#112233',true) RETURNING name");
 await client.query("INSERT INTO role_perms(rolle,modul,stufe) VALUES('CI Administrator','pers',2)");
 const user=await client.query(
  "INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern)"+
  " VALUES('49','CI Sample','CI Administrator','$2b$12$only-a-synthetic-ci-hash-not-for-login',false) RETURNING id");
 const userId=user.rows[0].id;
 await client.query("INSERT INTO sessions(token,user_id,zweck,ablauf) VALUES('ci-session-never-migrate', $1,'voll',now()+INTERVAL '12 hours')",[userId]);
 await client.query(
  "INSERT INTO personal(personalnummer,vorname,nachname,status,dienstgrad,eintrittsdatum,arbeitsvertrag_url)"+
  " VALUES(49,'Sample','Record','Aktiv','Polizeimeisteranwärter',DATE '2025-01-02','https://example.test/ci-fixture')");
 await client.query(
  "INSERT INTO checklisten(name,aufgaben,sortierung) VALUES('CI portable checklist',$1::jsonb,0)",
  [JSON.stringify([{t:'CI task',u:'https://example.test/test'}])]);
 await client.query(
  "INSERT INTO checklisten_status(name,punkt,erledigt) VALUES('CI portable checklist',0,true)");
 await client.query(
  "INSERT INTO routine(personalnummer,tage,personen,sortierung) VALUES(49,$1::jsonb,$2::jsonb,0)",[
   JSON.stringify(['10.11.2026']),
   JSON.stringify([{nr:49,vorname:'Sample',nachname:'Record',abgemeldet:false,anwesend:[true]}])
  ]);
 await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,'CI synthetic source event','add')",[userId]);
 const {rows:[rows]}=await client.query("SELECT COUNT(*)::int AS sessions FROM sessions");
 if(rows.sessions!==1)throw Error('Synthetic session was not seeded');
 console.log('CI PostgreSQL fixture created: 48 tables, 316 columns, roles, sessions, personnel, JSON and audit rows');
}finally{await client.end();}
