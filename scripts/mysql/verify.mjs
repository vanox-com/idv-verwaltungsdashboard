/* IDV MySQL 8 cutover audit: READ-ONLY source vs target row-by-row comparison.
 * Prints only record counts and mismatch counts, NEVER personal data.
 *
 * SOURCE_DATABASE_URL=postgresql://... MYSQL_DESTINATION_URL=mysql://...
 * npm run mysql:verify
 */
import pg from 'pg';
import mysql from 'mysql2/promise';
import {createHash} from 'node:crypto';

const sourceUrl=process.env.SOURCE_DATABASE_URL;
const targetUrl=process.env.MYSQL_DESTINATION_URL;
if(!sourceUrl||!targetUrl||!targetUrl.startsWith('mysql://'))
 throw Error('PostgreSQL SOURCE_DATABASE_URL und MySQL MYSQL_DESTINATION_URL erforderlich.');
const u=new URL(targetUrl);
if(!u.hostname||!u.pathname||u.pathname==='/')throw Error('MySQL-Zieldatenbank fehlt');
const pgPool=new pg.Pool({connectionString:sourceUrl,max:1,
 ssl:/render\.com|sslmode=require/.test(sourceUrl)?{rejectUnauthorized:false}:false});
const quote=x=>{
 if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(x))throw Error('Ungültiger Feldname '+x);
 return String.fromCharCode(96)+x+String.fromCharCode(96);
};
const pgQuote=x=>'"'+x.replace(/"/g,'""')+'"';
function jsonCanonical(v){
 if(Array.isArray(v))return v.map(jsonCanonical);
 if(v&&typeof v==='object'&&!(v instanceof Date))
  return Object.fromEntries(Object.keys(v).sort().map(k=>[k,jsonCanonical(v[k])]));
 return v;
}
function normalize(v,type){
 if(v==null)return null;
 if(type==='jsonb'||type==='json'){
  const obj=typeof v==='string'?JSON.parse(v):v;
  return jsonCanonical(obj);
 }
 if(type==='date')return v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
 if(type.includes('timestamp')){
  if(v instanceof Date)return v.toISOString();
  const str=String(v).replace(' ','T').replace(/Z?$/,'Z');
  const d=new Date(str);
  if(Number.isNaN(d.getTime()))throw Error('Ungültiger Zeitstempel im Vergleich');
  return d.toISOString();
 }
 if(type==='boolean')return v===true||v===1||v==='1';
 if(['bigint','numeric','integer','smallint'].includes(type))return String(v);
 if(Buffer.isBuffer(v))return v.toString('hex');
 return String(v);
}
function rowDigest(rows,cols){
 const h=createHash('sha256');
 for(const row of rows){
  const vals=cols.map(c=>normalize(row[c.column_name],c.data_type));
  h.update(JSON.stringify(vals)+'\n','utf8');
 }
 return h.digest('hex');
}
let pgConn,myConn;
try{
 pgConn=await pgPool.connect();
 await pgConn.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await pgConn.query("SET LOCAL TIME ZONE 'UTC'");
 myConn=await mysql.createConnection({
  host:u.hostname,port:Number(u.port||3306),user:decodeURIComponent(u.username),
  password:decodeURIComponent(u.password),database:decodeURIComponent(u.pathname.slice(1)),
  dateStrings:true,supportBigNumbers:true,bigNumberStrings:true,timezone:'Z',
  ssl:process.env.MYSQL_SSL==='required'?{rejectUnauthorized:true,minVersion:'TLSv1.2'}:undefined
 });
 await myConn.query('SET time_zone = \'+00:00\'');
 await myConn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 await myConn.query('START TRANSACTION READ ONLY');
 const cols=(await pgConn.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const tables=[...new Set(cols.map(c=>c.table_name))].sort().filter(t=>t!=='sessions');
 if(tables.length<40)throw Error('Unvollständiger PostgreSQL-Tabellenbestand');
 const pk=(await pgConn.query(
  "SELECT cl.relname table_name,ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY u(n,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=u.n ORDER BY u.ord) columns"+
  " FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid WHERE con.connamespace='public'::regnamespace AND con.contype='p'")).rows;
 const keys=new Map(pk.map(x=>[x.table_name,x.columns]));
 let failed=0,validated=0,total=0;
 for(const t of tables){
  const fields=cols.filter(c=>c.table_name===t);
  const names=fields.map(c=>c.column_name);
  const order=keys.get(t);
  if(!order?.length)throw Error('Kein Primärschlüssel vorhanden in '+t);
  const queryPg='SELECT '+names.map(pgQuote).join(',')+' FROM '+pgQuote(t)+
   ' ORDER BY '+order.map(pgQuote).join(',');
  const queryMy='SELECT '+names.map(quote).join(',')+' FROM '+quote(t)+
   ' ORDER BY '+order.map(quote).join(',');
  const {rows:sourceRows}=await pgConn.query(queryPg);
  const [targetRows]=await myConn.query(queryMy);
  const same=sourceRows.length===targetRows.length&&rowDigest(sourceRows,fields)===rowDigest(targetRows,fields);
  total+=sourceRows.length;
  validated++;
  if(!same){failed++;console.error('ABWEICHUNG:',t,'Quelle',sourceRows.length,'Ziel',targetRows.length);}
  else console.log('OK:',t,sourceRows.length);
 }
 const [sessions]=await myConn.query('SELECT COUNT(*) AS n FROM '+quote('sessions'));
 if(Number(sessions[0].n)!==0){failed++;console.error('ABWEICHUNG: Sessions wurden ins Ziel kopiert');}
 await myConn.rollback();
 await pgConn.query('COMMIT');
 console.log('Verglichen:',validated,'Tabellen,',total,'Zeilen. Abweichungen:',failed);
 if(failed){process.exitCode=1;console.error('MySQL-Datenstand NICHT FREIGEBEN.');}
 else console.log('Datenvergleich bestanden. Hinweis: Backend- und Triggerfunktionalität muss separat getestet werden.');
}catch(err){
 console.error('Verifikation abgebrochen:',err.message);
 process.exitCode=1;
 if(myConn)await myConn.rollback().catch(()=>{});
 if(pgConn)await pgConn.query('ROLLBACK').catch(()=>{});
}finally{if(myConn)await myConn.end().catch(()=>{});if(pgConn)pgConn.release();await pgPool.end();}
