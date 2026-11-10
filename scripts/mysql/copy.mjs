/* IDV safe data transfer: PostgreSQL -> an already prepared EMPTY MySQL DB.
 *
 * DO NOT execute against an existing production MySQL DB.
 * Does not modify the PostgreSQL source. Never writes data into Git or files.
 * Sessions are intentionally excluded; everybody logs in again after cutover.
 *
 * Requirements:
 *  SOURCE_DATABASE_URL=postgresql://...
 *  MYSQL_DESTINATION_URL=mysql://user:pass@hostname:3306/dbname
 *  MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE
 *  npm run mysql:copy
 *
 * Importing rows DOES NOT make the MySQL application ready to use:
 * PostgreSQL-specific API SQL and triggers require separate conversion.
 */
import pg from 'pg';
import mysql from 'mysql2/promise';
const pgUrl=process.env.SOURCE_DATABASE_URL;
const mysqlUrl=process.env.MYSQL_DESTINATION_URL;
if(!pgUrl||!mysqlUrl||process.env.MYSQL_COPY_CONFIRM!=='EMPTY_NEW_DATABASE')
 throw Error('Abbruch: SOURCE_DATABASE_URL, MYSQL_DESTINATION_URL und MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE erforderlich.');
if(!mysqlUrl.startsWith('mysql://'))throw Error('MySQL-Ziel muss mysql:// verwenden.');
if(pgUrl===mysqlUrl)throw Error('Quell- und Zieldatenbank dürfen nicht identisch sein.');
const source=new pg.Pool({connectionString:pgUrl,max:2,
 ssl:/render\.com|sslmode=require/.test(pgUrl)?{rejectUnauthorized:false}:false});
