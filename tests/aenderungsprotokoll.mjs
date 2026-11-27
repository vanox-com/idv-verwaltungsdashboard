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
