import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {disziplinTitelErgaenzen} from '../src/disziplinTitel.js';

const link='https://docs.google.com/document/d/example/edit';
const grund='Mehrfache Abwesenheit ohne Abmeldung';
const titel='Abmahnung – Beispiel Person';
const original=[
 {nr:40,slots:[null,{done:true,d:'2026-11-09',t:grund,u:link}],bemerkung:''},
 {nr:41,slots:[null,{done:true,d:'2026-11-09',t:'Bisheriger manueller Titel',u:link}]}
];
const docs=[{personalnummer:40,typ:'abmahnung',titel,url:link}];

test('generator document title is attached only by employee number and exact document URL',()=>{
 const enriched=disziplinTitelErgaenzen(original,docs);
 assert.equal(enriched[0].slots[1].titel,titel);
 assert.equal(enriched[0].slots[1].t,grund,'Original-Sachverhalt darf nicht überschrieben werden');
 assert.equal(enriched[1].slots[1].titel,undefined,'Dokumenttitel darf nicht auf andere Person übertragen werden');
 assert.equal(original[0].slots[1].titel,undefined,'Stored data must not be mutated');
 assert.equal(original[0].slots.length,2,'The original shorter slot array must stay intact');
});
test('unrelated types and stale document URLs are ignored',()=>{
 const enriched=disziplinTitelErgaenzen(original,[
  {personalnummer:40,typ:'arbeitsvertrag',titel:'Falsch',url:link},
  {personalnummer:40,typ:'abmahnung',titel:'Falsch',url:link+'2'}
 ]);
 assert.equal(enriched[0].slots[1].titel,undefined);
});
test('management and personnel views display document title and keep the reason',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const begin=html.indexOf('const DIS_TITEL='),end=html.indexOf('\nfunction disFiltern(){',begin);
 assert.ok(begin>=0&&end>begin);
 const source=html.slice(begin,end);
 const D={personal:[{personalnummer:40,vorname:'Beispiel',nachname:'Person',dienstgrad:'Polizeimeister'}],
  disziplin:disziplinTitelErgaenzen(original,docs)};
 const fn=new Function('D','can','esc','fd','rangMitAbzeichen',
  source+'\nreturn {vDis,disEintragText,disAkte};');
 const escape=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const {vDis,disAkte,disEintragText}=fn(D,()=>true,escape,x=>String(x),x=>x);
 const rendered=vDis();
 assert.match(rendered,/Abmahnung – Beispiel Person/);
 assert.match(rendered,/Grund: Mehrfache Abwesenheit ohne Abmeldung/);
 assert.match(rendered,/class="tag bad">1\. Abmahnung/);
 assert.match(rendered,/Dokument<\/a>/);
 assert.match(disEintragText(disAkte(40).slots[1]),/dis-document-title/);
});
test('legacy manual warning labels are not changed',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/if\(!titel\|\|titel===grund\)return esc\(grund\|\|'Keine Bezeichnung hinterlegt'\)/);
});
