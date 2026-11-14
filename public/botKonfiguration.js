/* Bot-Konfiguration des Polizei-Discord-Bots (Modul „botcfg“).
   Formular-Editor statt Code: Google Sheets, Kanäle & Rollen, To-do-Kanäle, SEK,
   Kategorie zuordnen und Funkbesetzung. Schema, Werte, Standardwerte und die Kanäle/
   Kategorien/Rollen der Discord-Server liefert der Bot selbst; das Panel validiert vor,
   der Bot prüft endgültig, speichert atomar (mit Vorversion) und übernimmt live.
   Zugriff: Modul „botcfg“ (Stufe 1 lesen, Stufe 2 speichern), Standard nur Administrator. */
(()=>{
 const SF=/^\d{17,20}$/;
 const QUELLE={panel:['Panel','ok'],env:['.env','warn'],standard:['Standard','']};
 const KIND_TXT={channel:'Kanal',category:'Kategorie',role:'Rolle',guild:'Server'};
 const TYP_ICON={text:'#',news:'📢',forum:'💬',voice:'🔊',stage:'🎙',media:'🖼',thread:'🧵',category:'📁',other:'#'};
 let daten=null,entwurf={},fehlerServer={},meldung='',meldungArt='',laeuft=false,offen=new Set();
 const aktiv=()=>tab==='botcfg';
 const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
 const gleich=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const feld=p=>daten.felder.find(f=>f.path===p);
 const schreiben=()=>!!daten?.schreiben&&can('botcfg',2);

 function stil(){
  if(document.getElementById('botcfgStyle'))return;
  const s=document.createElement('style');s.id='botcfgStyle';
  s.textContent=`
.bc-kopf{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:-6px 0 16px}
.bc-kopf .spacer{flex:1}
.bc-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.bc-nav a{padding:6px 11px;border:1px solid var(--line);border-radius:99px;font-size:13px;color:var(--mut);cursor:pointer;text-decoration:none}
.bc-nav a:hover{color:var(--txt);border-color:var(--acc)}
.bc-nav a .n{display:inline-block;margin-left:6px;padding:0 6px;border-radius:99px;background:var(--acc);color:#fff;font-size:11px}
.bc-gruppe{scroll-margin-top:80px}
.bc-gruppe>p.mut{margin:-6px 0 12px;font-size:13px}
.bc-sub{margin:16px 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);border-top:1px solid var(--line);padding-top:12px}
.bc-sub:first-of-type{border-top:0;padding-top:0;margin-top:4px}
.bc-felder{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:4px 18px}
.bc-feld{padding:8px 0;min-width:0}
.bc-feld.voll{grid-column:1/-1}
.bc-feld.geaendert{box-shadow:inset 3px 0 0 var(--warn);padding-left:10px}
.bc-lab{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px;color:var(--txt);font-size:13.5px;font-weight:600}
.bc-lab .tag{font-weight:500;font-size:11px}
.bc-lab .spacer{flex:1}
.bc-lab button{padding:3px 9px;font-size:12px}
.bc-hilfe{color:var(--mut);font-size:12.5px;margin:5px 0 0}
.bc-err{color:var(--bad);font-size:12.5px;margin:5px 0 0}
.bc-res{font-size:12.5px;margin:5px 0 0;color:var(--mut)}
.bc-res.warn{background:none;color:var(--warn)}
.bc-pick{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(150px,1fr);gap:8px}
.bc-pick input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.bc-feld input,.bc-feld select{padding:9px 10px}
.bc-feld input.bad,.bc-feld select.bad{border-color:var(--bad)}
.bc-liste{display:flex;flex-direction:column;gap:8px}
.bc-zeile{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start;padding:8px;border:1px solid var(--line);border-radius:9px;background:rgba(0,0,0,.12)}
.bc-zeile .bc-z-felder{display:grid;grid-template-columns:minmax(0,2fr) minmax(140px,1fr);gap:8px;min-width:0}
.bc-zeile .bc-z-felder.eins{grid-template-columns:minmax(0,1fr)}
.bc-zeile .bc-z-akt{display:flex;gap:4px}
.bc-zeile .bc-z-akt button{padding:7px 9px;line-height:1}
.bc-zeile .bc-z-err{grid-column:1/-1;margin:0}
.bc-plus{align-self:flex-start;padding:7px 12px;font-size:13px}
.bc-spalten{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 14px}
.bc-spalten .bc-feld{padding:0}
.bc-spalten .bc-lab{font-weight:500;font-size:12.5px}
.bc-spalten input{text-transform:uppercase;font-family:ui-monospace,monospace;max-width:90px}
.bc-schalter{display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--txt);margin:0}
.bc-schalter input{width:auto;transform:scale(1.25)}
.bc-leiste{position:sticky;bottom:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:16px -4px 0;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 -8px 24px rgba(0,0,0,.25)}
.bc-leiste .spacer{flex:1}
.bc-meldung{margin:0;font-size:13.5px}
.bc-meldung.ok{background:none;color:var(--ok)}.bc-meldung.bad{background:none;color:var(--bad)}.bc-meldung.warn{background:none;color:var(--warn)}
@media (max-width:640px){
 .bc-pick{grid-template-columns:1fr}
 .bc-zeile .bc-z-felder{grid-template-columns:1fr}
 .bc-leiste{margin:16px 0 0}
}`;
  document.head.appendChild(s);
 }

 /* ── Discord-Verzeichnis ── */
 function verzeichnis(){
  const v={guilds:daten?.discord?.guilds||[],kanal:new Map(),rolle:new Map(),guild:new Map()};
  for(const g of v.guilds){
   v.guild.set(g.id,g);
   const cats=new Map(g.kanaele.filter(c=>c.typ==='category').map(c=>[c.id,c.name]));
   for(const c of g.kanaele)v.kanal.set(c.id,{...c,guild:g,katName:cats.get(c.kategorie)||''});
   for(const r of g.rollen)v.rolle.set(r.id,{...r,guild:g});
  }
  return v;
 }
 let V=null;
 function aufloesen(kind,id){
  if(!id)return null;
  if(kind==='guild'){const g=V.guild.get(id);return g?{name:g.name,ok:true}:null;}
  if(kind==='role'){const r=V.rolle.get(id);return r?{name:'@'+r.name+' · '+r.guild.name,ok:true}:null;}
  const c=V.kanal.get(id);if(!c)return null;
  const istKat=c.typ==='category';
  if(kind==='category'&&!istKat)return {name:'Das ist ein Kanal, keine Kategorie: '+c.name,ok:false};
  if(kind==='channel'&&istKat)return {name:'Das ist eine Kategorie, kein Kanal: '+c.name,ok:false};
  return {name:(TYP_ICON[c.typ]||'#')+' '+c.name+(c.katName?' · '+c.katName:'')+' · '+c.guild.name,ok:true};
 }
 function optionen(kind,wert,guildId){
  const gs=V.guilds.filter(g=>!guildId||g.id===guildId);
  let html='<option value="">'+(kind==='guild'?'— Server wählen —':'— '+KIND_TXT[kind]+' wählen —')+'</option>';
  let gefunden=!wert;
  if(kind==='guild'){
   for(const g of V.guilds){const sel=g.id===wert;gefunden||=sel;html+='<option value="'+esc(g.id)+'"'+(sel?' selected':'')+'>'+esc(g.name)+'</option>';}
  }else for(const g of gs){
   html+='<optgroup label="'+esc(g.name)+'">';
   if(kind==='role'){
    for(const r of g.rollen){const sel=r.id===wert;gefunden||=sel;html+='<option value="'+esc(r.id)+'"'+(sel?' selected':'')+'>@'+esc(r.name)+'</option>';}
   }else if(kind==='category'){
    for(const c of g.kanaele.filter(c=>c.typ==='category')){const sel=c.id===wert;gefunden||=sel;html+='<option value="'+esc(c.id)+'"'+(sel?' selected':'')+'>📁 '+esc(c.name)+'</option>';}
   }else{
    const cats=new Map(g.kanaele.filter(c=>c.typ==='category').map(c=>[c.id,c.name]));
    for(const c of g.kanaele.filter(c=>c.typ!=='category')){
     const sel=c.id===wert;gefunden||=sel;
     html+='<option value="'+esc(c.id)+'"'+(sel?' selected':'')+'>'+(TYP_ICON[c.typ]||'#')+' '+esc(c.name)+(cats.get(c.kategorie)?'  ·  '+esc(cats.get(c.kategorie)):'')+'</option>';
    }
   }
   html+='</optgroup>';
  }
  if(!gefunden)html+='<option value="'+esc(wert)+'" selected>⚠ Unbekannte ID '+esc(wert)+'</option>';
  return html;
 }

 /* ── Validierung (Vorprüfung, der Bot prüft endgültig) ── */
 function pruefeWert(spec,v,optional){
  switch(spec.type){
   case 'snowflake': if(v==='')return optional?'':'Pflichtfeld';return SF.test(v)?'':'Discord-ID: 17–20 Ziffern';
   case 'text':{const s=String(v??'').trim();if(!s)return optional?'':'Pflichtfeld';
    if(spec.max&&s.length>spec.max)return 'Max. '+spec.max+' Zeichen';
    if(spec.pattern&&!new RegExp(spec.pattern).test(s))return spec.patternText||'Ungültiges Format';return '';}
   case 'url':{const s=String(v??'').trim();if(!s)return optional?'':'Pflichtfeld';try{return new URL(s).protocol==='https:'?'':'Nur https-URLs';}catch{return 'Keine gültige URL';}}
   case 'int': if(!Number.isInteger(v))return 'Ganze Zahl eingeben';if(spec.min!=null&&v<spec.min)return 'Mindestens '+spec.min;if(spec.max!=null&&v>spec.max)return 'Höchstens '+spec.max;return '';
   case 'column': return /^[A-Z]{1,3}$/.test(String(v||'').trim().toUpperCase())?'':'Spalte A–ZZZ';
   case 'bool': return '';
  }
  return '';
 }
 function pruefe(f,v){
  if(f.type!=='list')return {feld:pruefeWert(f,v,f.optional)};
  const r={feld:'',zeilen:[]};
  if(f.max&&v.length>f.max)r.feld='Höchstens '+f.max+' Einträge';
  v.forEach((it,i)=>{
   let e='';
   if(f.item.fields){for(const s of f.item.fields){const x=pruefeWert(s,it[s.key],!!s.optional);if(x){e=s.label+': '+x;break;}}}
   else e=pruefeWert(f.item,it,false);
   r.zeilen[i]=e;
  });
  if(f.unique){
   const keys=v.map(it=>typeof f.unique==='string'?it[f.unique]:it);
   keys.forEach((k,i)=>{if(k&&keys.indexOf(k)!==i&&!r.zeilen[i])r.zeilen[i]='Doppelt';});
  }
  return r;
 }
 function alleFehler(){
  const out={};
  for(const f of daten.felder){
   const r=pruefe(f,entwurf[f.path]);
   if(r.feld||(r.zeilen||[]).some(Boolean))out[f.path]=r;
  }
  const s=entwurf['sheets.dataStartRow'],e=entwurf['sheets.dataEndRow'];
  if(Number.isInteger(s)&&Number.isInteger(e)&&e<s)out['sheets.dataEndRow']={feld:'Muss ≥ erste Datenzeile sein',zeilen:[]};
  return out;
 }
 const geaenderte=()=>daten.felder.filter(f=>!gleich(entwurf[f.path],daten.werte[f.path].wert)).map(f=>f.path);

 /* ── Rendering ── */
 function picker(kind,wert,attrs,guildId,disabled){
  const res=aufloesen(kind,wert);
  const unbekannt=wert&&SF.test(wert)&&!res;
  return '<div class="bc-pick"><select '+attrs+' data-bc-rolle="select" aria-label="'+esc(KIND_TXT[kind])+' auswählen"'+(disabled?' disabled':'')+(unbekannt?' class="bad"':'')+'>'+optionen(kind,wert,guildId)+'</select>'+
   '<input '+attrs+' data-bc-rolle="id" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="ID manuell" value="'+esc(wert||'')+'"'+(disabled?' disabled':'')+' aria-label="'+esc(KIND_TXT[kind])+'-ID"></div>'+
   (wert?(res?'<p class="bc-res'+(res.ok?'':' warn')+'">'+(res.ok?'✓ ':'⚠ ')+esc(res.name)+'</p>':
    SF.test(wert)?'<p class="bc-res warn">⚠ ID auf den Discord-Servern des Bots nicht gefunden (gelöscht oder keine Rechte?). Wird trotzdem gespeichert.</p>':''):'');
 }
 function skalar(f,spec,wert,attrs,disabled){
  const dis=disabled?' disabled':'';
  switch(spec.type){
   case 'snowflake': return picker(spec.kind,wert,attrs,spec.guildFrom?entwurf[spec.guildFrom]:(f.guildFrom?entwurf[f.guildFrom]:''),disabled);
   case 'int': return '<input type="number" step="1"'+(spec.min!=null?' min="'+spec.min+'"':'')+(spec.max!=null?' max="'+spec.max+'"':'')+' '+attrs+' data-bc-typ="int" value="'+esc(String(wert??''))+'"'+dis+'>';
   case 'column': return '<input '+attrs+' data-bc-typ="column" maxlength="3" autocomplete="off" spellcheck="false" value="'+esc(wert||'')+'"'+dis+'>';
   case 'bool': return '<label class="bc-schalter"><input type="checkbox" '+attrs+' data-bc-typ="bool"'+(wert?' checked':'')+dis+'> <span>'+(wert?'Eingeschaltet':'Ausgeschaltet')+'</span></label>';
   case 'url': return '<input type="url" '+attrs+' autocomplete="off" spellcheck="false" placeholder="https://…" value="'+esc(wert||'')+'"'+dis+'>';
   default: return '<input '+attrs+' autocomplete="off"'+(spec.max?' maxlength="'+spec.max+'"':'')+' value="'+esc(wert??'')+'"'+dis+(spec.key==='name'||spec.key==='label'?' placeholder="'+esc(spec.label)+'"':'')+'>';
  }
 }
 function feldHtml(f,fehler,kompakt){
  const v=entwurf[f.path],w=daten.werte[f.path];
  const dis=!schreiben();
  const geaendert=!gleich(v,w.wert);
  const istStandard=gleich(v,w.standard);
  const [ql,qc]=QUELLE[w.quelle]||[w.quelle,''];
  const err=fehlerServer[f.path]||fehler?.feld||'';
  const a='data-bc-pfad="'+esc(f.path)+'"';
  let inner='';
  if(f.type==='list'){
   const zeilen=(v||[]).map((it,i)=>{
    const za=a+' data-bc-i="'+i+'"';
    const felder=f.item.fields?f.item.fields.map(s=>'<div>'+skalar(f,s,it[s.key],za+' data-bc-key="'+esc(s.key)+'"',dis)+'</div>').join(''):
     '<div>'+skalar(f,f.item,it,za,dis)+'</div>';
    const ze=fehler?.zeilen?.[i];
    return '<div class="bc-zeile"><div class="bc-z-felder'+(f.item.fields?'':' eins')+'">'+felder+'</div>'+
     (dis?'':'<div class="bc-z-akt">'+
      '<button type="button" title="Nach oben" aria-label="Nach oben" data-bc-move="-1" '+za+(i===0?' disabled':'')+'>↑</button>'+
      '<button type="button" title="Nach unten" aria-label="Nach unten" data-bc-move="1" '+za+(i===v.length-1?' disabled':'')+'>↓</button>'+
      '<button type="button" title="Entfernen" aria-label="Eintrag entfernen" data-bc-del '+za+'>✕</button></div>')+
     (ze?'<p class="bc-err bc-z-err">'+esc(ze)+'</p>':'')+'</div>';
   }).join('');
   inner='<div class="bc-liste">'+(zeilen||'<p class="mut" style="margin:0">Keine Einträge.</p>')+
    (dis||(f.max&&v.length>=f.max)?'':'<button type="button" class="bc-plus" data-bc-add '+a+'>+ '+(f.item.fields?'Eintrag':KIND_TXT[f.item.kind]||'Eintrag')+' hinzufügen</button>')+'</div>';
  }else inner=skalar(f,f,v,a,dis);
  return '<div class="bc-feld'+(f.type==='list'&&!kompakt?' voll':'')+(geaendert?' geaendert':'')+'" id="bc-'+esc(f.path.replace(/\./g,'-'))+'">'+
   '<div class="bc-lab"><span>'+esc(f.label)+'</span>'+(ql?'<span class="tag '+qc+'" title="Aktuelle Quelle des gespeicherten Werts">'+esc(ql)+'</span>':'')+
   (geaendert?'<span class="tag warn">geändert</span>':'')+
   (f.apply==='restart'?'<span class="tag" title="Startnachricht in neuem Kanal erst nach Neustart">Neustart</span>':'')+
   '<span class="spacer"></span>'+
   (!dis&&!istStandard?'<button type="button" data-bc-std '+a+' title="Auf Standardwert zurücksetzen">Standard</button>':'')+
   (!dis&&geaendert?'<button type="button" data-bc-undo '+a+' title="Änderung verwerfen">↺</button>':'')+'</div>'+
   inner+
   (err?'<p class="bc-err">'+esc(err)+'</p>':'')+
   (f.help&&!kompakt?'<p class="bc-hilfe">'+esc(f.help)+'</p>':'')+
   (!istStandard&&f.type!=='list'&&f.type!=='bool'?'<p class="bc-hilfe">Standard: <code>'+esc(String(w.standard??'–')||'leer')+'</code></p>':'')+
   '</div>';
 }
 function zeichnen(){
  if(!aktiv()||!daten)return;
  stil();V=verzeichnis();
  const fehler=alleFehler();
  const geaendert=geaenderte();
  const gruppen=daten.gruppen.map(g=>{
   const felder=daten.felder.filter(f=>f.group===g.id);
   if(!felder.length)return '';
   let html='',sub=null,spalten=[];
   const flush=()=>{if(spalten.length){html+='<div class="bc-spalten">'+spalten.join('')+'</div>';spalten=[];}};
   for(const f of felder){
    if((f.unterbereich||null)!==sub){flush();if(html)html+='</div>';sub=f.unterbereich||null;html+=(sub?'<h4 class="bc-sub">'+esc(sub)+'</h4>':'')+'<div class="bc-felder">';}
    if(f.type==='column'){spalten.push(feldHtml(f,fehler[f.path],true));continue;}
    flush();html+=feldHtml(f,fehler[f.path],false);
   }
   flush();html+='</div>';
   const n=felder.filter(f=>geaendert.includes(f.path)).length;
   return '<section class="box bc-gruppe" id="bc-g-'+esc(g.id)+'"><h3>'+esc(g.titel)+(n?' <span class="tag warn">'+n+' geändert</span>':'')+'</h3><p class="mut">'+esc(g.text||'')+'</p>'+html+'</section>';
  }).join('');
  const nav='<nav class="bc-nav" aria-label="Bereiche">'+daten.gruppen.map(g=>{
   const n=daten.felder.filter(f=>f.group===g.id&&geaendert.includes(f.path)).length;
   return '<a data-bc-goto="'+esc(g.id)+'">'+esc(g.titel)+(n?'<span class="n">'+n+'</span>':'')+'</a>';}).join('')+'</nav>';
  const von=daten.geaendertVon;
  const stand=daten.rev?'Version '+daten.rev+' · zuletzt geändert '+(daten.geaendertAm?new Date(daten.geaendertAm).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'–')+(von?.name?' von '+esc(von.name):''):'Noch keine Änderungen über das Panel – es gelten die Standardwerte aus dem Bot-Code.';
  const bereit=daten.discord?.bereit;
  const pos=window.scrollY;
  $('#inhalt').innerHTML='<h1>Bot-Konfiguration</h1>'+
   '<div class="bc-kopf"><span class="mut">Polizei-Discord-Bot · '+stand+'</span><span class="spacer"></span>'+
   (bereit?'<span class="tag ok">Bot verbunden · '+V.guilds.length+' Server</span>':'<span class="tag bad">Bot nicht mit Discord verbunden – Namen werden nicht aufgelöst</span>')+
   '<button type="button" data-bc-reload'+(laeuft?' disabled':'')+'>Neu laden</button></div>'+
   (schreiben()?'':'<p class="mut">Nur Lesen – zum Ändern fehlt die Berechtigung „Bot-Konfiguration: Bearbeiten“.</p>')+
   nav+gruppen+
   leisteHtml(geaendert,Object.keys(fehler).length);
  window.scrollTo(0,pos);
 }

 function leisteHtml(geaendert,nFehler){
  if(!schreiben())return meldung?'<p class="bc-meldung '+meldungArt+'">'+esc(meldung)+'</p>':'';
  return '<div class="bc-leiste" role="region" aria-label="Speichern">'+
    '<p class="bc-meldung '+meldungArt+'" role="status" aria-live="polite">'+(meldung?esc(meldung):geaendert.length?geaendert.length+' ungespeicherte Änderung(en)'+(nFehler?' · '+nFehler+' Feld(er) mit Fehler':''):'Alle Änderungen gespeichert.')+'</p>'+
    '<span class="spacer"></span>'+
    '<button type="button" data-bc-verwerfen'+(geaendert.length&&!laeuft?'':' disabled')+'>Verwerfen</button>'+
    '<button type="button" class="p" data-bc-save'+(geaendert.length&&!nFehler&&!laeuft?'':' disabled')+'>'+(laeuft?'Speichert …':'Speichern'+(geaendert.length?' ('+geaendert.length+')':''))+'</button></div>';
 }
 /* Beim Tippen nicht alles neu zeichnen (Fokus/Klicks bleiben erhalten): nur Feldfehler und Leiste. */
 function teilUpdate(el){
  const p=el.dataset.bcPfad,f=feld(p),box=el.closest('.bc-feld');
  const fehler=alleFehler();
  if(box){
   box.classList.toggle('geaendert',!gleich(entwurf[p],daten.werte[p].wert));
   const r=fehler[p];let txt=r?.feld||'';
   if(f.type==='list'&&el.dataset.bcI!=null)txt=r?.zeilen?.[+el.dataset.bcI]||r?.feld||'';
   el.classList.toggle('bad',!!txt);
   let pe=box.querySelector('.bc-err.live');
   if(txt){if(!pe){pe=document.createElement('p');pe.className='bc-err live';el.insertAdjacentElement('afterend',pe);}pe.textContent=txt;}
   else pe?.remove();
  }
  const l=document.querySelector('.bc-leiste');
  if(l)l.outerHTML=leisteHtml(geaenderte(),Object.keys(fehler).length);
 }

 async function laden(){
  if(!can('botcfg')){$('#inhalt').innerHTML='<h1>Bot-Konfiguration</h1><p>Für die Bot-Konfiguration fehlt die Berechtigung.</p>';return;}
  const dirty=daten&&geaenderte().length;
  if(daten&&dirty){zeichnen();return;}
  if(!daten)$('#inhalt').innerHTML='<h1>Bot-Konfiguration</h1><p class="mut">Lade Konfiguration vom Polizei-Bot …</p>';
  try{
   const r=await api('/botcfg');
   if(!aktiv())return;
   uebernehmen(r);
   zeichnen();
  }catch(e){
   if(aktiv())$('#inhalt').innerHTML='<h1>Bot-Konfiguration</h1><p class="fehler">Konfiguration konnte nicht geladen werden: '+esc(e.message)+'</p><p><button type="button" data-bc-reload>Erneut versuchen</button></p>';
  }
 }
 function uebernehmen(r){
  daten=r;fehlerServer={};
  entwurf=Object.fromEntries(r.felder.map(f=>[f.path,clone(r.werte[f.path].wert)]));
 }
 async function speichern(){
  if(!schreiben()||laeuft)return;
  const pfade=geaenderte();if(!pfade.length)return;
  if(Object.keys(alleFehler()).length)return;
  const werte={};
  for(const p of pfade)werte[p]=gleich(entwurf[p],daten.werte[p].standard)?null:entwurf[p];
  const riskant=pfade.filter(p=>feld(p).apply==='restart'||p==='sek.guildId'||p==='funkbesetzung.enabled');
  if(riskant.length&&!confirm('Folgende Änderungen haben sichtbare Auswirkungen in Discord:\n\n'+riskant.map(p=>'• '+feld(p).label).join('\n')+
   '\n\n(z. B. neue Steuerungs-/Spind-Nachrichten beim nächsten Neustart, /sek wird auf einem anderen Server registriert oder Besetzungsübersichten werden wieder gepostet)\n\nTrotzdem speichern?'))return;
  laeuft=true;meldung='Speichert …';meldungArt='';fehlerServer={};zeichnen();
  try{
   const headers={'Content-Type':'application/json'};
   if(window.IDVLive?.clientId)headers['X-IDV-Client']=window.IDVLive.clientId;
   const res=await fetch('/api/botcfg',{method:'PUT',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify({werte,rev:daten.rev})});
   const r=await res.json().catch(()=>({}));
   if(!res.ok){
    fehlerServer=r.fehler&&typeof r.fehler==='object'?r.fehler:{};
    meldung='Nicht gespeichert: '+(r.error||'Serverfehler (HTTP '+res.status+')')+(res.status===412?' – „Neu laden“ holt den aktuellen Stand (deine Änderungen gehen dabei verloren).':'');
    meldungArt='bad';
   }else{
    const labels=(r.geaendert||[]).map(p=>r.felder.find(f=>f.path===p)?.label||p);
    uebernehmen(r);
    meldung=labels.length?'Gespeichert und im Bot übernommen: '+labels.join(', ')+'.':'Keine Änderung nötig.';
    if(r.neustartHinweis?.length)meldung+=' Hinweis: Neue Start-Nachrichten (Steuerung/Spinde) legt der Bot erst beim nächsten Neustart an.';
    if(r.warnungen?.length)meldung+=' Achtung: '+r.warnungen.join(' ');
    meldungArt=r.warnungen?.length?'warn':'ok';
   }
  }catch(e){meldung='Nicht gespeichert: '+e.message;meldungArt='bad';}
  laeuft=false;zeichnen();
 }

 /* ── Eingaben ── */
 function setze(el,wert){
  const p=el.dataset.bcPfad,f=feld(p);if(!f)return;
  if(f.type==='list'){
   const i=+el.dataset.bcI,key=el.dataset.bcKey;
   const liste=entwurf[p];
   if(key)liste[i]={...liste[i],[key]:wert};else liste[i]=wert;
  }else entwurf[p]=wert;
  meldung='';meldungArt='';delete fehlerServer[p];
 }
 function wertAus(el){
  const typ=el.dataset.bcTyp;
  if(typ==='bool')return el.checked;
  if(typ==='int'){const n=Number(el.value);return el.value.trim()===''||!Number.isFinite(n)?el.value:Math.trunc(n)===n?n:el.value;}
  if(typ==='column')return el.value.trim().toUpperCase();
  if(el.dataset.bcRolle==='id')return el.value.replace(/\s+/g,'');
  return el.value;
 }
 function neuerEintrag(f){
  if(f.item.fields)return Object.fromEntries(f.item.fields.map(s=>[s.key,'']));
  return '';
 }
 document.addEventListener('change',e=>{
  if(!aktiv())return;
  const el=e.target.closest('[data-bc-pfad]');if(!el)return;
  if(el.tagName==='SELECT'||el.type==='checkbox'){setze(el,wertAus(el));zeichnen();}
 });
 document.addEventListener('input',e=>{
  if(!aktiv())return;
  const el=e.target.closest('input[data-bc-pfad]');if(!el||el.type==='checkbox')return;
  setze(el,wertAus(el));
  const v=el.value.trim();
  if(el.dataset.bcRolle==='id'&&(SF.test(v)||v==='')){
   // vollständige ID: neu zeichnen, damit Auswahl und aufgelöster Name/Warnung erscheinen
   const sel={p:el.dataset.bcPfad,i:el.dataset.bcI,k:el.dataset.bcKey,pos:el.selectionStart};
   zeichnen();
   const q='input[data-bc-rolle="id"][data-bc-pfad="'+CSS.escape(sel.p)+'"]'+(sel.i!=null?'[data-bc-i="'+sel.i+'"]':'')+(sel.k?'[data-bc-key="'+CSS.escape(sel.k)+'"]':'');
   const n=document.querySelector(q);if(n){n.focus();try{n.setSelectionRange(sel.pos,sel.pos);}catch{}}
   return;
  }
  teilUpdate(el);
 });
 document.addEventListener('click',e=>{
  if(!aktiv())return;
  const t=e.target;
  if(t.closest('[data-bc-reload]')){
   if(daten&&geaenderte().length&&!confirm('Ungespeicherte Änderungen verwerfen und neu laden?'))return;
   daten=null;meldung='';laden();return;
  }
  const go=t.closest('[data-bc-goto]');
  if(go){document.getElementById('bc-g-'+go.dataset.bcGoto)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(!daten||!schreiben())return;
  if(t.closest('[data-bc-save]')){speichern();return;}
  if(t.closest('[data-bc-verwerfen]')){if(confirm('Alle ungespeicherten Änderungen verwerfen?')){uebernehmen(daten);meldung='';zeichnen();}return;}
  const b=t.closest('[data-bc-pfad]');if(!b||b.tagName!=='BUTTON')return;
  const p=b.dataset.bcPfad,f=feld(p);if(!f)return;
  if(b.hasAttribute('data-bc-std')){entwurf[p]=clone(daten.werte[p].standard);}
  else if(b.hasAttribute('data-bc-undo')){entwurf[p]=clone(daten.werte[p].wert);}
  else if(b.hasAttribute('data-bc-add')){entwurf[p]=[...(entwurf[p]||[]),neuerEintrag(f)];}
  else if(b.hasAttribute('data-bc-del')){const i=+b.dataset.bcI;entwurf[p]=entwurf[p].filter((_,j)=>j!==i);}
  else if(b.hasAttribute('data-bc-move')){
   const i=+b.dataset.bcI,j=i+(+b.dataset.bcMove),l=[...entwurf[p]];
   if(j<0||j>=l.length)return;[l[i],l[j]]=[l[j],l[i]];entwurf[p]=l;
  }else return;
  meldung='';meldungArt='';delete fehlerServer[p];zeichnen();
 });
 window.addEventListener('beforeunload',e=>{if(daten&&geaenderte().length){e.preventDefault();e.returnValue='';}});
 window.IDVBotKonfiguration={laden};
})();
