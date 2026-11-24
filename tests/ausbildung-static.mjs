import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const pages=['public/index.html','public/ausbildung.html','public/ausbildung-status.html','public/aulk.html'];
for(const file of pages){
 const source=readFileSync(file,'utf8');
 const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 if(!scripts.length)throw Error(file+': no inline script');
 for(const script of scripts)new Script(script,{filename:file});
 console.log(file+': inline JavaScript parses ('+scripts.length+' scripts)');
}
const embedded=readFileSync('public/assets/ausbildung-panel.js','utf8');
new Script(embedded,{filename:'ausbildung-panel.js'});
const index=readFileSync('public/index.html','utf8');
if(!index.includes("window.IDVAusbildung.laden($('#inhalt'))"))
 throw Error('Native Ausbildung module missing from existing dashboard');
if(!index.includes('/assets/ausbildung-panel.js'))
 throw Error('Embedded module script not loaded by police panel');
if(index.includes("location.assign('/ausbildung.html')"))
 throw Error('Training must stay in the normal dashboard without redirects');
if(!embedded.includes('attachShadow')||!embedded.includes('public-material'))
 throw Error('Native isolated module or public document approval control missing');
const old=readFileSync('public/ausbildung.html','utf8');
if(!old.includes('/#ausbildung'))throw Error('Legacy training bookmark must redirect into normal panel');
const aulk=readFileSync('public/aulk.html','utf8');
if(!aulk.includes('/api/ausbildung-oeffentlich'))throw Error('Public AuLK catalog must load only approved materials');
console.log('Ausbildung native integration, no extra admin page and public AuLK catalog: OK');
