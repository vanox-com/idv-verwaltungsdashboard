import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const documentApi=readFileSync(new URL('../src/dokumentApi.js',import.meta.url),'utf8');
const start=html.indexOf('function disAkte(nr){');
const end=html.indexOf('\nfunction disFiltern(){',start);
assert.ok(start>=0&&end>start,'Disziplinarakten-Renderer not found');
const source=html.slice(start,end);
const case1={
 personal:[{personalnummer:40,vorname:'Joel',nachname:'Summer',dienstgrad:'Polizeimeister',status:'Inaktiv'}],
 disziplin:[{nr:40,slots:[null,{done:true,d:'2026-11-09',t:'Abwesenheit ohne Abmeldung',u:'https://docs.google.com/document/d/valid/edit'}],
  massnahmen:[],bemerkung:'',_revision:'8'}]
};
function make(data){
 const fn=new Function('D','can','esc','fd','rangMitAbzeichen',
  "const DIS_TITEL=['Mündliche Verwarnung','1. Abmahnung','2. Abmahnung','3. Abmahnung','Sonstige Maßnahme 1','Sonstige Maßnahme 2'];\n"+
  source+'\nreturn {disAkte,vDis};');
 return fn(data,()=>true,x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),
  x=>x,String);
}
test('verkürzter Disziplinar-Datensatz von DN 40 zeigt die rote 1. Abmahnung',()=>{
 const {disAkte,vDis}=make(case1);
 const slots=disAkte(40).slots;
 assert.equal(slots.length,6);
 assert.equal(slots[0],null);
 assert.deepEqual(slots[1],case1.disziplin[0].slots[1]);
 assert.equal(slots[2],null);
 const view=vDis();
 assert.match(view,/<span class="tag bad">1\. Abmahnung<\/span>/);
 assert.match(view,/Joel Summer/);
 assert.match(view,/2026-11-09/);
 assert.match(view,/https:\/\/docs\.google\.com\/document\/d\/valid\/edit/);
});
test('volle sechs Slots bleiben intakt',()=>{
 const full=[null,{done:true,t:'Erste',d:'2026-11-01',u:''},
   {done:true,t:'Zweite',d:'2026-11-02',u:''},null,null,null];
 const {disAkte}=make({personal:[],disziplin:[{nr:40,slots:full,massnahmen:[]}]});
 assert.deepEqual(disAkte(40).slots,full);
});
test('Leere moderne Slots nutzen historische Importdaten',()=>{
 const {disAkte}=make({personal:[],disziplin:[{nr:40,slots:[],massnahmen:[
  {spalte:3,wert:'true'},{spalte:4,wert:'Alt-Abmahnung'},{spalte:5,wert:'2026-11-01'}]}]});
 const slots=disAkte(40).slots;
 assert.equal(slots.length,6);
 assert.equal(slots[1].done,true);
 assert.equal(slots[1].t,'Alt-Abmahnung');
});
test('Dokumentgenerator füllt beim Erstellen alle sechs Slots, ohne die vorhandene Abmahnung zu verlieren',()=>{
 assert.match(documentApi,/while\(slots\.length<6\)slots\.push\(null\)/);
 assert.match(documentApi,/slots\[index\]=\{done:true,t:f\.sachverhalt\.slice\(0,1500\),u:link,d:f\.datum\}/);
 assert.match(documentApi,/if\(slots\[index\]\?\.u\)throw fail\(409/);
});
