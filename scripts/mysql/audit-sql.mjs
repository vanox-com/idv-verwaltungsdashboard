/* Inventar der PostgreSQL-spezifischen Backend-SQL-Stellen.
   Rein lesend: keine Datenbankverbindung, keine Live-Änderungen. */
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const roots=['src'];
const tests=[
 ['pg_parameter',/\$\d+\b/g],
 ['pg_cast',/::(?:jsonb|text|int|integer|boolean|date|timestamp|timestamptz|numeric|uuid|regclass|regnamespace|smallint|bigint)/gi],
 ['pg_on_conflict',/\bON\s+CONFLICT\b/gi],
 ['pg_returning',/\bRETURNING\b/gi],
 ['pg_jsonb',/\bjsonb(?:_[a-z]+)?\b/gi],
 ['pg_xmin',/\bxmin\b/gi],
 ['pg_ilike',/\bILIKE\b/gi],
 ['pg_any_array',/\bANY\s*\(|\bARRAY\s*\[/gi],
 ['pg_date',/\bto_char\s*\(|\bgenerate_series\s*\(|\bdate_trunc\s*\(/gi],
 ['pg_regex',/(\s~\*?\s|\s!~\*?\s)/g],
 ['pg_unnest',/\bunnest\s*\(/gi],
 ['pg_only',/\bFOR\s+SHARE\b/gi]
];
const entries=[];
async function scan(dir){
 for(const d of await readdir(dir,{withFileTypes:true})){
  const full=path.join(dir,d.name);
  if(d.isDirectory()){await scan(full);continue;}
  if(!/\.(js|mjs|sql)$/i.test(d.name)||d.name==='mysql-schema.sql')continue;
  const text=await readFile(full,'utf8');
  const lines=text.split('\n');
  for(let i=0;i<lines.length;i++){
   const line=lines[i];
   const hits=tests.filter(([,rx])=>{rx.lastIndex=0;return rx.test(line)}).map(([name])=>name);
   if(hits.length)entries.push({file:full.replaceAll('\\','/'),line:i+1,patterns:hits});
  }
 }
}
for(const root of roots)await scan(root);
const counts={};
for(const e of entries)for(const p of e.patterns)counts[p]=(counts[p]||0)+1;
const report={status:'Backend is NOT MySQL compatible',scannedRoots:roots,linesNeedingReview:entries.length,
 patterns:counts,locations:entries};
await mkdir('migration-output',{recursive:true});
await writeFile('migration-output/mysql-sql-audit.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log('SQL-Kompatibilitätsanalyse: '+entries.length+' Zeilen zur Prüfung.');
console.log(JSON.stringify(counts,null,2));
console.log('Bericht: migration-output/mysql-sql-audit.json; nur Quellcode untersucht.');
