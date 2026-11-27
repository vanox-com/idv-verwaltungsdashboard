import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync(new URL('../public/assets/personal-statistik-diagramme.js',import.meta.url),'utf8');
const sandbox={window:{}};vm.runInNewContext(js,sandbox);
const {model}=sandbox.window.IDVPersonalDiagramme;
const data={gruppen:[{gruppe:'A',status:'Aktiv',beschaeftigungsart:'Hauptberuf',anzahl:3},{gruppe:'A',status:'Inaktiv',beschaeftigungsart:'Nebenberuf',anzahl:1},{gruppe:'B',status:'Aktiv',beschaeftigungsart:'Hauptberuf',anzahl:2}]};
const e={personalbewegung:[{monat:'2026-07',zugang:8,abgang:0},{monat:'2026-08',zugang:1,abgang:3},{monat:'2026-09',zugang:0,abgang:0},{monat:'2026-10',zugang:4,abgang:1}],befoerderungen:[{am:'2026-07-02',rang:'PMA',neu_rang:'PM'},{am:'2026-10-01',rang:'PMA',neu_rang:'PM'}],dienstzeiten:[0,29,30,730,null],kuendigungsdienstzeit:{verteilung:[{anzahl:2},{anzahl:1},{anzahl:0},{anzahl:0},{anzahl:0},{anzahl:1}]},dienstgrade:[{rang:'PM',anzahl:4},{rang:'POM',anzahl:2}]};
const m=model(data,e,3);
assert.equal(m.total,6);assert.equal(m.inCount,5);assert.equal(m.outCount,4);assert.equal(m.befCount,1);assert.equal(m.monthly.length,3);assert.equal(m.monthly[0].saldo,-2);assert.equal(m.monthly[2].kumuliert,1);
assert.equal(m.employment[0].n,5);assert.equal(m.stateMatrix[0].total,4);assert.equal(m.activeN,4);assert.equal(m.exitN,4);assert.equal(m.earlyPct,50);assert.equal(m.tenure[0].aktivPct,50);assert.equal(m.tenure[5].aktiv,1);assert.equal(m.transitions[0].n,1);
assert.equal(model(data,e,12).befCount,2);
const empty=model({},{});assert.equal(empty.total,0);assert.equal(empty.earlyPct,null);assert.equal(empty.tenure[0].aktivPct,null);
console.log('Personnel chart aggregates OK');
// Smoke test the actual rendering with a minimal DOM implementation.
class FakeNode{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.style={};this.textContent='';this.classList={add:()=>{},remove:()=>{},contains:()=>false};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=String(v);}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,v){this.events[k]=v;}
 getBoundingClientRect(){return {left:20,right:40,top:60,bottom:80};}
 remove(){this.removed=true;}
 contains(x){return this===x||this.children.some(c=>c?.contains?.(x));}
}
const doc={createElement:t=>new FakeNode(t),createElementNS:(_,t)=>new FakeNode(t),createTextNode:t=>new FakeNode('text'),head:new FakeNode('head'),body:new FakeNode('body'),addEventListener(){}};
const ui={window:{innerWidth:1000,innerHeight:800,addEventListener(){}},document:doc};vm.runInNewContext(js,ui);
const host=new FakeNode('div');ui.window.IDVPersonalDiagramme.mount(host,data,e);
const all=(node)=>[node,...node.children.flatMap(all)];
const nodes=all(host);
const bar=nodes.find(x=>x.tag==='g'&&x.events.pointerenter);
assert.ok(bar,'interactive SVG bar exists');
bar.events.pointerenter({clientX:40,clientY:100});assert.ok(doc.body.children.some(x=>x.attrs.role==='tooltip'),'hover shows tooltip');
bar.events.click();assert.equal(bar.attrs['aria-describedby'],'idv-personal-chart-tooltip');
bar.events.keydown({key:'Escape'});assert.equal(bar.attrs['aria-describedby'],undefined);
const button=nodes.find(x=>x.tag==='button'&&x.attrs['aria-pressed']==='true');
assert.ok(button,'series legend toggle exists');button.events.click();assert.equal(button.attrs['aria-pressed'],'false');button.events.click();assert.equal(button.attrs['aria-pressed'],'true');
assert.ok(nodes.some(x=>x.tag==='circle'&&x.events.pointerenter),'interactive ring exists');
console.log('Personnel chart interaction smoke tests OK');
