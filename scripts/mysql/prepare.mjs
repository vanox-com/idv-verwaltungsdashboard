/* IDV/MySQL8: read-only compatibility preflight against the current PostgreSQL
 * catalog. Copies the reviewed 47-table MySQL 8 schema into migration-output
 * only if it still matches the PostgreSQL catalog. Never exports user data.
 *
 * SOURCE_DATABASE_URL=... npm run mysql:prepare
 */
import pg from 'pg';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const url=process.env.SOURCE_DATABASE_URL;
if(!url)throw Error('SOURCE_DATABASE_URL erforderlich. Niemals DB-Zugangsdaten in Git speichern.');
const db=new pg.Pool({connectionString:url,max:1,ssl:/render\.com|sslmode=require/.test(url)?{rejectUnauthorized:false}:false});
const dir=path.dirname(fileURLToPath(import.meta.url));
let conn;
try{
 conn=await db.connect();
 await conn.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const [tableResult,columnResult,fkResult,checkResult]=await Promise.all([
  conn.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"),
  conn.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name"),
  conn.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'"),
  conn.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c'")
 ]);
 const ddl=await readFile(path.join(dir,'mysql8-schema.sql'),'utf8');
 const expected=[...ddl.matchAll(/^CREATE TABLE \x60([A-Za-z_][A-Za-z0-9_]*)\x60 \(/gm)].map(x=>x[1]).sort();
 const current=tableResult.rows.map(x=>x.table_name).sort();
 const unchanged=JSON.stringify(expected)===JSON.stringify(current);
 const relationships=(ddl.match(/\bFOREIGN KEY \(/g)||[]).length;
 const checks=(ddl.match(/ ADD CONSTRAINT \x60[^\x60]+\x60 CHECK \(/g)||[]).length;
 const report={
  source:'PostgreSQL',destination:'MySQL 8.0.16+ (phpMyAdmin)',
  tables:current.length,columns:columnResult.rows.length,
  foreignKeys:fkResult.rowCount,checks:checkResult.rowCount,
  reviewedSchemaTables:expected.length,reviewedSchemaForeignKeys:relationships,
  reviewedSchemaChecks:checks,tableNamesMatch:unchanged,
  applicationReady:false,
  pending:[
   'Rewrite all PostgreSQL backend queries and database driver usage',
   'Port PostgreSQL audit, snapshot and group triggers',
   'Replace xmin revision handling with MySQL transaction revisions',
   'Run real MySQL 8 integration/security tests before cutover'
  ]
 };
 if(!unchanged||relationships!==fkResult.rowCount||checks!==checkResult.rowCount)
  throw Error('Datenbankstruktur weicht vom MySQL8-Schema ab. Baseline zuerst erneuern.');
 const target=path.resolve('migration-output');
 await mkdir(target,{recursive:true,mode:0o700});
 await Promise.all([
  writeFile(path.join(target,'mysql8-schema.sql'),ddl,{mode:0o600}),
  writeFile(path.join(target,'mysql8-preflight.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
 ]);
 await conn.query('COMMIT');
 console.log('MySQL8 Schema-Preflight erfolgreich:',report.tables,'Tabellen,',report.foreignKeys,'Fremdschlüssel.');
 console.log('Erstellt: migration-output/mysql8-schema.sql und mysql8-preflight.json.');
 console.log('Achtung: Backend noch nicht MySQL-kompatibel. Keine Live-Umschaltung.');
}catch(e){
 if(conn)await conn.query('ROLLBACK').catch(()=>{});
 console.error('Preflight fehlgeschlagen:',e.message);
 process.exitCode=1;
}finally{if(conn)conn.release();await db.end();}
