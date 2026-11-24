import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const pages=['public/ausbildung.html','public/ausbildung-status.html'];
for(const file of pages){
 const source=readFileSync(file,'utf8');
 const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 if(scripts.length!==1)throw Error(file+': expected exactly one inline script');
 new Script(scripts[0],{filename:file});
 for(const str of ['<meta name="robots"','/api/ausbildung']) {
  if(!source.includes(str)&&file.endsWith('ausbildung.html'))throw Error(file+': missing '+str);
 }
 console.log(file+': JavaScript parses');
}