const q=n=>{
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n))throw Error('Ungültiger SQL-Bezeichner: '+n);
 return String.fromCharCode(96)+n+String.fromCharCode(96);
};
const quotePg=n=>'"'+n.replace(/"/g,'""')+'"';
function normalize(v,dataType){
 if(v===null||v===undefined)return null;
 if(dataType==='jsonb'||dataType==='json')return JSON.stringify(v);
 if(dataType==='date')return v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
 if(dataType==='timestamp with time zone'||dataType==='timestamp without time zone'){
  if(v instanceof Date){
   // Preserve timestamps with millisecond precision; destination is UTC.
   return v.toISOString().replace('T',' ').replace('Z','');
  }
  return String(v).replace('T',' ').replace('Z','');
 }
 if(typeof v==='boolean')return v?1:0;
 if(Buffer.isBuffer(v))return v;
 return v;
}
let pgClient,mysqlConn;
try{
 pgClient=await source.connect();
 await pgClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await pgClient.query("SET LOCAL TIME ZONE 'UTC'");
 const destination=new URL(mysqlUrl);
 if(!destination.hostname||!destination.pathname||destination.pathname==='/')
  throw Error('MySQL-Hostname und Datenbankname erforderlich');
 mysqlConn=await mysql.createConnection({
  host:destination.hostname,port:Number(destination.port||3306),
  user:decodeURIComponent(destination.username),
  password:decodeURIComponent(destination.password),
  database:decodeURIComponent(destination.pathname.slice(1)),
  timezone:'Z',charset:'utf8mb4',
  ssl:process.env.MYSQL_SSL==='required'?{rejectUnauthorized:true,minVersion:'TLSv1.2'}:undefined,
  multipleStatements:false
 });
 const [version]=await mysqlConn.query('SELECT VERSION() AS v, DATABASE() AS db');
 const serverVersion=String(version[0]?.v||'');
 if(!/^8\.|^9\./.test(serverVersion)||!version[0]?.db)
  throw Error('Nur MySQL 8+/9+ mit eindeutig ausgewählter Datenbank wird unterstützt: '+serverVersion);
 const tables=(await pgClient.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"))
  .rows.map(x=>x.table_name);
 if(tables.length<40)throw Error('Weniger als 40 Quelltabellen: '+tables.length);
 const [existing]=await mysqlConn.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()");
 const targetTables=new Set(existing.map(x=>x.TABLE_NAME||x.table_name));
 if(tables.some(t=>!targetTables.has(t)))
  throw Error('MySQL-Schema ist unvollständig. Zuerst mysql-schema.sql auf einer neuen Datenbank einrichten.');
 const [alreadyPopulated]=await mysqlConn.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'");
 // Count every table, not only expected sources. This prevents accidental writes
 // into shared/previously initialized production databases.
 for(const row of alreadyPopulated){
  const t=row.TABLE_NAME||row.table_name;
  const [count]=await mysqlConn.query('SELECT COUNT(*) AS n FROM '+q(t));
  if(Number(count[0].n)!==0)throw Error('Abbruch: Ziel enthält bereits Daten in '+t+'. Keine Daten überschrieben.');
 }
 const columns=(await pgClient.query(
  "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const types=new Map();
 for(const c of columns){
  if(!types.has(c.table_name))types.set(c.table_name,[]);
  types.get(c.table_name).push(c);
 }
 const primary=(await pgClient.query(
  "SELECT cl.relname AS table_name, ARRAY(SELECT att.attname FROM unnest(con.conkey) WITH ORDINALITY u(n,ord)"+
  " JOIN pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=u.n ORDER BY u.ord) AS cols"+
  " FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid"+
  " WHERE con.connamespace='public'::regnamespace AND con.contype='p'")).rows;
 const pk=new Map(primary.map(x=>[x.table_name,x.cols]));
 const totals={};
 // PostgreSQL remains read-only. MySQL writes form a single InnoDB transaction.
 await mysqlConn.query('SET FOREIGN_KEY_CHECKS=0');
 await mysqlConn.beginTransaction();
 try{
  for(const t of tables){
   if(t==='sessions'){
    const sourceCount=Number((await pgClient.query('SELECT COUNT(*)::int AS n FROM '+quotePg(t))).rows[0].n);
    totals[t]={source:sourceCount,imported:0,forcedRelogin:true};
    console.log('Übersprungen: sessions (Sicherheitsmaßnahme, Anmeldung danach erneut erforderlich)');
    continue;
   }
   const cs=types.get(t);
   if(!cs?.length||!pk.get(t)?.length)throw Error('Tabelle ohne Spalten oder PK: '+t);
   const colnames=cs.map(c=>c.column_name);
   const orderBy=pk.get(t).map(quotePg).join(', ');
   let offset=0;
   for(;;){
    const {rows}=await pgClient.query('SELECT * FROM '+quotePg(t)+' ORDER BY '+orderBy+' LIMIT 100 OFFSET $1',[offset]);
    if(!rows.length)break;
    const holders='('+cs.map(()=>'?').join(',')+')';
    const values=rows.flatMap(row=>cs.map(c=>normalize(row[c.column_name],c.data_type)));
    const sql='INSERT INTO '+q(t)+' ('+colnames.map(q).join(',')+') VALUES '+rows.map(()=>holders).join(',');
    await mysqlConn.query(sql,values);
    offset+=rows.length;
    if(rows.length<100)break;
   }
   const sourceCount=Number((await pgClient.query('SELECT COUNT(*)::int AS n FROM '+quotePg(t))).rows[0].n);
   const [targetCount]=await mysqlConn.query('SELECT COUNT(*) AS n FROM '+q(t));
   const actual=Number(targetCount[0].n);
   if(sourceCount!==actual)throw Error('Datenanzahl abweichend in '+t+': '+sourceCount+' / '+actual);
   totals[t]={source:sourceCount,imported:actual};
   console.log('Übertragen:',t,actual,'Datensätze');
  }
  // Old sessions are never transferred across hosts.
  const [sessionCount]=await mysqlConn.query('SELECT COUNT(*) AS n FROM '+q('sessions'));
  if(Number(sessionCount[0].n)!==0)throw Error('Sessions konnten nicht geleert werden');
  await mysqlConn.commit();
  console.log('DATENKOPIE ABGESCHLOSSEN: '+tables.length+' Tabellen kopiert.');
  console.log('Alte Sessions nicht übernommen. Keine Quelldaten gelöscht.');
  console.log('Warnung: Backend und DB-Trigger sind NOCH NICHT MySQL-kompatibel. NICHT LIVE SCHALTEN.');
  console.log('Anzahl validierter Tabellen:',Object.keys(totals).length);
 }catch(e){await mysqlConn.rollback();throw e;}
} catch(e){
 console.error('Migration gestoppt (Quelldaten unverändert):',e.message);
 process.exitCode=1;
}finally{
 if(mysqlConn){await mysqlConn.query('SET FOREIGN_KEY_CHECKS=1').catch(()=>{});await mysqlConn.end().catch(()=>{});}
 if(pgClient){await pgClient.query('ROLLBACK').catch(()=>{});pgClient.release();}
 await source.end();
}
