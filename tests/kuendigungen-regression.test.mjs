import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const from=html.indexOf('function vKue() {');
const until=html.indexOf('\nasync function kueArchivLaden()',from);
assert.ok(from>=0&&until>from,'Kündigungsübersicht muss aus HTML extrahierbar sein');

const status=[
 ['waffe','Waffen / Information'],['copnet','CopNet'],['emd','EMD'],
 ['ic','IC'],['discord','Discord'],['dienstgegenstaende','Dienstgegenstände'],
 ['anzeige','Anzeige']
];
const records=[
 {id:57,personalnummer:13,vorname:'Justin',nachname:'Baum',eintritt:'2026-02-11',rang:'PMA',grund:'Alt',waffe:'Offen'},
 {id:98,personalnummer:13,vorname:'Leon',nachname:'Huba',eintritt:'2026-06-13',rang:'PM',grund:'Alt',waffe:'Offen'},
 {id:116,personalnummer:13,vorname:'Lucas',nachname:'Koch',eintritt:'2026-09-12',rang:'PM',grund:'Probezeit nicht bestanden',waffe:'Offen'},
 {id:119,personalnummer:55,vorname:'Noah',nachname:'Barfuss',eintritt:'2026-05-15',rang:'PM',grund:'A',waffe:'Offen'},
 {id:120,personalnummer:55,vorname:'Noah',nachname:'Barfuss',eintritt:'2026-05-15',rang:'PM',grund:'B',waffe:'Informiert'}
];
function escape(value){
 return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
   .replaceAll('>','&gt;').replaceAll('"','&quot;');
}
function render(kueRecords=records,{write=true}={}){
 const fn=new Function(
  'D','can','KUE_VIEW_MODE','KUE_ARCHIV_DATEN','KUE_FOKUS_NR',
  'KUE_OFFENE_GRUPPEN','KUE_STATUS','kueWert','kueDokument','esc','fd',
  html.slice(from,until)+'\nreturn vKue();'
 );
 return fn(
  {personal:[],kuendigungen:kueRecords},
  (mod,level=1)=>!(mod==='kue'&&level===2&&!write),
  'aktuell',null,null,new Set(),status,
  (k,field)=>String(k[field]||(field==='anzeige'?'Nein':'Offen')),
  (raw,field)=>'Dokument: '+field,escape,value=>String(value||'')
 );
}
function renderedRows(markup){
 const body=markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
 assert.ok(body,'Kündigungstabelle muss einen tbody besitzen');
 return [...body.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(m=>m[0]);
}
function cells(row){return (row.match(/<td(?:\s|>)/g)||[]).length;}

test('Kündigungsdetail erzeugt alle 8 Tabellenzellen und alle Chips',()=>{
 const markup=render();
 const rows=renderedRows(markup);
 const details=rows.filter(row=>!row.includes('class="kue-group-heading"'));
 assert.equal(details.length,5);
 for(const row of details)assert.equal(cells(row),8,'Fehler: Detailspalten am Namen abgeschnitten');
 assert.equal((markup.match(/data-kue-field="waffe"/g)||[]).length,5);
 for(const field of status.map(s=>s[0]))assert.ok(markup.includes('data-kue-field="'+field+'"'));
 assert.ok(markup.includes('data-kue-docs-edit="116"'));
 assert.ok(markup.includes('data-kue-akte="116"'));
 assert.ok(markup.includes('data-kue-delete="116"'));
 assert.ok(markup.includes('Probezeit nicht bestanden'));
});

test('erneut vergebene Dienstnummer vermischt nicht drei verschiedene Kollegen',()=>{
 const markup=render();
 const rows=renderedRows(markup);
 assert.equal(rows.filter(row=>row.includes('class="kue-group-heading"')).length,1,
   'Nur die beiden echten Mehrfachvorgänge derselben Person dürfen gruppiert sein');
 assert.ok(markup.includes('Justin Baum'));
 assert.ok(markup.includes('Leon Huba'));
 assert.ok(markup.includes('Lucas Koch'));
 assert.ok(!markup.includes('3 Vorgänge'));
 assert.ok(markup.includes('2 Vorgänge'));
});

test('gleiches Namens-/Nummern-Paar mit neuem Eintritt bleibt getrennt',()=>{
 const copy=records.concat({...records[2],id:130,eintritt:'2025-09-12'});
 const markup=render(copy);
 const rows=renderedRows(markup);
 assert.equal(rows.filter(row=>row.includes('class="kue-group-heading"')).length,1);
 assert.equal(rows.filter(row=>!row.includes('class="kue-group-heading"')).length,6);
});

test('Leseberechtigte sehen Daten, aber keine Bearbeiten-/Löschen-Schaltflächen',()=>{
 const markup=render(records,{write:false});
 assert.ok(markup.includes('Lucas Koch'));
 assert.ok(markup.includes('Waffen / Information: Offen'));
 assert.ok(!markup.includes('data-kue-field="waffe"'));
 assert.ok(!markup.includes('data-kue-delete="116"'));
 assert.ok(!markup.includes('data-kue-docs-edit="116"'));
});

test('automatische Erstellung prüft Identität und nicht bloß Dienstnummer',()=>{
 const backend=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(backend,/async function kuendigungenDieserPerson\(client,p\)/);
 assert.match(backend,/const vorhanden=await kuendigungenDieserPerson\(client,p\)/);
 assert.match(backend,/const existing=await kuendigungenDieserPerson\(client,p\)/);
 assert.match(backend,/lower\(btrim\(coalesce\(k\.vorname/);
 assert.match(backend,/k\.eintritt IS NOT DISTINCT FROM \$4::date/);
});

test('60-Tage-Archiv klassifiziert alte Kollegen nicht über neue Statuswechsel',()=>{
 const source=readFileSync(new URL('../src/kuendigungsArchiv.js',import.meta.url),'utf8');
 assert.match(source,/lower\(btrim\(coalesce\(p\.vorname/);
 assert.match(source,/lower\(btrim\(coalesce\(p\.nachname/);
 assert.match(source,/p\.eintrittsdatum IS NOT DISTINCT FROM kuendigungen\.eintritt/);
});
