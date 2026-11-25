import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const js=readFileSync('public/assets/dashboard-figur.js','utf8');
const escape=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
for(const rolle of ['Administrator','Leitungsdienst','Polizeirat','Ausbildungsleitung','Ausbilder']){
 const doc={addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},hidden:true};
 const win={};
 const ME={id:1,rolle};const D={dashboard:{figur:{person:'tobias-renner',spruch:'<script>alert(1)</script>',nameAnzeigen:true,rolleAnzeigen:true,bubble:'normal',kategorie:'fakten'}}};
 const module=new Function('window','document','esc','ME','D','setInterval','tab',js+'\nreturn window.IDVDashboardFigur;')(win,doc,escape,ME,D,()=>1,'dash');
 const markup=module.render();
 assert.ok(markup.includes('Tobias Renner'));
 assert.ok(markup.includes('figur-sprite--renner'));
 assert.ok(markup.includes('&lt;script&gt;'));
 assert.ok(!markup.includes('<script>'));
 assert.equal(markup.includes('data-jonas-edit'),rolle==='Administrator');
 D.dashboard.figur.nameAnzeigen=false;D.dashboard.figur.rolleAnzeigen=false;
 assert.ok(!module.render().includes('hello-jonas-byline'));
}
console.log('Dashboard figure role visibility and escaping OK');
