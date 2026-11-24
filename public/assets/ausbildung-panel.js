/* Native Ausbildungsbereich im bestehenden IDV-Panel.
 * Komponenten und Styles laufen in einem ShadowRoot; die bestehende Navigation
 * und alle anderen Personalansichten bleiben unverändert.
 */
(function(){
  'use strict';
  const template="\n <div id=\"ausbildungWorkspace\">\n  <div class=\"top\"><div><span class=\"eyebrow\">IDV / Ausbildungsabteilung</span><h1 id=\"heading\">Ausbildung</h1></div>\n   <div class=\"flex\"><a href=\"/aulk.html\" target=\"_blank\" rel=\"noopener noreferrer\">AuLK-Unterlagen öffentlich ↗</a><button id=\"reload\" type=\"button\">Aktualisieren</button></div>\n  </div>\n  <nav id=\"nav\" aria-label=\"Ausbildungsnavigation\"></nav>\n  <div id=\"notice\" class=\"notice\" role=\"status\" aria-live=\"polite\"></div>\n  <div id=\"root\"><div class=\"card\">Ausbildungsdaten werden geladen…</div></div>\n  <div id=\"account\" class=\"hidden\"></div>\n  <a id=\"back\" class=\"hidden\" href=\"/\"></a>\n </div>";
  const css="\n:root{color-scheme:dark;--bg:#0e1622;--panel:#192536;--panel2:#223146;--edge:#34455c;--text:#e7eef7;--mut:#9caec3;--blue:#80b7ed;--ok:#51c99d;--bad:#f48b8b}\n*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top right,#193750,#0e1622 55%);color:var(--text);font:14px/1.5 system-ui,\"Segoe UI\",sans-serif}\nbutton,input,select,textarea{font:inherit}button{cursor:pointer;border:1px solid var(--edge);border-radius:8px;background:var(--panel2);padding:9px 13px;color:var(--text)}button:hover{border-color:var(--blue)}button:disabled{opacity:.45;cursor:not-allowed}\nbutton.primary{background:#37699e;border-color:#579ad4}button.danger{background:#562f3a;border-color:#ab6570}\ninput,select,textarea{width:100%;padding:10px;background:#101b2a;color:var(--text);border:1px solid var(--edge);border-radius:7px}input[type=checkbox]{width:auto;accent-color:#76b9f4}label{display:grid;gap:5px;font-size:12px;color:var(--mut)}a{color:#abd4ff}\n.shell{display:grid;grid-template-columns:255px minmax(0,1fr);min-height:100dvh}\naside{padding:22px 15px;background:#101926;border-right:1px solid var(--edge);display:flex;flex-direction:column;gap:22px}\n.brand img{max-width:160px;height:auto;display:block;margin:5px 0 12px}.brand strong{display:block;letter-spacing:.1em;font-size:13px}.brand small{color:var(--mut)}\nnav{display:grid;gap:8px}nav button{width:100%;text-align:left;background:transparent;border-color:transparent;padding:11px 12px}nav button.on,nav button:hover{background:#26384f;border-color:#425b78}\nnav small{color:var(--mut);margin:15px 8px 0}.sidebar-foot{margin-top:auto;display:grid;gap:12px;color:var(--mut);font-size:12px}\nmain{min-width:0;padding:22px clamp(16px,3vw,46px) 60px;max-width:1600px;width:100%;margin:auto}\n.top{display:flex;gap:14px;justify-content:space-between;align-items:center;margin-bottom:22px;padding-bottom:17px;border-bottom:1px solid var(--edge);flex-wrap:wrap}\nh1{margin:0;font-size:clamp(23px,3vw,30px);letter-spacing:-.02em}h2{margin:0 0 14px;font-size:19px}h3{margin:0 0 10px;font-size:15px}\n.muted,small{color:var(--mut)}p{margin:8px 0 16px}.eyebrow{color:#8db9e6;font-size:11px;text-transform:uppercase;letter-spacing:.13em}\n.card{background:rgba(25,37,54,.91);border:1px solid var(--edge);border-radius:13px;padding:20px;margin-bottom:17px}\n.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin-bottom:17px}.kpi{background:rgba(32,48,69,.9);border:1px solid var(--edge);padding:17px;border-radius:11px}.kpi strong{display:block;font-size:29px}.kpi span{color:var(--mut)}\n.flex{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.space{justify-content:space-between}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.formgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:14px 0}.full{grid-column:1/-1}\n.tablewrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:660px}th,td{padding:11px 9px;text-align:left;border-bottom:1px solid #ffffff16;vertical-align:middle}th{color:var(--mut);font-size:11px;letter-spacing:.04em}tr:hover td{background:#ffffff05}\n.pill{display:inline-block;padding:4px 9px;border-radius:99px;font-size:11px;border:1px solid #a9bbca4d;background:#ffffff0b}.pill.good{color:#a4ffdb;border-color:#388969}.pill.warn{color:#ffdb9f;border-color:#91704b}\n.meter{height:7px;background:#36465a;border-radius:9px;overflow:hidden;min-width:80px}.meter i{display:block;height:100%;background:linear-gradient(90deg,#4b8ac6,#5bd6ac)}\n.callout{padding:12px 14px;border:1px solid #487299;border-radius:9px;background:#24415a5e;margin-bottom:18px}\n.notice{display:none;margin-bottom:18px;padding:11px;border-radius:9px;border:1px solid #427b64;background:#23534250}.notice.bad{border-color:#8e5757;background:#733b3b55}\n.modrow{display:grid;grid-template-columns:70px minmax(0,1fr) 130px;gap:10px;align-items:center;border-bottom:1px solid #ffffff17;padding:9px 0}\n.competence{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.competence label{display:flex;align-items:center;gap:6px;border:1px solid var(--edge);border-radius:8px;padding:7px 9px}\n.compact{padding:6px 9px;font-size:12px}code{font-size:12px;color:#b4d9f4}.hidden{display:none!important}\n@media(max-width:1000px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.formgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:700px){.shell{display:block}aside{position:static;padding:12px}aside .brand img{max-width:112px;float:left;margin:0 12px 0 0}.brand{min-height:51px}.sidebar-foot{display:none}nav{display:flex;overflow-x:auto}nav small{display:none}nav button{white-space:nowrap;width:auto}main{padding:18px 12px 50px}.kpis{grid-template-columns:repeat(2,1fr)}.grid,.formgrid{grid-template-columns:1fr}.modrow{grid-template-columns:64px 1fr}.modrow button{grid-column:2;justify-self:start}}\n\n:host {display:block;color:var(--text,#e6edf6);font:14px/1.5 system-ui,\"Segoe UI\",sans-serif;--panel:#192536;--panel2:#223146;--edge:#34455c;--text:#e7eef7;--mut:#9caec3;--blue:#80b7ed}\n#ausbildungWorkspace {width:100%;max-width:1600px;margin:0 auto}\n#ausbildungWorkspace .top {margin:0 0 18px;padding:14px 0 16px}\n#ausbildungWorkspace nav {display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;margin-bottom:20px}\n#ausbildungWorkspace nav button {width:auto;white-space:normal;border-color:var(--edge);background:var(--panel);padding:9px 13px}\n#ausbildungWorkspace nav button.on {background:#31577e;border-color:#649bd1}\n#ausbildungWorkspace .card{max-width:100%;overflow:visible}\n#ausbildungWorkspace .tablewrap{max-width:100%;overflow:auto}\n#ausbildungWorkspace .kpis{grid-template-columns:repeat(auto-fit,minmax(155px,1fr))}\n@media(max-width:700px){#ausbildungWorkspace nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}#ausbildungWorkspace nav button{width:100%}}\n";
  let instance=null;
  function create(container) {
    const host=document.createElement('div');
    host.id='idvAusbildungModule';
    container.append(host);
    const shadow=host.attachShadow({mode:'open'});
    const style=document.createElement('style');style.textContent=css;
    shadow.append(style);
    const surface=document.createElement('div');surface.innerHTML=template;
    shadow.append(surface);
const el=(q)=>shadow.querySelector(q);
const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(s)=>{if(Array.isArray(s))return s;try{return JSON.parse(s||'[]')}catch{return []}};
const fmt=(v)=>v?String(v).slice(0,10).split('-').reverse().join('.'):'—';
const modName=(m)=>m.code+' · '+m.titel;
const pill=(s)=>'<span class="pill '+(s==='Zugelassen'?'good':s==='Nicht bereit'?'warn':'')+'">'+esc(s)+'</span>';
const meter=(n,d)=>'<div class="meter" title="'+n+' von '+d+'"><i style="width:'+Math.min(100,Math.max(0,d?n/d*100:0))+'%"></i></div>';
let data=null,tab='uebersicht',track='PMA',selected=null,editing=null,busy=false;
const ROUTES=[['uebersicht','Übersicht'],['monitore','PMA- / PKA- / KKA-Monitor'],['ausbilder','Ausbilderverwaltung'],['materialien','Ausbildungsunterlagen']];
async function request(path,opt={}){
 const headers={'Accept':'application/json'};
 if(opt.body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch('/api/ausbildung/'+path,{credentials:'same-origin',cache:'no-store',...opt,headers:{...headers,...(opt.headers||{})}});
 const j=await r.json().catch(()=>({}));
 if(!r.ok){let e=new Error(j.error||'HTTP '+r.status);e.status=r.status;throw e;}
 return j;
}
function message(v,bad=false){const e=el('#notice');e.textContent=v;e.className='notice'+(bad?' bad':'');e.style.display='block';}
function formObj(f){return Object.fromEntries(new FormData(f).entries())}
function setTab(next){tab=next;selected=null;editing=null;render();}
async function load(){
 try{
   data=await request('bootstrap');
   el('#account').textContent=data.user.name+' · '+data.user.rolle;
   if(!['Ausbilder','Ausbildungsleitung'].includes(data.user.rolle))el('#back').classList.remove('hidden');
   el('#notice').style.display='none';
   if(window.IDVTrainerPreset){tab='ausbilder';editing={type:'trainer',id:null,personal:window.IDVTrainerPreset};selected=null;window.IDVTrainerPreset=null;}
   render();
 }catch(e){
   data=null;
   if(e.status===401){
     el('#root').innerHTML='<div class="card"><h2>Deine Sitzung ist abgelaufen</h2>'+
       '<p>Bitte melde dich über das normale Polizeipanel erneut an. Du musst dafür keine zweite Ausbildungsanmeldung durchführen.</p>'+
       '<a href="/">Zur normalen Panel-Anmeldung</a></div>';
     message('Sitzung abgelaufen',true);return;
   }
   let setup=null;
   if(e.status===503||e.status===500){
     try{setup=await request('setup-status')}catch(_){/* Keine Administratorrechte oder Serverproblem */}
   }
   if(setup && !setup.bereit){
     const missing=(setup.fehlendeTabellen||[]).map(esc).join(', ');
     el('#root').innerHTML='<div class="card"><h2>Ausbildungsdatenbank noch nicht eingerichtet</h2>'+
       '<p>Dein bestehender Panel-Login funktioniert. Es fehlen die neuen Ausbildungstabellen oder die AuLK-Erweiterung in MySQL 8.</p>'+
       (missing?'<p><b>Fehlende Tabellen:</b> '+missing+'</p>':'')+
       (!setup.oeffentlicheFreigabeSpalte?'<p>Die öffentliche AuLK-Dokumentfreigabe fehlt noch.</p>':'')+
       '<div class="callout"><b>Vor dem Einrichten:</b> Eine vollständige Sicherung der bestehenden Datenbank erstellen. Die Einrichtung ergänzt nur Ausbildungsstrukturen; sie löscht keine Personalakten.</div>'+
       '<button data-action="setup-schema" class="primary">Ausbildungsdatenbank einrichten</button>'+
       '<p class="muted">Nur Administratoren. Falls der Hoster keine Datenbank-Strukturänderungen durch PHP erlaubt, können die beiden additiven SQL-Dateien stattdessen über phpMyAdmin importiert werden.</p></div>';
     message('Ausbildungsdatenbank noch nicht eingerichtet',true);
     return;
   }
   el('#root').innerHTML='<div class="card"><h2>Ausbildung konnte nicht geladen werden</h2>'+
     '<p>'+esc(e.message)+'</p>'+
     '<p>Du bist weiterhin im Polizeipanel angemeldet. Bitte aktualisiere den Ausbildungsbereich. Wenn der Fehler bleibt, muss der Datenbankfehler am Hoster geprüft werden.</p>'+
     '<button data-action="retry-bootstrap" class="primary">Erneut laden</button></div>';
   message(e.message,true);
 }
}
async function refreshSelected(){
 if(selected){const d=await request('anwaerter/'+selected.anwaerter.id);selected=d;}
 await load();
}
function navRender(){
 el('#nav').innerHTML=ROUTES.map(([key,label])=>'<button type="button" data-tab="'+key+'" class="'+(tab===key?'on':'')+'">'+esc(label)+'</button>').join('');
 el('#heading').textContent=ROUTES.find(x=>x[0]===tab)?.[1]||'Ausbildung';
}
function render(){
 if(!data)return;
 navRender();
 const r=el('#root');
 if(tab==='uebersicht')r.innerHTML=overview();
 if(tab==='monitore')r.innerHTML=monitors();
 if(tab==='ausbilder')r.innerHTML=trainers();
 if(tab==='materialien')r.innerHTML=materials();
}
function overview(){
 const a=data.anwaerter;const n=a.filter(x=>x.fortschritt.bereit).length;
 return '<div class="kpis"><div class="kpi"><strong>'+a.length+'</strong><span>Anwärter insgesamt</span></div><div class="kpi"><strong>'+a.filter(x=>x.laufbahn==='PMA').length+'</strong><span>PMA</span></div><div class="kpi"><strong>'+a.filter(x=>x.laufbahn!=='PMA').length+'</strong><span>PKA / KKA</span></div><div class="kpi"><strong>'+n+'</strong><span>Zur Prüfung zugelassen</span></div></div>'+
 '<div class="grid"><section class="card"><h2>Prüfungsstand</h2>'+a.slice(0,12).map(x=>'<div class="flex space" style="border-bottom:1px solid #ffffff18;padding:9px 0"><span><b>'+esc(x.name)+'</b><br><small>'+esc(x.laufbahn)+' · '+x.fortschritt.moduleFertig+'/'+x.fortschritt.moduleGesamt+' Module</small></span>'+pill(x.fortschritt.status)+'</div>').join('')+
 (a.length?'':'<p class="muted">Noch keine Anwärter angelegt.</p>')+
 '</section><section class="card"><h2>Ausbildungsstruktur</h2><p>Die sieben PMA-Module stammen aus der Excel-Vorlage. Die PMA-Prüfungsbereitschaft setzt vollständige Module und mindestens <b>2,5 gewichtete Stimmenpunkte</b> voraus.</p><p>PKA und KKA verwenden derzeit PK.1–PK.4. Hier gilt laut Vorlage: alle vier Module abgeschlossen = zugelassen.</p><p class="muted">PK.5, PK.7 und PM.7 sind in der Kompetenzmatrix beziehungsweise Übersicht genannt, aber mangels eindeutiger Bewertungsregel noch keine Pflichtmodule.</p><button data-tab="monitore" class="primary">Zu den Monitoren</button></section></div>';
}
function monitors(){
 let list=data.anwaerter.filter(a=>a.laufbahn===track);
 let html='<div class="card"><div class="flex space"><div class="flex">'+['PMA','PKA','KKA'].map(t=>'<button data-track="'+t+'" class="'+(track===t?'primary':'')+'">'+t+' ('+data.anwaerter.filter(x=>x.laufbahn===t).length+')</button>').join('')+'</div>'+
 (data.leitung?'<button data-action="new-trainee" class="primary">+ Anwärter anlegen</button>':'')+'</div><div class="tablewrap"><table><thead><tr><th>Dienstnr.</th><th>Anwärter</th><th>Beginn</th><th>Module</th><th>Prüfungsstand</th><th></th></tr></thead><tbody>'+
 list.map(x=>'<tr><td>'+esc(x.personalnummer??'—')+'</td><td><b>'+esc(x.name)+'</b><br><small>'+esc(x.nebenberuf||'')+'</small></td><td>'+fmt(x.beginn)+'</td><td>'+x.fortschritt.moduleFertig+'/'+x.fortschritt.moduleGesamt+meter(x.fortschritt.moduleFertig,x.fortschritt.moduleGesamt)+'</td><td>'+pill(x.fortschritt.status)+'</td><td><button class="compact" data-action="open" data-id="'+x.id+'">Öffnen</button></td></tr>').join('')+
 '</tbody></table></div>'+(list.length?'':'<p class="muted">Für diese Laufbahn sind noch keine Datensätze angelegt.</p>')+'</div>';
 if(editing?.type==='trainee-new')html+=traineeForm();
 if(selected?.anwaerter && selected.anwaerter.laufbahn===track)html+=traineeDetails(selected);
 if(editing?.type==='trainee-edit')html+=traineeForm(selected?.anwaerter);
 return html;
}
function traineeForm(a){
 const existing=!!a;
 return '<section class="card"><h2>'+(existing?'Anwärter bearbeiten':'Anwärter anlegen')+'</h2><form id="traineeForm" class="formgrid">'+
 '<label>Name<input name="name" required maxlength="180" value="'+esc(a?.name||'')+'"></label>'+
 (!existing?'<label>Laufbahn<select name="laufbahn">'+['PMA','PKA','KKA'].map(x=>'<option '+(x===track?'selected':'')+'>'+x+'</option>').join('')+'</select></label>':'')+
 (!existing?'<label>Dienstnummer<input type="number" name="personalnummer" min="1" max="9999999" value=""></label>':'')+
 '<label>Nebenberuf / Kennung<input name="nebenberuf" maxlength="60" value="'+esc(a?.nebenberuf||'')+'"></label>'+
 '<label>Beginn<input name="beginn" type="date" value="'+esc((a?.beginn||'').slice(0,10))+'"></label>'+
 (existing?'<label>RSA<span class="flex"><input type="checkbox" name="rsa" '+(Number(a.rsa)?'checked':'')+'> vorhanden</span></label>':'')+
 '<label class="full">Interne Bemerkung<textarea name="bemerkung" maxlength="2000" rows="2">'+esc(a?.bemerkung||'')+'</textarea></label>'+
 '<div class="full flex"><button class="primary" type="submit">Speichern</button><button data-action="cancel-edit" type="button">Abbrechen</button></div></form></section>';
}
function traineeDetails(d){
 const a=d.anwaerter,p=d.fortschritt;
 const canEdit=data.leitung||data.eigeneKompetenzen.length>0;
 const myVote=p.stimmen?.find(v=>Number(v.ausbilder_user_id)===Number(data.user.id))?.stimme||'';
 const modules=p.module.map(m=>{
   const decks=(data.materialien||[]).filter(x=>x.modul_code===m.code && /^https:\/\/docs\.google\.com\/presentation\//.test(x.url||''));
   const mayPresent=data.leitung||data.eigeneKompetenzen.includes(m.code);
   const presentation=decks.length?
      '<div class="flex" style="margin-top:7px">'+decks.map(deck=>
        '<a href="'+esc(deck.url)+'" target="_blank" rel="noopener noreferrer">📽 '+esc(deck.titel)+' ↗</a>'+
        (mayPresent?' <button type="button" class="compact primary" data-action="start-lesson" data-id="'+Number(deck.id)+'" data-code="'+esc(m.code)+'">Gemeinsamen Unterricht starten</button>':'')
      ).join(' ')+'</div>':
      '<div class="muted" style="font-size:12px">Noch keine AuLK-Präsentation zugeordnet'+
      (data.leitung?' · <button type="button" class="compact" data-action="link-module" data-code="'+esc(m.code)+'">Google-Link hinterlegen</button>':'')+'</div>';
   return '<div class="modrow"><b>'+esc(m.code)+'</b><div><b>'+esc(m.titel)+'</b><div class="muted">'+(m.abgeschlossen?'Abgeschlossen':'Offen')+'</div>'+presentation+'</div>'+
    '<button type="button" class="compact" data-action="module" data-code="'+esc(m.code)+'" data-done="'+(m.abgeschlossen?'1':'0')+'" '+(!mayPresent?'disabled title="Keine Modulkompetenz"':'')+'>'+
    (m.abgeschlossen?'↶ Zurücksetzen':'✓ Abschließen')+'</button></div>';
 }).join('');
 return '<section class="card" id="details"><div class="flex space"><div><span class="eyebrow">'+esc(a.laufbahn)+' · Dienstnummer '+esc(a.personalnummer||'—')+'</span><h2>'+esc(a.name)+'</h2></div><div class="flex">'+pill(p.status)+'<button data-action="close">Schließen</button></div></div>'+
 '<div class="kpis"><div class="kpi"><strong>'+p.moduleFertig+' / '+p.moduleGesamt+'</strong><span>Module abgeschlossen</span></div><div class="kpi"><strong>'+p.stimmenSaldo+'</strong><span>Stimmenbilanz</span></div><div class="kpi"><strong>'+p.stimmenJa+'</strong><span>Ja-Stimmen</span></div><div class="kpi"><strong>'+p.stimmenNein+'</strong><span>Nein-Stimmen</span></div></div>'+
 '<h3>Ausbildungsmodule</h3>'+modules+
 (a.laufbahn==='PMA'?'<div class="card" style="margin-top:16px"><h3>PMA-Prüfungsabstimmung (Gewichtung nach Ausbildungsfunktion)</h3><p class="muted">Schwelle: 2,5 Punkte, erst nach vollständiger Modulreihe. Jede Person hat höchstens eine aktuelle Stimme.</p><div class="flex"><select id="vote" style="max-width:220px"><option value="">Stimme zurückziehen</option><option '+(myVote==='Ja'?'selected':'')+'>Ja</option><option '+(myVote==='Nein'?'selected':'')+'>Nein</option></select><button class="primary" data-action="vote" '+(!canEdit?'disabled':'')+'>Stimme speichern</button></div><div class="tablewrap"><table><thead><tr><th>Ausbilder</th><th>Stimme</th><th>Gewicht</th><th>Datum</th></tr></thead><tbody>'+p.stimmen.map(v=>'<tr><td>'+esc(v.anzeigename)+'</td><td>'+esc(v.stimme)+'</td><td>'+Number(v.gewicht)+'</td><td>'+fmt(v.aktualisiert)+'</td></tr>').join('')+'</tbody></table></div></div>':'')+
 '<div class="flex" style="margin-top:20px">'+(data.leitung?'<button data-action="edit-trainee">Stammdaten bearbeiten</button><button data-action="create-link" class="primary">Externen Link erzeugen / erneuern</button><button data-action="remove-link" class="danger">Externen Link sperren</button>':'')+'</div>'+
 '<p class="muted">Externe Links zeigen nur Modulfortschritte und Prüfungsstatus, keine Namen oder internen Bewertungen.</p><div id="createdLink"></div>'+
 '</section>';
}
function trainers(){
 let out='<div class="card"><div class="flex space"><div><h2>Ausbilderteam</h2><p class="muted">Kompetenzen, Funktionen und getrennte Zugänge</p></div>'+(data.leitung?'<button data-action="new-trainer" class="primary">+ Ausbilder anlegen</button>':'')+'</div><div class="tablewrap"><table><thead><tr><th>DN</th><th>Name</th><th>Kürzel</th><th>Rang</th><th>Funktion / Stimmgewicht</th><th>Module</th><th></th></tr></thead><tbody>'+
 data.ausbilder.map(t=>'<tr><td>'+esc(t.dienstnummer)+'<br><small>Login: '+esc(t.login_dienstnummer||'—')+'</small></td><td><b>'+esc(t.name)+'</b></td><td>'+esc(t.kuerzel)+'</td><td>'+esc(t.rang)+'</td><td>'+esc(t.funktion)+'<br><small>Gewicht '+Number(t.gewicht)+'</small></td><td>'+json(t.kompetenzen).map(x=>'<span class="pill">'+esc(x)+'</span>').join(' ')+'</td><td>'+(data.leitung?'<button class="compact" data-action="edit-trainer" data-id="'+t.id+'">Bearbeiten</button> <button class="compact danger" data-action="remove-trainer" data-id="'+t.id+'">Zugang entziehen</button>':'')+'</td></tr>').join('')+
 '</tbody></table></div></div>';
 if(editing?.type==='trainer')out+=trainerForm(editing.id?data.ausbilder.find(t=>Number(t.id)===editing.id):null);
 return out;
}
function trainerForm(t){
 const preset=(!t&&editing?.personal)||{};
 const codes=data.module.map(m=>m.code),current=json(t?.kompetenzen);
 const funcs=['Ausbildungsleitung','stv. Ausbildungsleitung','Leitungsdienst','Ausbilder gehobener Dienst','Ausbilder mittlerer Dienst','Ausbilder auf Probe'];
 return '<div class="card"><h2>'+(t?'Ausbilder bearbeiten':'Neuen Ausbilderzugang anlegen')+'</h2><p class="muted">Die Personalakte bleibt unverändert. Für jeden Ausbilder wird ein neuer, eigenständiger Login erstellt: AUS-&lt;Dienstnummer&gt;. Beispielsweise bekommt die Ausbildungs-DN 13 den Login AUS-13. Vorhandene Polizeikonten, Dienstnummern, Passwörter und Berechtigungen bleiben unverändert.</p><form id="trainerForm" class="formgrid">'+
 '<label>Dienstnummer<input name="dienstnummer" required maxlength="32" value="'+esc(t?.dienstnummer||preset.dienstnummer||'')+'" '+(t?'readonly':'')+'></label>'+
 '<label>Name<input name="name" required maxlength="180" value="'+esc(t?.name||preset.name||'')+'"></label>'+
 '<label>Kürzel<input name="kuerzel" maxlength="16" required value="'+esc(t?.kuerzel||preset.kuerzel||'')+'"></label>'+
 '<label>Rang<input name="rang" maxlength="120" value="'+esc(t?.rang||preset.rang||'')+'"></label>'+
 '<label>Funktion<select name="funktion">'+funcs.map(x=>'<option '+(x===(t?.funktion||'Ausbilder auf Probe')?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>'+
 '<label>Eintritt<input name="eintritt" type="date" value="'+esc((t?.eintritt||preset.eintritt||'').slice(0,10))+'"></label>'+
 '<label>E-Mail<input type="email" name="email" maxlength="254" value="'+esc(t?.email||'')+'"></label>'+
 (!t?'<label>Startpasswort (nur bei neuem Konto Pflicht)<input type="password" name="startpasswort" autocomplete="new-password" minlength="8"></label>':'')+
 '<label class="full">Interne Anmerkung<textarea name="notiz" rows="2">'+esc(t?.notiz||'')+'</textarea></label>'+
 '<div class="full"><h3>Freigegebene Ausbildungsmodule</h3><div class="competence">'+codes.map(code=>'<label><input type="checkbox" name="kompetenz" value="'+esc(code)+'" '+(current.includes(code)?'checked':'')+'> '+esc(code)+'</label>').join('')+'</div></div>'+
 '<div class="full flex"><button type="submit" class="primary">Speichern</button><button type="button" data-action="cancel-edit">Abbrechen</button></div></form></div>';
}
function materials(){
 const moduleLinks='<section class="card"><h2>AuLK nach Ausbildungsmodul</h2><p>Google-Präsentationen direkt aufrufen oder für einen Anwärter eine gemeinsame Bildschirmübertragung starten.</p>'+data.module.map(m=>{
   const decks=(data.materialien||[]).filter(x=>x.modul_code===m.code&&/^https:\/\/docs\.google\.com\/presentation\//.test(x.url||''));
   const mayPresent=data.leitung||data.eigeneKompetenzen.includes(m.code);
   return '<div class="modrow"><b>'+esc(m.code)+'</b><div><strong>'+esc(m.titel)+'</strong><div class="flex" style="margin-top:5px">'+(decks.length?decks.map(d=>'<a href="'+esc(d.url)+'" target="_blank" rel="noopener noreferrer">'+esc(d.titel)+' ↗</a> '+(mayPresent?'<button class="compact" data-action="start-lesson" data-code="'+esc(m.code)+'" data-id="'+Number(d.id)+'">Unterricht starten</button>':'' )).join(' '):'<small class="muted">Noch kein Präsentationslink gespeichert.</small>')+'</div></div>'+(data.leitung?'<button class="compact" data-action="link-module" data-code="'+esc(m.code)+'">+ Zuordnen</button>':'')+'</div>';
 }).join('')+'</section>';
 return moduleLinks+'<div class="card"><h2>Ausbildungsbibliothek</h2><p>Hier werden die Google-Präsentationen, Ausbilderleitfäden und Ausbildungsdokumente verlinkt. Der Zugriff auf diese Übersicht erfordert einen Ausbilderzugang; die Freigaben innerhalb von Google Drive gelten zusätzlich.</p>'+
 '<div class="flex space"><a href="/aulk.html" target="_blank" rel="noopener noreferrer">Öffentliche AuLK-Bibliothek öffnen ↗</a><a href="https://sites.google.com/view/aulk2026/startseite" rel="noopener noreferrer" target="_blank">Bisherige Google-Site ↗</a>'+(data.leitung?'<button data-action="new-material" class="primary">+ Google-Link</button><button data-action="import-aulk" class="primary">AuLK-Zuordnungen importieren</button><button data-action="upload-material" class="primary">+ Datei hochladen</button>':'')+'</div></div>'+
 '<div class="card"><div class="tablewrap"><table><thead><tr><th>Modul</th><th>Unterlage</th><th>Typ</th><th></th></tr></thead><tbody>'+
 data.materialien.map(m=>'<tr><td>'+esc(m.modul_code||'Allgemein')+'</td><td>'+esc(m.titel)+'</td><td>'+esc(m.typ)+'</td><td>'+(Number(m.datei)?'<a href="/api/ausbildung/materialien/'+m.id+'/datei">Geschützt herunterladen ↘</a>':'<a href="'+esc(m.url)+'" target="_blank" rel="noopener noreferrer">Öffnen ↗</a>')+' '+(/^https:\/\/docs\.google\.com\/presentation\//.test(m.url||'')&&(data.leitung||data.eigeneKompetenzen.includes(m.modul_code))?'<button class="compact primary" data-action="start-lesson" data-code="'+esc(m.modul_code)+'" data-id="'+Number(m.id)+'">Unterricht</button> ':'')+(data.leitung?'<button class="compact" data-action="public-material" data-id="'+m.id+'" data-active="'+Number(m.public_aktiv)+'">'+(Number(m.public_aktiv)?'Öffentlich ✓':'Öffentlich freigeben')+'</button> <button class="compact danger" data-action="remove-material" data-id="'+m.id+'">Entfernen</button>':'')+'</td></tr>').join('')+
 '</tbody></table></div>'+(data.materialien.length?'':'<p class="muted">Noch keine Einzelverknüpfungen hinterlegt. Die hochgeladene ZIP ist nicht automatisch öffentlich veröffentlicht worden.</p>')+'</div>'+
 (editing?.type==='material'?'<div class="card"><h2>Google-Unterlage hinzufügen</h2><form id="materialForm" class="formgrid"><label>Modul<select name="modul_code"><option value="">Allgemein / Weiterbildung</option>'+data.module.map(m=>'<option value="'+esc(m.code)+'" '+(editing.module===m.code?'selected':'')+'>'+esc(modName(m))+'</option>').join('')+'</select></label>'+
 '<label>Dokumenttyp<select name="typ"><option>Präsentation</option><option>Leitfaden</option><option>Prüfungsunterlage</option><option>Handout</option></select></label><label>Bezeichnung<input name="titel" required maxlength="200"></label>'+
 '<label class="full">Google-Docs-, Slides-, Drive- oder Sites-Link<input type="url" name="url" required placeholder="https://docs.google.com/…"></label><div class="full flex"><button class="primary" type="submit">Verlinken</button><button type="button" data-action="cancel-edit">Abbrechen</button></div></form></div>':'')+
 (editing?.type==='upload'?'<div class="card"><h2>Interne Datei hochladen</h2><p class="muted">PDF-, DOCX-, PPTX- oder XLSX-Dateien bis 40 MB. Dateien bleiben außerhalb des Webroots und sind nur nach Anmeldung abrufbar. Die große ZIP bitte zuerst entpacken und die Module einzeln hochladen.</p><form id="uploadForm" class="formgrid" enctype="multipart/form-data"><label>Modul<select name="modul_code"><option value="">Allgemein / Weiterbildung</option>'+data.module.map(m=>'<option value="'+esc(m.code)+'">'+esc(modName(m))+'</option>').join('')+'</select></label><label>Dokumenttyp<select name="typ"><option>Präsentation</option><option>Leitfaden</option><option>Prüfungsunterlage</option><option>Handout</option></select></label><label>Bezeichnung<input name="titel" required maxlength="200"></label><label class="full">Datei<input type="file" name="datei" accept=".pdf,.pptx,.docx,.xlsx" required></label><div class="full flex"><button class="primary" type="submit">Geschützt hochladen</button><button type="button" data-action="cancel-edit">Abbrechen</button></div></form></div>':'');
}
async function act(fn){
 if(busy)return;busy=true;
 try{await fn();}catch(e){message(e.message,true);if(e.status===409){await load();if(selected){try{selected=await request('anwaerter/'+selected.anwaerter.id);render()}catch{selected=null}}}}
 finally{busy=false}
}
shadow.addEventListener('click',async(e)=>{
 const tabBtn=e.target.closest('[data-tab]');if(tabBtn){setTab(tabBtn.dataset.tab);return}
 const trackBtn=e.target.closest('[data-track]');if(trackBtn){track=trackBtn.dataset.track;selected=null;editing=null;render();return}
 const btn=e.target.closest('[data-action]');if(!btn)return;
 const mode=btn.dataset.action,id=Number(btn.dataset.id);
 if(mode==='retry-bootstrap'){await load();return}
 if(mode==='setup-schema'){
   if(!confirm('Hast du die bestehende MySQL-Datenbank vor dieser Einrichtung vollständig gesichert? Die beiden Ausbildungs-SQL-Erweiterungen werden jetzt additiv ausgeführt.'))return;
   if(!confirm('Nur fortfahren, wenn ein Datenbank-Backup vorhanden ist. Ausbildungstabellen und Rollen jetzt ergänzen?'))return;
   btn.disabled=true;btn.textContent='Datenbank wird eingerichtet …';
   try{
     await request('setup',{method:'POST',body:JSON.stringify({bestaetigung:'BACKUP_ERSTELLT_AUSBILDUNG'})});
     await load();message('Ausbildungsdatenbank erfolgreich eingerichtet.');
   }catch(err){
     message(err.message,true);
     btn.disabled=false;btn.textContent='Einrichtung erneut versuchen';
   }
   return;
 }
 if(!data)return;
 if(mode==='cancel-edit'){editing=null;render();return}
 if(mode==='new-trainee'){editing={type:'trainee-new'};selected=null;render();return}
 if(mode==='new-trainer'){editing={type:'trainer',id:null};render();return}
 if(mode==='edit-trainer'){editing={type:'trainer',id};render();return}
 if(mode==='import-aulk'){
   if(!data.leitung)return;
   const filePicker=document.createElement('input');filePicker.type='file';filePicker.accept='.json,application/json';
   filePicker.addEventListener('change',async()=>{
     if(!filePicker.files?.length)return;
     await act(async()=>{
       const raw=await filePicker.files[0].text();
       if(raw.length>100000)throw Error('Die Zuordnungsdatei ist zu groß.');
       let payload;try{payload=JSON.parse(raw)}catch{throw Error('Ungültige JSON-Datei');}
       if(!Array.isArray(payload.eintraege))throw Error('Die Datei enthält keine AuLK-Einträge.');
       if(!confirm('Bis zu '+payload.eintraege.length+' AuLK-Verknüpfungen PRIVAT ergänzen? Bestehende Einträge bleiben unberührt, keine automatische öffentliche Freigabe.'))return;
       const result=await request('materialien/import',{method:'POST',body:JSON.stringify({...payload,bestaetigung:'AULK_PRIVAT_IMPORT'})});
       await load();message('AuLK-Zuordnungen: '+result.neu+' neu, '+result.vorhanden+' bereits vorhanden. Nichts öffentlich geschaltet.');
     });
   },{once:true});
   filePicker.click();return;
 }
 if(mode==='new-material'){editing={type:'material',module:''};render();return}
 if(mode==='link-module'){tab='materialien';editing={type:'material',module:btn.dataset.code};render();return}
 if(mode==='start-lesson'){await act(async()=>{const r=await request('unterricht',{method:'POST',body:JSON.stringify({modul_code:btn.dataset.code,material_id:id})});sessionStorage.setItem('idvLesson:'+r.id,location.origin+r.einladung);location.assign('/unterricht.html?raum='+r.id)});return}
 if(mode==='upload-material'){editing={type:'upload'};render();return}
 if(mode==='close'){selected=null;editing=null;render();return}
 if(mode==='open'){await act(async()=>{selected=await request('anwaerter/'+id);editing=null;render();el('#details')?.scrollIntoView({behavior:'smooth'})});return}
 if(mode==='edit-trainee'){editing={type:'trainee-edit'};render();return}
 if(mode==='module'){await act(async()=>{const id=selected.anwaerter.id;await request('anwaerter/'+id+'/modul/'+encodeURIComponent(btn.dataset.code),{method:'PUT',body:JSON.stringify({abgeschlossen:btn.dataset.done!=='1',revision:Number(selected.anwaerter.revision)})});selected=await request('anwaerter/'+id);await load();message('Modul gespeichert.')});return}
 if(mode==='vote'){await act(async()=>{const id=selected.anwaerter.id,v=el('#vote').value;await request('anwaerter/'+id+'/stimme',{method:'PUT',body:JSON.stringify({stimme:v||null,revision:Number(selected.anwaerter.revision)})});selected=await request('anwaerter/'+id);await load();message('Stimme gespeichert.')});return}
 if(mode==='create-link'){await act(async()=>{const r=await request('anwaerter/'+selected.anwaerter.id+'/link',{method:'POST',body:'{}'});const target=el('#createdLink');target.textContent='';const p=document.createElement('p');p.textContent='Neuer Link (bitte sicher an den Anwärter weitergeben):';const inp=document.createElement('input');inp.readOnly=true;inp.value=location.origin+r.pfad;target.append(p,inp);inp.select();message('Neuer externer Zugangslink erzeugt; ältere Links sind ungültig.')});return}
 if(mode==='remove-link'){if(!confirm('Externen Zugangslink wirklich sperren?'))return;await act(async()=>{await request('anwaerter/'+selected.anwaerter.id+'/link',{method:'DELETE'});message('Externer Link deaktiviert.')});return}
 if(mode==='remove-trainer'){if(!confirm('Ausbilderzugang entziehen? Das bestehende Polizeikonto bleibt erhalten.'))return;await act(async()=>{await request('ausbilder/'+id,{method:'DELETE'});await load();message('Ausbilderzugang entzogen.')});return}
 if(mode==='public-material'){
   const next=btn.dataset.active!=='1';
   if(next&&!confirm('Diese Unterlage wirklich OHNE LOGIN im AuLK veröffentlichen? Nur freigegebene, nicht vertrauliche Inhalte auswählen.'))return;
   await act(async()=>{
     await request('materialien/'+id+'/freigabe',{method:'PATCH',body:JSON.stringify({public_aktiv:next})});
     await load();message(next?'Unterlage öffentlich freigegeben.':'Öffentliche Freigabe aufgehoben.');
   });return;
 }
 if(mode==='remove-material'){if(!confirm('Unterlage aus der Ausbildungsliste entfernen?'))return;await act(async()=>{await request('materialien/'+id,{method:'DELETE'});await load();message('Verknüpfung entfernt.')});}
});
shadow.addEventListener('submit',async(e)=>{
 const f=e.target;if(!f.id||!['trainerForm','traineeForm','materialForm','uploadForm'].includes(f.id))return;
 e.preventDefault();
 await act(async()=>{
  const b=formObj(f);
  if(f.id==='uploadForm'){
   const res=await fetch('/api/ausbildung/materialien/upload',{method:'POST',credentials:'same-origin',body:new FormData(f)});
   const answer=await res.json().catch(()=>({}));
   if(!res.ok){const err=new Error(answer.error||'Dateiupload fehlgeschlagen');err.status=res.status;throw err}
  }else if(f.id==='trainerForm'){
   b.kompetenzen=Array.from(f.querySelectorAll('[name=kompetenz]:checked')).map(x=>x.value);
   const id=editing.id;
   await request(id?'ausbilder/'+id:'ausbilder',{method:id?'PATCH':'POST',body:JSON.stringify(b)});
  }else if(f.id==='traineeForm'){
   if(editing.type==='trainee-edit'){
    b.revision=Number(selected.anwaerter.revision);b.rsa=f.elements.rsa.checked;
    await request('anwaerter/'+selected.anwaerter.id,{method:'PATCH',body:JSON.stringify(b)});
    selected=await request('anwaerter/'+selected.anwaerter.id);
   }else{
    b.personalnummer=b.personalnummer?Number(b.personalnummer):null;
    const created=await request('anwaerter',{method:'POST',body:JSON.stringify(b)});
    selected=await request('anwaerter/'+created.id);track=b.laufbahn;
   }
  }else await request('materialien',{method:'POST',body:JSON.stringify(b)});
  editing=null;await load();message('Änderung erfolgreich gespeichert.');
 });
});
el('#reload').addEventListener('click',()=>act(load));

load();

    return {host,refresh:load};
  }
  window.IDVAusbildung={
    laden(container){
      if(!container)return;
      if(instance&&instance.host.isConnected&&instance.host.parentElement===container){
        void instance.refresh();return;
      }
      container.replaceChildren();
      instance=create(container);
    }
  };
})();