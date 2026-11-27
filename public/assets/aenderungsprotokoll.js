(()=>{'use strict';
const LIMIT=100;
const sections=[['alle','Alle Änderungen',null],['personal','Personaländerungen','/personal-audit'],['system','Systemmeldungen','/log'],['vergleich','Aktenänderungen (alle Bereiche)','/aenderungsvergleich']];
const state={view:'aktuell',kind:'personal',search:'',pages:{}};
const sources=sections.filter(s=>s[2]);
const pageKey=()=>state.view+'|'+state.kind+'|'+state.search;
const E=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=String(text);if(cls)e.className=cls;return e;};
const fields={vorname:'Vorname',nachname:'Nachname',dienstgrad:'Dienstgrad',status:'Status',gruppe:'Mitarbeitergruppe',beschaeftigungsart:'Beschäftigungsart',eintrittsdatum:'Dienstantritt',letzte_befoerderung:'Letzte Beförderung',naechste_befoerderung:'Nächste Beförderung',por_status:'POR-Status',bemerkung:'Bemerkung',werte:'Qualifikationen',slots:'Maßnahmen',aufgaben:'Aufgaben',rsa:'RSA',inhalt:'Inhalt',titel:'Titel',grund:'Grund',personalnummer:'Dienstnummer',waffenschein:'Waffenschein',spind:'Spind',urlaub_von:'Urlaub von',urlaub_bis:'Urlaub bis'};
const scopes={personal:'Personal',kuendigungen:'Kündigungen',disziplin:'Disziplin',sonderfunktionen:'Sonderfunktionen',checklisten:'Checklisten',textbausteine:'Textbausteine',routine:'Routine',sonderzahlungen:'Sonderzahlungen'};
const fmt=v=>v==null||v===''?'–':typeof v==='boolean'?(v?'Ja':'Nein'):typeof v==='object'?JSON.stringify(v,null,2):String(v);
const fieldLabel=k=>fields[k]||String(k).replace(/_/g,' ');
function parseTime(v){const s=String(v??'');return new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(s)?s.replace(' ','T').replace(/(\.\d{3})\d+/,'$1')+'Z':s);}
function shortValue(v){
 if(v!==null&&typeof v==='object')return null;
 const s=fmt(v);return s.length<=65&&!/[\r\n]/.test(s)?s:null;
}
function actionLabel(s){return ({insert:'Angelegt',add:'Angelegt',create:'Angelegt',update:'Geändert',edit:'Geändert',delete:'Gelöscht',remove:'Gelöscht',login:'Angemeldet',logout:'Abgemeldet'})[String(s||'').toLowerCase()]||String(s||'Vorgang');}
function describeChanges(changes){
 if(!changes.length)return 'Keine Einzelheiten gespeichert';
 const items=changes.slice(0,2).map(x=>{
  const label=fieldLabel(x.feld),old=shortValue(x.alt),next=shortValue(x.neu);
  return old!==null&&next!==null?label+': '+old+' → '+next:label+' geändert';
 });
 if(changes.length>2)items.push('+'+(changes.length-2)+' weitere Änderungen');
 return items.join(' · ');
}
function normalize(row,kind){
 const changes=kind==='personal'?Object.entries(row.aenderungen||{}).map(([feld,v])=>({feld,alt:v?.alt,neu:v?.neu})):kind==='vergleich'&&Array.isArray(row.details)?row.details:[];
 const dt=parseTime(row.zeit),valid=!Number.isNaN(dt.getTime());
 const group=valid?dt.toLocaleDateString('de-DE',{dateStyle:'full',timeZone:'Europe/Berlin'}):'Ohne gültiges Datum';
 const day=valid?dt.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Berlin'}):'–';
 const time=valid?dt.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Berlin'}):String(row.zeit||'–');
 const category=kind==='system'?actionLabel(row.art):kind==='personal'?'Personal':(scopes[row.bereich]||row.bereich||'Aktenänderung');
 const title=kind==='system'?String(row.aktion||'Systemereignis'):kind==='personal'?'Dienstnummer '+String(row.personalnummer??'–'):category+' · '+actionLabel(row.vorgang)+(row.personalnummer!=null?' · Dienstnummer '+row.personalnummer:'');
 const summary=kind==='system'?title:describeChanges(changes);
 return {group,day,time,category,title,summary,actor:!row.benutzer||row.benutzer==='–'?'Nicht zugeordnet':row.benutzer,changes,kind,personalnummer:row.personalnummer,rawOperation:row.vorgang,rawCategory:row.bereich,rawKey:row.schluessel};
}
// Merge independently paginated, already authorized journals without dropping entries.
async function mergedPage(readPage,positions){
 const cursor=positions.slice(),cache=new Map();
 async function peek(i){
  const n=cursor[i],page=Math.floor(n/LIMIT)+1,offset=n%LIMIT,key=i+'|'+page;
  if(!cache.has(key))cache.set(key,Promise.resolve(readPage(sources[i][2],page)));
  const data=await cache.get(key);
  if(!Array.isArray(data))throw Error('Ungültige Protokollantwort');
  return offset<Math.min(data.length,LIMIT)?data[offset]:null;
 }
 function newest(a,b){
  const ta=parseTime(a.zeit).getTime(),tb=parseTime(b.zeit).getTime();
  return (Number.isNaN(ta)?-Infinity:ta)>(Number.isNaN(tb)?-Infinity:tb);
 }
 let heads=await Promise.all(sources.map((_,i)=>peek(i))),rows=[];
 while(rows.length<LIMIT){
  let pick=-1;
  for(let i=0;i<heads.length;i++)if(heads[i]&&(pick<0||newest(heads[i],heads[pick])))pick=i;
  if(pick<0)break;
  rows.push(normalize(heads[pick],sources[pick][0]));
  cursor[pick]++;
  // The 101st row is a lookahead, not part of this source page.
  const prevPage=Math.floor((cursor[pick]-1)/LIMIT)+1;
  const previous=await cache.get(pick+'|'+prevPage);
  heads[pick]=cursor[pick]%LIMIT===0&&previous.length<=LIMIT?null:await peek(pick);
 }
 return {rows,more:heads.some(Boolean),positions:cursor};
}
function button(label,fn,cls){const b=E('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;}
function cell(row,content,cls){const td=E('td',null,cls);if(content&&typeof content==='object')td.append(content);else td.textContent=content??'–';row.append(td);return td;}
function detailTable(item){
 const w=E('div',null,'pl-detail');
 if(item.kind==='vergleich')w.append(E('p','Datensatz: '+String(item.rawKey??'–')+' · '+String(item.rawOperation??'–'),'pl-muted'));
 if(!item.changes.length){w.append(E('p','Keine Feldwerte gespeichert.','pl-muted'));return w;}
 const t=E('table',null,'pl-diff-table'),head=E('thead'),hr=E('tr');for(const h of ['Geändertes Feld','Vorher','Nachher']){const th=E('th',h);th.scope='col';hr.append(th);}head.append(hr);t.append(head);
 const body=E('tbody');for(const x of item.changes){const r=E('tr');cell(r,fieldLabel(x.feld));cell(r,E('pre',fmt(x.alt)),'pl-old');cell(r,E('pre',fmt(x.neu)),'pl-new');body.append(r);}t.append(body);w.append(t);return w;
}
function renderTable(items,combined=false){
 const wrap=E('div',null,'pl-table-wrap'),table=E('table',null,'pl-table'),head=E('thead'),hr=E('tr');
 for(const h of ['Datum / Uhrzeit','Bearbeiter','Was wurde geändert?','Details']){const th=E('th',h);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
 const body=E('tbody');for(const item of items){
  const row=E('tr',null,'pl-record'),when=E('div',null,'pl-when');when.append(E('span',item.day),E('small',item.time));
  cell(row,when,'pl-date');cell(row,item.actor,'pl-actor');
  const desc=E('div',null,'pl-desc');
  if(item.kind!=='system')desc.append(E('strong',item.title),E('span',item.summary));
  else desc.append(E('span',item.title),E('small',item.category));
  if(combined)desc.append(E('small',({personal:'Personaländerung',system:'Systemmeldung',vergleich:'Aktenänderung'})[item.kind]));
  cell(row,desc,'pl-action');
  if(item.kind==='system'){cell(row,'–','pl-muted');body.append(row);continue;}
  const extra=E('tr',null,'pl-detail-row'),td=E('td');td.colSpan=4;td.append(detailTable(item));extra.append(td);extra.hidden=true;
  const b=button('Ansehen',()=>{extra.hidden=!extra.hidden;b.textContent=extra.hidden?'Ansehen':'Schließen';b.setAttribute('aria-expanded',String(!extra.hidden));row.classList.toggle('pl-selected',!extra.hidden);},'pl-detail-button');b.setAttribute('aria-expanded','false');
  cell(row,b,'pl-actions');body.append(row,extra);
 }
 table.append(body);wrap.append(table);return wrap;
}
const css='.pl{display:grid;gap:14px;min-width:0}.pl h1,.pl p{margin:0}.pl-muted{font-size:12px;color:var(--mut,#9aa9bd);line-height:1.55}.pl-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.pl-head h1{margin-bottom:5px}.pl-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;border:1px solid var(--border,#344458);background:var(--panel,#172332);padding:12px;border-radius:9px}.pl-toolbar label{display:grid;gap:5px;font-size:12px;color:var(--mut,#9aa9bd)}.pl-toolbar select,.pl-toolbar input{width:100%;min-height:36px}.pl-toolbar form{display:flex;gap:7px;align-items:end;flex:1;min-width:220px}.pl-toolbar form label{flex:1}.pl-toolbar button,.pl-head button,.pl-pager button,.pl-detail-button{font-size:12px;white-space:nowrap}.pl-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.pl-pager>span{margin-right:auto}.pl-table-wrap{overflow-x:auto;border:1px solid var(--border,#344458);background:var(--panel,#172332);border-radius:9px}.pl-table,.pl-diff-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}.pl-table th,.pl-table td,.pl-diff-table th,.pl-diff-table td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border,#344458);overflow-wrap:anywhere}.pl-table thead th,.pl-diff-table thead th{font-weight:600;background:color-mix(in srgb,var(--accent,#73b5f5) 7%,var(--panel,#172332));color:var(--mut,#9aa9bd);font-size:12px}.pl-table th:nth-child(1){width:136px}.pl-table th:nth-child(2){width:175px}.pl-table th:nth-child(4){width:100px}.pl-table tbody tr:last-child td{border-bottom:0}.pl-record:hover,.pl-selected{background:color-mix(in srgb,var(--accent,#73b5f5) 5%,transparent)}.pl-when,.pl-desc{display:grid;gap:4px;line-height:1.45}.pl-when{font-variant-numeric:tabular-nums}.pl-when small,.pl-desc small{color:var(--mut,#9aa9bd);font-size:11px}.pl-desc strong{font-size:13px;font-weight:600}.pl-desc span{white-space:pre-wrap;overflow-wrap:anywhere}.pl-detail-button{padding:6px 9px;min-height:30px}.pl-detail-row[hidden]{display:none!important}.pl-detail-row>td{padding:12px;background:color-mix(in srgb,var(--accent,#73b5f5) 4%,var(--panel,#172332))}.pl-detail{display:grid;gap:8px}.pl-diff-table th:first-child{width:25%}.pl-diff-table pre{margin:0;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;max-height:250px;overflow:auto}.pl-old{border-left:2px solid #ed8a87;color:var(--text,#f1f5f9)}.pl-new{border-left:2px solid #39bda4;color:var(--text,#f1f5f9)}.pl-empty{padding:22px;text-align:center;border:1px dashed var(--border,#344458);border-radius:8px;color:var(--mut,#9aa9bd)}@media(max-width:750px){.pl-table{min-width:610px}.pl-table th:nth-child(1){width:110px}.pl-table th:nth-child(2){width:120px}.pl-table th:nth-child(4){width:90px}.pl-toolbar form{min-width:100%}}';
let mount=null,version=0;
async function open(container,api,stillHere){
 let checkpoints=new Map();
 function reset(){checkpoints=new Map();state.pages[pageKey()]=1;}
 if(state.kind==='alle')reset();
 const root=E('div',null,'pl');mount=root;container.replaceChildren(root);const style=E('style',css),head=E('div',null,'pl-head'),intro=E('div');intro.append(E('h1','Änderungsprotokoll'),E('p','Wer hat wann was geändert?','pl-muted'));head.append(intro,button('Aktualisieren',()=>{if(state.kind==='alle')reset();load();}));
 const toolbar=E('div',null,'pl-toolbar'),categoryLabel=E('label','Bereich'),category=E('select'),dateLabel=E('label','Zeitraum'),view=E('select');
 for(const [id,label] of sections){const o=E('option',label);o.value=id;category.append(o);}category.value=state.kind;categoryLabel.append(category);
 for(const [id,label] of [['alle','Gesamter Zeitraum'],['aktuell','Letzte 3 Tage'],['archiv','Ältere Einträge (Archiv)']]){const o=E('option',label);o.value=id;view.append(o);}view.value=state.view;dateLabel.append(view);
 const form=E('form'),searchLabel=E('label','Suche'),input=E('input'),submit=E('button','Suchen');submit.type='submit';input.type='search';input.placeholder='Name, Dienstnummer, Änderung …';input.maxLength=100;input.value=state.search;searchLabel.append(input);form.append(searchLabel,submit,button('Leeren',()=>{input.value='';state.search='';reset();load();}));
 form.addEventListener('submit',e=>{e.preventDefault();state.search=input.value.trim();reset();load();});category.addEventListener('change',()=>{state.kind=category.value;if(state.kind==='alle'){state.view='alle';view.value='alle';state.search='';input.value='';}reset();load();});view.addEventListener('change',()=>{state.view=view.value;reset();load();});
 toolbar.append(categoryLabel,dateLabel,form);const status=E('p',null,'pl-muted'),list=E('div'),pager=E('div',null,'pl-pager');status.setAttribute('aria-live','polite');root.append(style,head,toolbar,status,list,pager);
 async function load(){
  const seq=++version,kind=state.kind,selectedView=state.view,key=pageKey(),page=state.pages[key]||1;
  status.textContent='Protokoll wird geladen …';list.replaceChildren();pager.replaceChildren();
  try{
   const search=state.search;
   const readPage=(endpoint,n)=>api(endpoint+'?'+new URLSearchParams({ansicht:selectedView,seite:String(n),suche:search}).toString());
   let rows,more;
   if(kind==='alle'){
    const positions=page===1?sources.map(()=>0):checkpoints.get(page);
    if(!positions)throw Error('Bitte das Protokoll aktualisieren.');
    const merged=await mergedPage(readPage,positions);
    if(!stillHere()||mount!==root||seq!==version)return;
    rows=merged.rows;more=merged.more;checkpoints.set(page+1,merged.positions);
   }else{
    const data=await readPage(sections.find(s=>s[0]===kind)[2],page);
    if(!stillHere()||mount!==root||seq!==version)return;
    if(!Array.isArray(data))throw Error('Ungültige Protokollantwort');
    rows=data.slice(0,LIMIT).map(r=>normalize(r,kind));more=data.length>LIMIT;
   }
   status.textContent=rows.length+' Einträge auf dieser Seite · Neueste zuerst'+(state.search?' · Suche: '+state.search:'')+(kind==='vergleich'?' · Technisches Änderungsjournal aller berechtigten Aktenbereiche':'');
   list.append(rows.length?renderTable(rows,kind==='alle'):E('div','Keine Einträge für diese Auswahl.','pl-empty'));
   const prev=button('← Zurück',()=>{state.pages[key]=Math.max(1,page-1);load();});prev.disabled=page<=1;const next=button('Weiter →',()=>{state.pages[key]=page+1;load();});next.disabled=!more;pager.append(E('span','Seite '+page,'pl-muted'),prev,next);
  }catch(e){if(stillHere()&&mount===root&&seq===version){status.textContent='Laden fehlgeschlagen: '+e.message;list.replaceChildren(button('Erneut versuchen',()=>load()));}}
 }
 await load();
}
window.IDVProtokoll={open,normalize,renderTable,mergedPage};
})();