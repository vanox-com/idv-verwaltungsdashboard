/* IDV MySQL 8: export PostgreSQL data into a LOCAL phpMyAdmin SQL import.
 * No secret values or personal data are ever sent to GitHub.
 * This file is sensitive: contains names, personal records and bcrypt hashes.
 * Never email/upload it outside the authorized target administrators.
 *
 * SOURCE_DATABASE_URL=postgresql://... npm run mysql:export
 *
 * Import order into a NEW EMPTY MySQL 8.0.16+ database:
 *   1. scripts/mysql/mysql8-schema.sql
 *   2. migration-output/mysql8-data-PRIVATE.sql
 *
 * IMPORTANT: This only migrates data, not PostgreSQL-specific API queries,
 * automatic audit triggers or the running application. NOT READY FOR CUTOVER.
 */
import pg from 'pg';
import {mkdir,open,rename,rm} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.SOURCE_DATABASE_URL;
if(!url)throw Error('SOURCE_DATABASE_URL erforderlich; PostgreSQL wird nur gelesen.');
const pool=new pg.Pool({connectionString:url,max:1,ssl:/render\.com|sslmode=require/.test(url)?{rejectUnauthorized:false}:false});
const outputDir=path.resolve('migration-output');
const finalPath=path.join(outputDir,'mysql8-data-PRIVATE.sql');
const tempPath=finalPath+'.tmp';
const q=x=>{
 if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(x))throw Error('Ungültiger Tabellen-/Spaltenname: '+x);
 return String.fromCharCode(96)+x+String.fromCharCode(96);
};
const pgQuote=x=>'"'+x.replace(/"/g,'""')+'"';
function hexText(x){
 return 'CONVERT(0x'+Buffer.from(x,'utf8').toString('hex')+' USING utf8mb4)';
}
function valueSql(v,type){
 if(v===null||v===undefined)return 'NULL';
 if(type==='jsonb'||type==='json')return hexText(JSON.stringify(v));
 if(type==='date'){
  const x=v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw Error('Ungültiges Datenbank-Datum');
  return "'"+x+"'";
 }
 if(type==='timestamp with time zone'||type==='timestamp without time zone'){
  const date=v instanceof Date?v.toISOString().replace('T',' ').replace('Z',''):String(v).replace('T',' ').replace('Z','');
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(date))
   throw Error('Ungültiger Zeitstempel im Quelldatensatz');
  return "'"+date+"'";
 }
 if(type==='boolean')return v===true?'1':'0';
 if(['integer','bigint','smallint','numeric','double precision','real'].includes(type)){
  const n=String(v);
  if(!/^-?\d+(?:\.\d+)?$/.test(n))throw Error('Ungültiger Zahlenwert');
  return n;
 }
 if(typeof v==='string')return hexText(v);
 if(Buffer.isBuffer(v))return '0x'+v.toString('hex');
 throw Error('Nicht umgesetzter Datenbanktyp '+type);
}
let conn,handle;
try{
 conn=await pool.connect();
 await conn.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await conn.query("SET LOCAL TIME ZONE 'UTC'");
 const cols=(await conn.query("SELECT table_name,column_name,data_type,ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const tables=[...new Set(cols.map(c=>c.table_name))].sort();
 if(tables.length<40)throw Error('Unerwartet kleine Datenbank; kein Export');
 await mkdir(outputDir,{recursive:true,mode:0o700});
 handle=await open(tempPath,'wx',0o600);
 await handle.writeFile([
  '-- VERTRAULICH! Datenbestand IDV, nur fuer autorisierte MySQL-Admins.',
  '-- MySQL 8.0.16+, import AFTER mysql8-schema.sql into an EMPTY DATABASE.',
  '-- Das Portal darf waehrend des abschliessenden Exports keine neuen Aenderungen erhalten.',
  '-- Sitzungen werden absichtlich nicht exportiert; alle Benutzer melden sich erneut an.',
  "SET NAMES utf8mb4;",
  "SET time_zone = '+00:00';",
  "SET FOREIGN_KEY_CHECKS = 0;",
  "START TRANSACTION;",
  ''
 ].join('\n'));
 let total=0;
 for(const table of tables){
  if(table==='sessions')continue;
  const cs=cols.filter(c=>c.table_name===table);
  const columns=cs.map(c=>c.column_name);
  if(!columns.length)throw Error('Keine Spalten in '+table);
  // Deterministic table snapshot, with no volatile sort or row changes.
  const quoted=pgQuote(table);
  const amount=Number((await conn.query('SELECT COUNT(*)::int AS n FROM '+quoted)).rows[0].n);
  for(let offset=0;offset<amount;offset+=50){
   const {rows}=await conn.query('SELECT * FROM '+quoted+' LIMIT 50 OFFSET $1',[offset]);
   if(!rows.length)throw Error('Unvollstaendige Quellabfrage '+table);
   const tuples=rows.map(row=>'('+cs.map(c=>valueSql(row[c.column_name],c.data_type)).join(', ')+')');
   const statement='INSERT INTO '+q(table)+' ('+columns.map(q).join(', ')+') VALUES\n'+tuples.join(',\n')+';\n';
   await handle.writeFile(statement);
   total+=rows.length;
  }
  console.log('Exportiert:',table,amount,'Zeilen');
 }
 await handle.writeFile([
  '',
  'COMMIT;',
  'SET FOREIGN_KEY_CHECKS = 1;',
  '-- Nach Import alle 48 Tabellen, Zeilenanzahlen und Funktionen pruefen.',
  '-- MySQL-Backend muss separat vollstaendig portiert und getestet werden.',
  ''
 ].join('\n'));
 await handle.close();handle=null;
 await rename(tempPath,finalPath);
 await conn.query('COMMIT');
 console.log('FERTIG: Daten-SQL in migration-output/mysql8-data-PRIVATE.sql');
 console.log('Zeilen exportiert:',total,'(Sessions absichtlich ausgeschlossen).');
 console.log('VERTRAULICH: Datei niemals ins Repository hochladen.');
}catch(err){
 console.error('Abbruch: Export unvollstaendig:',err.message);
 if(handle){await handle.close().catch(()=>{});handle=null;}
 await rm(tempPath,{force:true}).catch(()=>{});
 if(conn)await conn.query('ROLLBACK').catch(()=>{});
 process.exitCode=1;
}finally{if(conn)conn.release();await pool.end();}
