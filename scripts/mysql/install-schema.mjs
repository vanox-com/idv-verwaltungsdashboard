/**
 * One-time verified MySQL8 schema installer for an EMPTY destination database.
 * Creates structure only, never reads or writes PostgreSQL or user data.
 *
 * MYSQL_DESTINATION_URL=mysql://... MYSQL_SCHEMA_CONFIRM=EMPTY_NEW_DATABASE
 * node scripts/mysql/install-schema.mjs
 *
 * MySQL DDL is not transactionally reversible. If a statement fails, discard
 * the partial empty database and recreate it before retrying.
 */
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

function statements(text){
 const result=[];
 let buffer='',quoted=null,line=false,block=false;
 const backtick=String.fromCharCode(96);
 for(let i=0;i<text.length;i++){
  const ch=text[i],next=text[i+1];
  if(line){if(ch==='\n'){line=false;buffer+='\n';}continue;}
  if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
  if(quoted){
   buffer+=ch;
   if(ch==='\\'&&quoted!==backtick){if(i+1<text.length)buffer+=text[++i];continue;}
   if(ch===quoted){
    if(next===quoted){buffer+=text[++i];}
    else quoted=null;
   }
   continue;
  }
  if(ch==='-'&&next==='-'&&(/\s/.test(text[i+2]||' '))){line=true;i++;continue;}
  if(ch==='#'){line=true;continue;}
  if(ch==='/'&&next==='*'){block=true;i++;continue;}
  if(ch==="'"||ch==='"'||ch===backtick){quoted=ch;buffer+=ch;continue;}
  if(ch===';'){
   if(buffer.trim())result.push(buffer.trim());
   buffer='';
  }else buffer+=ch;
 }
 if(quoted||block)throw Error('Unterminated SQL literal or block comment in reviewed schema');
 if(buffer.trim())throw Error('Unterminated last SQL statement in reviewed schema');
 return result;
}
const url=process.env.MYSQL_DESTINATION_URL;
if(!url||!url.startsWith('mysql://')||process.env.MYSQL_SCHEMA_CONFIRM!=='EMPTY_NEW_DATABASE')
 throw Error('MYSQL_DESTINATION_URL and MYSQL_SCHEMA_CONFIRM=EMPTY_NEW_DATABASE required.');
const location=new URL(url);
if(!location.hostname||!location.pathname||location.pathname==='/')
 throw Error('MySQL host or database name missing');
const file=path.join(path.dirname(fileURLToPath(import.meta.url)),
 'IDV-MySQL8-phpMyAdmin-SETUP.sql');
const sql=await readFile(file,'utf8');
const commands=statements(sql);
if(commands.length<100)throw Error('Reviewed MySQL setup file appears incomplete');
const sha=createHash('sha256').update(sql).digest('hex');
console.log('IDV schema installer, reviewed SQL SHA-256:',sha);
console.log('SQL commands:',commands.length);
let connection;
try{
 connection=await mysql.createConnection({
  host:location.hostname,port:Number(location.port||3306),
  user:decodeURIComponent(location.username),
  password:decodeURIComponent(location.password),
  database:decodeURIComponent(location.pathname.slice(1)),
  charset:'utf8mb4',timezone:'Z',
  ssl:process.env.MYSQL_SSL==='required'
   ?{rejectUnauthorized:true,minVersion:'TLSv1.2'}:undefined,
  multipleStatements:false
 });
 const [v]=await connection.query('SELECT VERSION() AS version,DATABASE() AS db');
 const version=String(v[0]?.version||'');
 const match=/^(\d+)\.(\d+)\.(\d+)/.exec(version);
 if(!match||Number(match[1])<8||
    (Number(match[1])===8&&Number(match[2])===0&&Number(match[3])<16))
    throw Error('MySQL 8.0.16 or newer required (found '+version+')');
 const [[row]]=await connection.query(
  "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()");
 if(Number(row.n)!==0)throw Error('Target schema is not empty. No DDL executed.');
 const [[extra]]=await connection.query(
  "SELECT (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema=DATABASE())"+
  "+(SELECT COUNT(*) FROM information_schema.events WHERE event_schema=DATABASE())"+
  "+(SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE()) AS n");
 if(Number(extra.n)!==0)throw Error('Target schema has existing routines/events/triggers. No DDL executed.');
 for(let i=0;i<commands.length;i++){
  await connection.query(commands[i]);
  if(i%50===49)console.log('Applied',i+1,'/',commands.length,'schema commands');
 }
 const [[counts]]=await connection.query(
  "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE') AS tables,"+
  "(SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()) AS foreign_keys,"+
  "(SELECT COUNT(*) FROM information_schema.check_constraints WHERE constraint_schema=DATABASE()) AS checks,"+
  "(SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE()) AS triggers");
 const expected={tables:49,foreign_keys:33,checks:14,triggers:35};
 for(const [key,value] of Object.entries(expected))
  if(Number(counts[key])!==value)throw Error('Schema invariant '+key+': expected '+value+', got '+counts[key]);
 const [[populated]]=await connection.query(
  "SELECT SUM(TABLE_ROWS) AS approx FROM information_schema.tables WHERE table_schema=DATABASE()");
 console.log('Setup verified:',JSON.stringify(expected));
 console.log('Only the schema was installed; source data still needs a separate checked transfer.');
}catch(err){
 console.error('Schema install stopped:',err.message);
 console.error('MySQL DDL is not reversible; if partial, recreate a NEW EMPTY destination database.');
 process.exitCode=1;
}finally{
 if(connection){
  await connection.query('SET FOREIGN_KEY_CHECKS=1').catch(()=>{});
  await connection.end().catch(()=>{});
 }
}
