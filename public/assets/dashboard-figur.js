/* Shared dashboard characters: admin edits the central configuration; all roles read the resolved view. */
(()=>{
const people={
 'jonas-schulz':{name:'Jonas Schulz',rolle:'Polizeipräsident',image:'/assets/idv-jonas-schulz-dashboard.png'},
 'tobias-schneider':{name:'Tobias Schneider',rolle:'Leitungsdienst',image:'/assets/idv-tobias-schneider-dashboard.webp?v=20261126-4'},
 'tobias-renner':{name:'Tobias Renner',rolle:'Leitungsdienst',sprite:'renner'},
 'lou-beckenbauer':{name:'Lou Beckenbauer',rolle:'Leitungsdienst',image:'/assets/idv-lou-beckenbauer-dashboard.webp?v=20261126-4'}
};
const cats={humor:'Lustige Sprüche',philosophie:'Philosophie',fakten:'Random Facts',motivation:'Motivation',dienst:'Diensthumor',polizei:'Polizei-Humor'};
const fallback='Schon wieder hier? Na dann, ran an die Arbeit!';
const h=v=>esc(String(v??''));
const option=(id,label,current)=>'<option value="'+h(id)+'"'+(id===current?' selected':'')+'>'+h(label)+'</option>';
const options=(obj,current)=>Object.entries(obj).map(([id,label])=>option(id,label,current)).join('');
const check=v=>v?' checked':'';
function portrait(id,preview=false){
 const p=people[id]||people['jonas-schulz'];
 const cls=preview?'figur-thumb':'hello-jonas-portrait';
 return p.image?'<img class="'+cls+'" src="'+p.image+'" alt="'+h(p.name)+'" decoding="async">':
  '<span role="img" aria-label="'+h(p.name)+'" class="'+cls+' figur-sprite figur-sprite--'+p.sprite+'"><img src="/assets/idv-leitung-figuren.png" alt="" decoding="async"></span>';
}
function markup(v,editable=false){
 const p=people[v?.person]||people['jonas-schulz'],style=['normal','denken','kompakt'].includes(v?.bubble)?v.bubble:'normal';
 const byline=[v?.rolleAnzeigen!==false?p.rolle:'',v?.nameAnzeigen!==false?p.name:''].filter(Boolean).join(' ');
 const category=cats[v?.kategorie];
 return '<div class="hello-jonas" data-dashboard-figur data-figur-state="'+h(JSON.stringify(v))+'">'+portrait(v?.person)+'<div class="hello-jonas-message"><div class="hello-jonas-bubble figur-bubble--'+style+'">'+
 (category?'<span class="figur-category">'+h(category)+'</span>':'')+(byline?'<span class="hello-jonas-byline">'+h(byline)+'</span>':'')+
 '<span class="hello-jonas-quote" data-jonas-quote>'+h(v?.spruch||fallback)+'</span></div>'+
 (editable?'<button type="button" class="hello-jonas-edit" data-jonas-edit>✎ Figur &amp; Spruch einstellen</button>':'')+'</div></div>';
}
function current(){return D?.dashboard?.figur||{person:'jonas-schulz',spruch:D?.dashboard?.jonasSpruch||fallback,nameAnzeigen:true,rolleAnzeigen:true,bubble:'normal'};}
function render(){return markup(current(),ME?.rolle==='Administrator');}
function apply(v){
 if(!D?.dashboard||!v||!people[v.person]||typeof v.spruch!=='string')return;
 const next=JSON.stringify(v);D.dashboard.figur=v;
 document.querySelectorAll('#inhalt [data-dashboard-figur]').forEach(el=>{if(el.dataset.figurState!==next)el.outerHTML=render();});
}
let timer=null,busy=false,seq=0;
async function refresh(){
 if(!ME||!D||document.hidden||tab!=='dash'||busy||document.querySelector('#dashboardFigurDialog[open]'))return;
 const actor=ME.id,version=++seq;busy=true;
 try{const v=await api('/dashboard-figur');if(ME?.id===actor&&seq===version)apply(v);}
 catch(e){if(![401,403].includes(e.status))console.warn('Dashboard-Figur nicht aktualisiert:',e.message);}
 finally{busy=false;}
}
function start(){if(!timer)timer=setInterval(()=>void refresh(),60000);}
function show(){
 if(ME?.rolle!=='Administrator'||document.querySelector('#dashboardFigurDialog[open]'))return;
 const actor=ME.id,dialog=document.createElement('dialog');dialog.id='dashboardFigurDialog';dialog.setAttribute('aria-labelledby','figurTitel');
 dialog.innerHTML='<div class="figur-admin-head"><div><h2 id="figurTitel">Dashboard-Figur &amp; Sprechblase</h2><p class="mut">Zentrale Einstellungen für alle Zugänge</p></div><button type="button" data-figur-close aria-label="Schließen">×</button></div><div class="figur-admin-body"><p>Lade Einstellungen …</p></div>';
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('[data-figur-close]').onclick=()=>dialog.close();dialog.showModal();
 void (async()=>{
  let cfg;
  try{const r=await api('/dashboard-figur/verwaltung');cfg=r.config;if(ME?.id!==actor||!dialog.open)return;}
  catch(e){if(dialog.open)dialog.querySelector('.figur-admin-body').textContent='Einstellungen konnten nicht geladen werden: '+e.message;return;}
  const revision=cfg.revision,body=dialog.querySelector('.figur-admin-body');let saving=false,pool=cfg.pool.map(x=>({...x})),filter='alle';
  body.innerHTML='<form class="figur-form"><div class="figur-admin-grid"><section class="figur-section"><h3>1 · Leitungsmitglied</h3><label for="figurModus">Figurenmodus</label><select id="figurModus">'+options({fest:'Feste Person',taeglich:'Täglicher Wechsel',rotation:'Tägliche Rotation in fester Reihenfolge',login:'Zufällig pro Anmeldung'},cfg.figurModus)+'</select><div class="figur-picker">'+Object.entries(people).map(([id,p])=>'<button type="button" data-figur-person="'+id+'" aria-pressed="'+(cfg.person===id)+'">'+portrait(id,true)+'<strong>'+h(p.name)+'</strong></button>').join('')+'</div><p class="mut">Die gewählte Person gilt im festen Modus. Bei Rotation wechseln alle vier.</p></section>'+
  '<section class="figur-section"><h3>2 · Sprechblase</h3><label for="figurTextModus">Textquelle</label><select id="figurTextModus">'+options({manuell:'Eigener Spruch',kategorie:'Automatisch aus einer Kategorie',gemischt:'Gemischt aus aktiven Kategorien'},cfg.textModus)+'</select>'+
  '<label for="figurSpruch">Eigener Spruch / Fallback</label><textarea id="figurSpruch" maxlength="180" rows="3" required>'+h(cfg.spruch)+'</textarea><div id="figurKategorieWrap"><label for="figurKategorie">Kategorie</label><select id="figurKategorie">'+options(cats,cfg.kategorie)+'</select></div>'+
  '<div id="figurKategorienWrap"><label>Aktive Kategorien</label><div class="figur-checks">'+Object.entries(cats).map(([id,label])=>'<label><input type="checkbox" data-figur-cat="'+id+'"'+check(cfg.kategorien.includes(id))+'> '+h(label)+'</label>').join('')+'</div></div>'+
  '<div id="figurIntervallWrap"><label for="figurIntervall">Textwechsel</label><select id="figurIntervall">'+options({taeglich:'Täglich (00:00 Uhr)',halbtag:'Alle 12 Stunden (00:00 / 12:00 Uhr)',login:'Bei jeder Anmeldung',fest:'Ersten aktiven Eintrag fixieren'},cfg.intervall)+'</select></div>'+
  '<p class="mut">Ohne aktiven passenden Eintrag erscheint der eigene Spruch.</p></section></div>'+
  '<section class="figur-section"><h3>3 · Anzeige &amp; Vorschau</h3><div class="figur-checks"><label><input type="checkbox" id="figurName"'+check(cfg.nameAnzeigen)+'> Name anzeigen</label><label><input type="checkbox" id="figurRolle"'+check(cfg.rolleAnzeigen)+'> Rolle anzeigen</label></div><label for="figurBubble">Sprechblasenstil</label><select id="figurBubble">'+options({normal:'Sprechblase',denken:'Denkblase',kompakt:'Kompakt'},cfg.bubble)+'</select><div class="figur-preview" aria-label="Beispielvorschau"></div><small class="mut">Beispielvorschau – die tatsächliche Tagesauswahl erfolgt beim Anzeigen.</small></section>'+
  '<section class="figur-section"><div class="figur-pool-head"><div><h3>4 · Sprüche &amp; Fakten verwalten</h3><p class="mut" id="figurPoolCount"></p></div><button type="button" data-figur-add>+ Inhalt hinzufügen</button></div><label for="figurPoolFilter">Kategorie filtern</label><select id="figurPoolFilter">'+options({alle:'Alle Kategorien',...cats},'alle')+'</select><div id="figurPool"></div></section>'+
  '<div class="figur-admin-foot"><span role="status" id="figurStatus"></span><button type="button" data-figur-cancel>Abbrechen</button><button type="submit" class="p">Für alle speichern</button></div></form>';
  const q=s=>body.querySelector(s),form=q('form'),status=q('#figurStatus'),save=q('[type=submit]');
  const fields=()=>({figurModus:q('#figurModus').value,person:cfg.person,textModus:q('#figurTextModus').value,spruch:q('#figurSpruch').value.trim(),kategorie:q('#figurKategorie').value,kategorien:[...body.querySelectorAll('[data-figur-cat]:checked')].map(e=>e.dataset.figurCat),intervall:q('#figurIntervall').value,nameAnzeigen:q('#figurName').checked,rolleAnzeigen:q('#figurRolle').checked,bubble:q('#figurBubble').value,pool});
  function preview(){
   const c=fields();q('#figurKategorieWrap').hidden=c.textModus!=='kategorie';q('#figurKategorienWrap').hidden=c.textModus!=='gemischt';q('#figurIntervallWrap').hidden=c.textModus==='manuell';
   const active=c.textModus==='manuell'?null:pool.find(x=>x.aktiv&&(c.textModus==='kategorie'?x.kategorie===c.kategorie:c.kategorien.includes(x.kategorie)));
   q('.figur-preview').innerHTML=markup({...c,spruch:active?.text||c.spruch||fallback,kategorie:active?.kategorie||null});
  }
  function count(){q('#figurPoolCount').textContent=pool.length+' Inhalte · '+pool.filter(x=>x.aktiv).length+' aktiv';}
  function paintPool(){
   q('#figurPool').innerHTML=pool.filter(x=>filter==='alle'||x.kategorie===filter).map(x=>'<div class="figur-pool-row" data-figur-row="'+h(x.id)+'"><select aria-label="Kategorie" data-pool-field="kategorie">'+options(cats,x.kategorie)+'</select><textarea aria-label="Inhalt" rows="2" maxlength="180" data-pool-field="text">'+h(x.text)+'</textarea><label><input type="checkbox" data-pool-field="aktiv"'+check(x.aktiv)+'> Aktiv</label><button type="button" data-pool-remove aria-label="Inhalt löschen">Löschen</button></div>').join('')||'<p class="mut">Keine Inhalte in dieser Kategorie.</p>';
   count();
  }
  body.addEventListener('input',e=>{
   const field=e.target.dataset.poolField;if(field){const row=pool.find(x=>x.id===e.target.closest('[data-figur-row]')?.dataset.figurRow);if(row){row[field]=field==='aktiv'?e.target.checked:e.target.value;count();}}
   if(e.target.id!=='figurPoolFilter')preview();
  });
  body.addEventListener('change',e=>{
   if(e.target.id==='figurPoolFilter'){filter=e.target.value;paintPool();}
   if(e.target.dataset.poolField==='kategorie'&&filter!=='alle')paintPool();
   preview();
  });
  body.addEventListener('click',e=>{
   const p=e.target.closest('[data-figur-person]');if(p){cfg.person=p.dataset.figurPerson;q('#figurModus').value='fest';body.querySelectorAll('[data-figur-person]').forEach(b=>b.setAttribute('aria-pressed',String(b===p)));preview();}
   if(e.target.closest('[data-figur-add]')){if(pool.length>=250){status.textContent='Maximal 250 Inhalte.';return;}const id='custom-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));pool.unshift({id,kategorie:filter==='alle'?'humor':filter,text:'',aktiv:true});paintPool();q('[data-figur-row="'+id+'"] textarea')?.focus();preview();}
   const del=e.target.closest('[data-pool-remove]');if(del&&confirm('Diesen Inhalt aus dem Spruchpool löschen?')){const id=del.closest('[data-figur-row]').dataset.figurRow;pool=pool.filter(x=>x.id!==id);paintPool();preview();}
  });
  const close=()=>{if(!saving)dialog.close();};q('[data-figur-cancel]').onclick=close;dialog.querySelector('[data-figur-close]').onclick=close;
  dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(saving||ME?.id!==actor||ME?.rolle!=='Administrator')return;
   const config=fields();if(!config.spruch||pool.some(x=>!x.text.trim()||[...x.text.trim()].length>180)){status.textContent='Bitte alle Inhalte und den Standardspruch mit 1–180 Zeichen ausfüllen.';return;}
   saving=true;const controls=[...form.querySelectorAll('button,input,textarea,select')];controls.forEach(c=>c.disabled=true);status.textContent='Speichert …';++seq;
   try{const r=await api('/dashboard-figur/verwaltung',{method:'PUT',body:JSON.stringify({revision,config})});if(ME?.id===actor){apply(r.anzeige);dialog.close();}}
   catch(err){status.textContent='Speichern fehlgeschlagen: '+err.message;}
   finally{saving=false;controls.forEach(c=>c.disabled=false);}
  });
  paintPool();preview();
 })();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-jonas-edit],[data-figur-settings]'))show();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
window.IDVDashboardFigur={render,start,refresh,show};
if(typeof ME!=='undefined'&&ME&&D){start();void refresh();}
})();
