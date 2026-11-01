/* MySQL-Migration, Phase 1: PostgreSQL-Struktur nur lesend untersuchen.
   Schreibt ein MySQL-8.0.13+-DDL als Entwurf, keine Personal-/Passwortdaten.
   PRODUKTIV NICHT AUSFUEHREN: PostgreSQL-Trigger und Backend-SQL fehlen noch.
   SOURCE_DATABASE_URL=... node scripts/mysql/prepare.mjs
*/
import pg from 'pg';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const url=process.env.SOURCE_DATABASE_URL;
if(!url)throw Error('SOURCE_DATABASE_URL ist erforderlich.');
const db=new pg.Pool({connectionString:url,max:2,ssl:/render\.com|sslmode=require/.test(url)?{rejectUnauthorized:false}:false});
const out=path.resolve('migration-output');
const quote=n=>{
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n))throw Error('Ungültiger Bezeichner '+n);
 return String.fromCharCode(96)+n+String.fromCharCode(96);
};
const literal=s=>"'"+String(s).replace(/'/g,"''")+"'";
const actions={a:'RESTRICT',r:'RESTRICT',c:'CASCADE',n:'SET NULL'};
const type=(c,indexed)=>{
 const raw=c.udt_name;
 if(raw==='text')return indexed?'VARCHAR(191)':'LONGTEXT';
 if(raw==='varchar')return 'VARCHAR('+Number(c.character_maximum_length||255)+')';
 if(raw==='int2')return 'SMALLINT';
 if(raw==='int4')return 'INT';
 if(raw==='int8')return 'BIGINT';
 if(raw==='bool')return 'TINYINT(1)';
 if(raw==='jsonb'||raw==='json')return 'JSON';
 if(raw==='date')return 'DATE';
 if(raw==='timestamptz'||raw==='timestamp')return 'DATETIME(6)';
 if(raw==='numeric')return 'DECIMAL('+Number(c.numeric_precision||30)+','+Number(c.numeric_scale||0)+')';
 if(raw==='uuid')return 'CHAR(36)';
 if(raw==='bytea')return 'LONGBLOB';
 throw Error('Unbekannter Spaltentyp '+c.table_name+'.'+c.column_name+' '+raw);
};
const def=c=>{
 const d=c.column_default;
 if(!d)return '';
 if(/^nextval\(/.test(d))return ' AUTO_INCREMENT';
 if(d==='now()')return ' DEFAULT CURRENT_TIMESTAMP(6)';
 if(d==='CURRENT_DATE')return ' DEFAULT (CURRENT_DATE)';
 if(d==='true'||d==='false')return ' DEFAULT '+(d==='true'?'1':'0');
 if(/^-?\d+$/.test(d))return ' DEFAULT '+d;
 const match=/^'((?:[^']|'')*)'::(text|jsonb|json)$/.exec(d);
 if(match){const x=literal(match[1].replace(/''/g,"'"));return ' DEFAULT '+(match[2]==='text'?x:'('+x+')');}
 throw Error('Standardwert noch nicht übersetzbar: '+c.table_name+'.'+c.column_name+' '+d);
};
let client;
try{
 client=await db.connect();
 await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const cols=(await client.query(
  "SELECT c.table_name,c.column_name,c.udt_name,c.is_nullable,c.column_default,c.character_maximum_length,c.numeric_precision,c.numeric_scale,c.ordinal_position"+
  " FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'"+
  " WHERE c.table_schema='public' ORDER BY c.table_name,c.ordinal_position")).rows;
 const keys=(await client.query(
  "SELECT cl.relname table_name,con.conname name,con.contype kind,"+
  " ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY u(n,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.n ORDER BY u.ord) columns"+
  " FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid WHERE con.connamespace='public'::regnamespace AND con.contype IN ('p','u')")).rows;
 const fks=(await client.query(
  "SELECT con.conname name,cl.relname table_name,parent.relname ref_table,con.confdeltype on_delete,con.confupdtype on_update,"+
  " ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY u(n,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.n ORDER BY u.ord) columns,"+
  " ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY u(n,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=u.n ORDER BY u.ord) ref_columns"+
  " FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_class parent ON parent.oid=con.confrelid"+
  " WHERE con.connamespace='public'::regnamespace AND con.contype='f'")).rows;
 const indexes=(await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
 const checks=(await client.query(
  "SELECT cl.relname table_name,con.conname name,pg_get_constraintdef(con.oid) definition FROM pg_constraint con"+
  " JOIN pg_class cl ON cl.oid=con.conrelid WHERE con.connamespace='public'::regnamespace AND con.contype='c'")).rows;
 const tables=[...new Set(cols.map(c=>c.table_name))].sort();
 if(tables.length<40)throw Error('Sicherheitsabbruch: zu wenige Quelltabellen ('+tables.length+').');
 const keycols=new Set();
 keys.forEach(k=>k.columns.forEach(n=>keycols.add(k.table_name+'.'+n)));
 fks.forEach(k=>{k.columns.forEach(n=>keycols.add(k.table_name+'.'+n));k.ref_columns.forEach(n=>keycols.add(k.ref_table+'.'+n));});
 const ddl=[
 '-- IDV MySQL 8.0.13+ schema draft (NOT production-ready).',
 '-- Never execute against an existing populated database.',
 '-- Triggers, CHECK constraints and partial indexes require manual rewrite.',
 "SET NAMES utf8mb4;",
 "SET time_zone = '+00:00';",
 'SET FOREIGN_KEY_CHECKS = 0;',''
 ];
 for(const table of tables){
  const lines=cols.filter(c=>c.table_name===table).map(c=>
   '  '+quote(c.column_name)+' '+type(c,keycols.has(c.table_name+'.'+c.column_name))+
   (c.is_nullable==='NO'?' NOT NULL':'')+def(c));
  for(const k of keys.filter(k=>k.table_name===table)){
   const fields=k.columns.map(quote).join(', ');
   lines.push('  '+(k.kind==='p'?'PRIMARY KEY ('+fields+')':
      'UNIQUE KEY '+quote(k.name.slice(0,64))+' ('+fields+')'));
  }
  ddl.push('CREATE TABLE '+quote(table)+' (\n'+lines.join(',\n')+
    '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;','');
 }
 const skippedIndexes=[];
 for(const ix of indexes){
  if(keys.some(k=>k.table_name===ix.tablename&&k.name===ix.indexname)||/CREATE UNIQUE INDEX/.test(ix.indexdef))continue;
  if(ix.indexdef.includes(' WHERE ')){skippedIndexes.push(ix.indexname);continue;}
  const m=/USING btree \((.+)\)$/.exec(ix.indexdef);
  if(!m){skippedIndexes.push(ix.indexname);continue;}
  const fields=m[1].split(',').map(x=>x.trim().split(/\s+/)[0]);
  if(fields.some(x=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(x))||
     fields.some(x=>cols.some(c=>c.table_name===ix.tablename&&c.column_name===x&&c.udt_name==='text'&&!keycols.has(ix.tablename+'.'+x)))){
    skippedIndexes.push(ix.indexname);continue;
  }
  ddl.push('CREATE INDEX '+quote(ix.indexname.slice(0,64))+' ON '+quote(ix.tablename)+' ('+fields.map(quote).join(', ')+');');
 }
 ddl.push('','-- Apply these foreign keys only AFTER all tables have been copied:');
 for(const fk of fks){
  if(!actions[fk.on_delete]||!actions[fk.on_update])throw Error('FK braucht manuelle Übersetzung: '+fk.name);
  ddl.push('ALTER TABLE '+quote(fk.table_name)+' ADD CONSTRAINT '+quote(fk.name.slice(0,64))+
   ' FOREIGN KEY ('+fk.columns.map(quote).join(', ')+') REFERENCES '+quote(fk.ref_table)+
   ' ('+fk.ref_columns.map(quote).join(', ')+') ON DELETE '+actions[fk.on_delete]+
   ' ON UPDATE '+actions[fk.on_update]+';');
 }
 ddl.push('SET FOREIGN_KEY_CHECKS = 1;');
 const report={tables:tables.length,columns:cols.length,keys:keys.length,foreignKeys:fks.length,
   omittedIndexes:skippedIndexes,checkConstraints:checks,
   blockingWork:['Rewrite PostgreSQL-specific SQL queries and parameters in the backend',
   'Port PostgreSQL audit/snapshot/group triggers to MySQL',
   'Rebuild partial unique constraints and optimistic lock/revision rules',
   'Implement direct encrypted transfer, verify per-table row counts and hashes',
   'Verify all application flows before production cutover']};
 await mkdir(out,{recursive:true});
 await Promise.all([
  writeFile(path.join(out,'mysql-schema.sql'),ddl.join('\n')+'\n',{mode:0o600}),
  writeFile(path.join(out,'mysql-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
 ]);
 await client.query('COMMIT');
 console.log('Vorbereitung fertig:',tables.length,'Tabellen;',fks.length,'Fremdschlüssel.');
 console.log('Nur DDL-Entwurf. KEINE Quelldaten verändert. PostgreSQL bleibt produktiv.');
}catch(e){
 if(client)await client.query('ROLLBACK').catch(()=>{});
 console.error('MySQL-Vorbereitung abgebrochen:',e.message);
 process.exitCode=1;
}finally{if(client)client.release();await db.end();}
