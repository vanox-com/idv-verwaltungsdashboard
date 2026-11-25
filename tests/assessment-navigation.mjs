import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const nav=fs.readFileSync(new URL('../public/assets/panel-navigation.js',import.meta.url),'utf8');
const {panelCan,MODS,NAV_GRUPPEN}=vm.runInNewContext(nav+';({panelCan,MODS,NAV_GRUPPEN})');
for(const rolle of ['Polizeirat','Leitungsdienst','Administrator']){
 for(const rechte of [{},{assessment:0,ausbildung:0}]){
  const u={rolle,rechte};
  assert.equal(panelCan(u,'assessment',1),true);
  assert.equal(panelCan(u,'assessment',2),true);
  assert.equal(NAV_GRUPPEN.flatMap(g=>g.module).filter(m=>m==='assessment'&&panelCan(u,m)).length,1);
 }
}
for(const rolle of ['Ausbilder','Ausbildungsleitung','Mitarbeiter','Polizeimeister','']){
 assert.equal(panelCan({rolle,rechte:{assessment:2,ausbildung:2}},'assessment'),false);
}
assert.equal(MODS.filter(m=>m[0]==='assessment').length,1);
console.log('Assessment navigation role regression OK');
