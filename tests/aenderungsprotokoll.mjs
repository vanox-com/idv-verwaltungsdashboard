import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync(new URL('../public/assets/aenderungsprotokoll.js',import.meta.url),'utf8');
const sandbox={window:{}};vm.runInNewContext(js,sandbox);
const {normalize}=sandbox.window.IDVProtokoll;
const p=normalize({zeit:'2026-11-27 12:00:00',personalnummer:34,benutzer:'A',aenderungen:{status:{alt:'Aktiv',neu:'Inaktiv'}}},'personal');
assert.equal(p.title,'Dienstnummer 34');assert.equal(p.time,'13:00:00');assert.equal(p.changes[0].neu,'Inaktiv');
assert.equal(normalize({aktion:'<script>test</script>',art:'edit'},'system').title,'<script>test</script>');
assert.equal(normalize({bereich:'personal',vorgang:'UPDATE',schluessel:'34',details:[{feld:'status',alt:'Aktiv',neu:'Inaktiv'}]},'vergleich').category,'Personal');
for(const name of ['ReadOnly','AktenFeatures']){const php=fs.readFileSync(new URL('../php/'+name+'.php',import.meta.url),'utf8');assert.match(php,/LOCATE\(LOWER\(\?\),LOWER\(/);assert.match(php,/bindValue\(\$index\+\+,\$(?:param|search),/);}
console.log('Protocol normalization and search binding OK');

assert.equal(p.summary,'Status: Aktiv → Inaktiv');
assert.equal(p.day,'27.11.2026');
const multiple=normalize({personalnummer:12,aenderungen:{dienstgrad:{alt:'PM',neu:'POM'},bemerkung:{alt:'a'.repeat(90),neu:'b'},werte:{alt:{x:1},neu:{x:2}}}},'personal');
assert.equal(multiple.summary,'Dienstgrad: PM → POM · Bemerkung geändert · +1 weitere Änderungen');
assert.equal(normalize({bereich:'personal',vorgang:'UPDATE',schluessel:'34',personalnummer:34},'vergleich').title,'Personal · Geändert · Dienstnummer 34');
assert.equal(normalize({art:'delete',aktion:'Eintrag entfernt'},'system').category,'Gelöscht');
class Node{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.classList={toggle(){}};}append(...n){this.children.push(...n);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,v){this.events[k]=v;}}
const doc={createElement:t=>new Node(t)};const ui={window:{},document:doc};vm.runInNewContext(js,ui);
const table=ui.window.IDVProtokoll.renderTable([p]);const all=x=>[x,...x.children.flatMap(all)],nodes=all(table);
const detail=nodes.find(x=>x.className==='pl-detail-row'),button=nodes.find(x=>x.className==='pl-detail-button');
assert.equal(detail.hidden,true);assert.equal(button.textContent,'Ansehen');button.events.click();assert.equal(detail.hidden,false);assert.equal(button.attrs['aria-expanded'],'true');button.events.click();assert.equal(detail.hidden,true);
console.log('Plain language descriptions and expandable table OK');

const {mergedPage}=sandbox.window.IDVProtokoll;
const sources=['/personal-audit','/log','/aenderungsvergleich'];
const journal=Object.fromEntries(sources.map((s,i)=>[s,Array.from({length:i===0?215:i===1?101:4},(_,j)=>({zeit:new Date(Date.UTC(2026,10,27,12,0,0)-1000*(j*3+i)).toISOString(),personalnummer:j,aktion:'system '+j,bereich:'personal',schluessel:j}))]));
const readPage=async(s,n)=>journal[s].slice((n-1)*100,n*100+1);
let pos=[0,0,0],total=0,allRows=[],more=true;
while(more){const page=await mergedPage(readPage,pos);allRows.push(...page.rows);total+=page.rows.length;pos=page.positions;more=page.more;}
assert.equal(total,320);assert.equal(Array.from(pos).join(','),'215,101,4');
assert.equal(allRows.slice(0,3).map(r=>r.kind).join(','),'personal,system,vergleich');
for(let i=1;i<allRows.length;i++)assert.ok(allRows[i-1].time>=allRows[i].time);
assert.equal((await mergedPage(async()=>[],[0,0,0])).more,false);
for(const name of ['ReadOnly','AktenFeatures']){const php=fs.readFileSync(new URL('../php/'+name+'.php',import.meta.url),'utf8');assert.ok(php.includes("['aktuell','archiv','alle']"));assert.ok(php.includes("$view!==null&&$view!=='alle'"));}
console.log('Combined protocol pagination and unfiltered date selection OK');
