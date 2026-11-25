/* Native Prüfungszentrum; secrets and solution keys never stored in browser storage. */
(()=>{'use strict';
const root='/api/ausbildung/pruefungen';
const states={bereit:'Link erstellt',laufend:'In Bearbeitung',abgegeben:'Erstkorrektur offen',erstkorrigiert:'Zweitkorrektur offen',zweitkorrigiert:'Freigabe offen',freigegeben:'Freigegeben',annulliert:'Annulliert'};
const kinds={pm:'PM Theorie',pk:'PK Prüfung',dgl:'DGL Theorie',praxis:'PM Praxis'};
const node=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
const btn=(txt,fn,cls='p')=>{const b=node('button',txt,cls);b.type='button';b.onclick=fn;return b;};
const field=(parent,label,input)=>{const l=node('label',label);l.style.display='block';l.style.margin='10px 0 5px';l.append(input);input.style.display='block';input.style.width='100%';parent.append(l);return input;};
const select=(entries)=>{const s=node('select');for(const [v,t] of entries){const o=node('option',t);o.value=v;s.append(o)}return s;};
const num=(min,max,step='1')=>{const i=node('input');i.type='number';i.min=min;i.max=max;i.step=step;i.required=true;return i;};
const text=(ph='')=>{const i=node('input');i.placeholder=ph;return i;};
const area=(ph='')=>{const t=node('textarea');t.placeholder=ph;t.rows=4;t.style.width='100%';return t;};
const card=(title)=>{const s=node('section',undefined,'box');s.style.marginBottom='14px';s.append(node('h3',title));return s;};
const EXAM_FILTERS={running:['bereit','laufend'],first:['abgegeben'],second:['erstkorrigiert'],release:['zweitkorrigiert'],archive:['freigegeben','annulliert']};
function examMatchesView(p,view){return (view!=='practice'||p.art==='praxis')&&(!EXAM_FILTERS[view]||EXAM_FILTERS[view].includes(p.status));}
const EXAM_VIEWS={practice:['PM-Praxisprüfung','Praktische Prüfung vorbereiten und bewerten','clipboard'],overview:['Übersicht','Alle Prüfungen im Überblick','dashboard'],running:['Durchführung','Erstellte Links und laufende Prüfungen','clock'],first:['Erstkorrektur','Abgegebene Prüfungen bewerten','clipboard'],second:['Zweitkorrektur','Erstbewertungen kontrollieren','check'],release:['Freigabe','Zweitkorrigierte Ergebnisse freigeben','unlock'],archive:['Archiv','Freigegebene und annullierte Prüfungen','archive'],templates:['Vorlagen','Fragenkatalog und Google-Import','settings'],create:['Neue Prüfung','Prüfling und Prüfer auswählen','plus']};
function examIcon(key){
 const paths={dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 11h8M8 15h5"/>',check:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M9 10V6a4 4 0 0 1 8 0M12 14v3"/>',archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--panel)"/><circle cx="15" cy="17" r="3" fill="var(--panel)"/>',plus:'<path d="M12 5v14M5 12h14"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-1M5 17a8 8 0 0 0 14-1"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',arrow:'<path d="m10 6 6 6-6 6"/>',back:'<path d="m14 6-6 6 6 6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>'};
 const e=node('span',undefined,'exam-icon');e.setAttribute('aria-hidden','true');e.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[key]||'')+'</svg>';return e;
}
const date=s=>s?new Date(s.replace(' ','T')+'Z').toLocaleString('de-DE'):'—';
async function api(path='',data,signal){const r=await fetch(root+path,{credentials:'same-origin',cache:'no-store',signal,headers:{'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'XMLHttpRequest'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const j=await r.json().catch(()=>null);if(!j)throw Error('Der Server lieferte keine JSON-Antwort (HTTP '+r.status+'). Bitte Serverprotokoll prüfen.');if(!r.ok)throw Error((j.error||'HTTP '+r.status)+(j.referenz?' · Referenz '+j.referenz:''));return j;}
function examModelAnswer(explicit,feedback){
 const answer=String(explicit??'').trim(),original=String(feedback??'').trim();
 if(!answer)return original;
 if(!original||answer.includes(original))return answer;
 if(original===answer)return answer;
 return answer+'\n\n'+original;
}
function convertGoogle(raw){
 const d=raw.definition||raw;if(!Array.isArray(d.items))throw Error('Keine Google-Forms-Definition gefunden');
 const out=[],warnings=[],blockers=[];
 let section='',intro=d.info?.description||'',pending=[],pendingImages=[];
 const image=(img,label)=>{if(!img)return null;if(typeof img.idvData==='string'&&/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(img.idvData))return img.idvData;blockers.push(label+': '+(img.idvFehler||'Bild nicht eingebettet'));return null;};
 const add=(list,img,label)=>{const b=image(img,label);if(b)list.push(b)};
 const append=(q,title,images,optionBilder=[])=>{
  const g=q.grading||{},points=Number.isFinite(g.pointValue)?g.pointValue:0;
  const correct=(g.correctAnswers?.answers||[]).map(a=>a.value);
  const feedback=[g.generalFeedback?.text&&'Allgemein: '+g.generalFeedback.text,g.whenRight?.text&&'Richtig: '+g.whenRight.text,g.whenWrong?.text&&'Falsch: '+g.whenWrong.text].filter(Boolean).join('\n');
  const modelFeedback=[g.generalFeedback?.text,g.whenRight?.text,g.whenWrong?.text].filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim());
  const modelAnswer=[...new Set(modelFeedback)].join('\n\n');
  const context=[intro,section,...pending].filter(Boolean).join('\n\n');intro='';pending=[];
  const base={titel:title,punkte:points,kontext:context,bilder:[...pendingImages,...images],optionBilder,feedback,muster:modelAnswer,optionen:[],richtig:[]};pendingImages=[];
  if(!g.pointValue)warnings.push(title+': 0 Punkte bzw. kein Punktwert hinterlegt.');
  if(q.required===false||q.required===undefined)warnings.push(title+': ursprünglich optional; im Panel darf die Frage unbeantwortet bleiben.');
  if(q.choiceQuestion){
   const ch=q.choiceQuestion;if(!['RADIO','CHECKBOX','DROP_DOWN'].includes(ch.type)){blockers.push(title+': unbekannter Auswahltyp');return;}
   if(ch.options.some(o=>o.isOther||o.goToAction||o.goToSectionId)){blockers.push(title+': Sonstige-Option oder Verzweigung muss manuell umgesetzt werden');}
   const opts=ch.options.map((o,i)=>String(o.value||('Bildantwort '+(i+1))));
   const idx=correct.map(v=>opts.indexOf(v));if(new Set(opts).size!==opts.length||idx.some(v=>v<0))blockers.push(title+': Lösungsschlüssel nicht eindeutig');
   if(points>0&&!idx.length)warnings.push(title+': richtige Antwort fehlt – bitte ergänzen.');
   out.push({...base,typ:ch.type==='CHECKBOX'?'multiple':'single',optionen:opts,richtig:idx.filter(i=>i>=0),optionBilder:ch.options.map((o,i)=>image(o.image,title+' · Antwort '+(i+1)))});
  }else if(q.textQuestion){
   const muster=examModelAnswer(correct.join('\n'),modelAnswer);
   if(points>0&&!muster)warnings.push(title+': weder Musterlösung noch Bewertungsfeedback hinterlegt – bitte ergänzen.');
   out.push({...base,typ:'text',muster});
  }else blockers.push(title+': nicht unterstützter Fragetyp');
 };
 for(const i of d.items){
  const title=[i.title,i.description].filter(Boolean).join('\n');
  if(i.pageBreakItem){section=title;warnings.push('Abschnitt "'+(i.title||'ohne Titel')+'" wird als Kontext statt eigener Seite übernommen.');continue;}
  if(i.textItem){pending.push(title);continue;}
  if(i.imageItem){pending.push(title);add(pendingImages,i.imageItem.image,title||'Abschnittsbild');continue;}
  if(i.videoItem||i.questionGroupItem){blockers.push((title||'Element')+': Video oder Fragegruppe benötigt manuelle Umsetzung.');continue;}
  const q=i.questionItem?.question;if(!q){blockers.push(title+': unbekanntes Formularelement');continue;}
  const images=[];add(images,i.questionItem.image,title);append(q,title,images);
 }
 if(pending.some(Boolean)||pendingImages.length)blockers.push('Nach der letzten Frage stehen weitere Texte oder Bilder, die separat übernommen werden müssen.');
 if(d.settings?.quizSettings?.isQuiz!==true)warnings.push('Formular ist nicht als Quiz konfiguriert.');
 if(d.settings?.shuffleQuestions)warnings.push('Zufällige Fragenreihenfolge wird nicht übernommen.');
 if(!out.length)blockers.push('Keine unterstützten Fragen gefunden.');
 return {fragen:out,warnings,blockers};
}
let formsGoogleLoad;
function loadFormsGoogle(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(!formsGoogleLoad)formsGoogleLoad=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=resolve;script.onerror=()=>{formsGoogleLoad=null;reject(Error('Google-Anmeldung konnte nicht geladen werden.'))};document.head.append(script);
 });return formsGoogleLoad;
}
function showImage(parent,src){
 if(!src||!/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(src))return;
 const img=node('img');img.src=src;img.alt='Prüfungsabbildung';img.style.cssText='display:block;max-width:100%;max-height:360px;object-fit:contain;margin:10px 0;border-radius:8px';parent.append(img);
}
function examQuestionIssues(q,art){
 const errors=[],n=Number(q.punkte),choice=['single','multiple'].includes(q.typ),opts=q.optionen||[],correct=q.richtig||[];
 if(!String(q.titel||'').trim())errors.push('Fragetext fehlt');
 if(!['single','multiple','text','praxis'].includes(q.typ)||(art==='praxis')!==(q.typ==='praxis'))errors.push('Fragetyp passt nicht');
 if(q.punkte===''||q.punkte===null||!Number.isFinite(n)||n<0||n>1000||Math.abs(n*100-Math.round(n*100))>1e-7)errors.push('Punktwert ungültig');
 if(choice){
  if(opts.length<2||opts.length>50||opts.some(o=>!String(o||'').trim()))errors.push('Antwortmöglichkeiten vervollständigen');
  if((n>0&&!correct.length)||(q.typ==='single'&&correct.length>1)||new Set(correct).size!==correct.length||correct.some(i=>!Number.isInteger(i)||i<0||i>=opts.length))errors.push('Richtige Antwort markieren');
 }else if(n>0&&!String(q.muster||'').trim())errors.push('Musterlösung oder Bewertungsmaßstab fehlt');
 return errors;
}
function examImportReview(blockers,acknowledged){
 return blockers.map((text,index)=>({text,index,checked:acknowledged.has(index)}));
}
function open(host){
 const mount=node('div',undefined,'exam-center');host.replaceChildren(mount);
 const note=node('p','','exam-message');note.hidden=true;note.setAttribute('role','status');const main=node('div',undefined,'exam-body');mount.append(note,main);
 let data=null,busy=false,view='overview',detailId=null,templateDraft=null,lastList='overview',search='',kind='',dirty=false;
 mount.id='idvExamMount';
 main.addEventListener('input',e=>{if(['create','practice-create','templates','practice-template','detail'].includes(view)&&e.target.matches('input,select,textarea'))dirty=true;});
 main.addEventListener('change',e=>{if(['create','practice-create','templates','practice-template','detail'].includes(view)&&e.target.matches('input,select,textarea'))dirty=true;});
 function canLeave(){return !dirty||confirm('Ungespeicherte Eingaben verwerfen?');}
 function navigate(v){if(busy||v===view||!canLeave())return;dirty=false;templateDraft=null;detailId=null;view=v;message('');render();}
 function count(v){const rows=data?.pruefungen||[];return rows.filter(p=>examMatchesView(p,v)).length;}
 const connected=()=>mount.isConnected;
 function message(t,bad=false){if(connected()){note.textContent=t;note.hidden=!t;note.classList.toggle('is-error',bad);}}
 async function run(fn){if(busy)return;busy=true;try{await fn()}catch(e){message(e.message,true)}finally{busy=false}}
 async function load(){try{data=await api();if(connected()){message('');if(view==='detail'&&detailId!==null){await details(detailId);}else render();}}catch(e){if(connected()&&!data){main.replaceChildren();const b=card('Prüfungszentrum konnte nicht geladen werden');b.append(node('p',e.message),node('p','Die übrigen Panel-Funktionen bleiben verfügbar. Prüfe die Meldung oder gib sie an die Administration weiter.','mut'),btn('Erneut versuchen',()=>run(load)));main.append(b);}throw e;}}
 function linkBox(url){if(!url)return;const box=card('Prüfungslink · vertraulich weitergeben');const i=text();i.value=location.origin+url;i.readOnly=true;box.append(i,btn('Link kopieren',async()=>{try{await navigator.clipboard.writeText(i.value);message('Link kopiert.')}catch{ i.select();message('Bitte markierten Link manuell kopieren.')}}));main.prepend(box);}
 function nav(){
 const wrap=node('section',undefined,'exam-command');
 const top=node('div',undefined,'exam-heading');const copy=node('div');copy.append(node('div','AUSBILDUNG / PRÜFUNGSWESEN','exam-kicker'),node('h1','Prüfungszentrum'),node('p','Prüfungen durchführen, bewerten und Ergebnisse freigeben.','mut'));top.append(copy);
 const actions=node('div',undefined,'exam-heading-actions');
 const refresh=btn('Aktualisieren',()=>{if(busy||!canLeave())return;dirty=false;run(load)},'exam-refresh');refresh.prepend(examIcon('refresh'));actions.append(refresh);
 const createButton=btn('Neue Prüfung',()=>navigate('create'),'p exam-new');createButton.prepend(examIcon('plus'));createButton.setAttribute('aria-pressed',String(view==='create'));actions.append(createButton);top.append(actions);wrap.append(top);
 const bar=node('nav',undefined,'exam-nav');bar.setAttribute('aria-label','Prüfungszentrum');
 const selected=view==='detail'?lastList:view.startsWith('practice-')?'practice':view;
 const groups=[['ÜBERBLICK',['overview','running','practice']],['KORREKTUR & FREIGABE',['first','second','release']],['VERWALTUNG',['archive',...(data.vorlagenBearbeiten?['templates']:[])]]];
 for(const [label,views] of groups){
  const group=node('div',undefined,'exam-nav-group');group.append(node('span',label,'exam-nav-label'));const row=node('div',undefined,'exam-nav-items');
  for(const v of views){
   const [name,hint,icon]=EXAM_VIEWS[v],b=btn('',()=>navigate(v),'exam-nav-button');b.dataset.view=v;b.setAttribute('aria-current',selected===v?'page':'false');b.title=hint;b.append(examIcon(icon),node('span',name,'exam-nav-text'));
   if(['running','practice','first','second','release'].includes(v)){const n=count(v);if(n)b.append(node('span',String(n),'exam-nav-count'));}
   if(v==='templates'){b.title='Ausbildungsleitung, Leitungsdienst und Administratoren · '+hint;}
   row.append(b);
  }group.append(row);bar.append(group);
 }wrap.append(bar);return wrap;
 }
 function render(){
 if(!connected())return;dirty=false;main.replaceChildren();
 if(!data.bereit){const b=card('Datenbank-Erweiterung erforderlich');b.append(node('p','Das Prüfungszentrum ist vorbereitet. Nach einer aktuellen verschlüsselten Datensicherung kann der Administrator die additive Erweiterung direkt einrichten. Alternativ kann der Hoster die SQL-Migration 2026-11-25-pruefungszentrum.sql einspielen. Bestehende Ausbildungsdaten werden nicht verändert.'),btn('Erneut prüfen',()=>run(load)));if(data.admin)b.append(btn('Nach Backup einrichten',()=>run(async()=>{if(!confirm('Aktuelles verschlüsseltes Datenbankbackup erstellt und heruntergeladen?'))return;await api('/setup',{bestaetigung:'BACKUP_ERSTELLT_PRUEFUNGEN'});await load();message('Prüfungszentrum eingerichtet.');})));main.append(node('h1','Prüfungszentrum'),b);return}
 if(['templates','practice-template'].includes(view)&&!data.vorlagenBearbeiten){view='overview';templateDraft=null;}
 main.append(nav());
 if(view==='practice-create'){main.append(btn('← PM-Praxisprüfung',()=>navigate('practice'),'exam-back'));void window.IDVPractice.create(main,{api,data,run,open:async id=>{lastList='practice';await details(id);}}).catch(e=>message(e.message,true));return}if(view==='create'){create(false);return}if(view==='practice-template'){view='practice';}if(view==='templates'){templates(false);return}
 const selected=EXAM_VIEWS[view]||EXAM_VIEWS.overview;
 const title=node('div',undefined,'exam-section-heading');title.append(node('h2',selected[0]),node('p',selected[1],'mut'));main.append(title);
 if(view==='practice'){
 const panel=card('Praktische Prüfung');panel.classList.add('exam-practice-tools');const desc=node('div');desc.append(node('p','Bewertung durch Prüfer · kein externer Prüfungslink','mut'),node('p',count('practice')+' praktische Prüfungen · '+'fester Bewertungsbogen','mut'));const actions=node('div',undefined,'exam-practice-actions');actions.append(btn('Neue Praxisprüfung',()=>navigate('practice-create'),'p'));actions.append(node('span','Excel-Schema · 5 Module','mut'));panel.append(desc,actions);main.append(panel);
 }
 if(view==='overview'){
  const stats=node('div',undefined,'exam-stats');
  for(const [v,label,hint,filter,icon,tone] of [
   ['running','In Bearbeitung','Aktive Prüfungsversuche',p=>p.status==='laufend','clock','blue'],
   ['first','Erstkorrektur','Zur Bewertung eingereicht',p=>p.status==='abgegeben','clipboard','amber'],
   ['second','Zweitkorrektur','Bewertung kontrollieren',p=>p.status==='erstkorrigiert','check','violet'],
   ['release','Freigabe','Ergebnis wartet auf Freigabe',p=>p.status==='zweitkorrigiert','unlock','green']]){
   const b=btn('',()=>navigate(v),'exam-kpi');b.dataset.tone=tone;const top=node('div',undefined,'exam-kpi-top');top.append(node('span',label),examIcon(icon));b.append(top,node('strong',String(data.pruefungen.filter(filter).length)),node('span',hint,'exam-kpi-hint'));stats.append(b);
  }main.append(stats);
 }
 const c=card(view==='overview'?'Prüfungsliste':selected[0]+' · Prüfungsliste');c.classList.add('exam-list');
 const toolbar=node('div',undefined,'exam-list-toolbar');const searchWrap=node('div',undefined,'exam-search');const s=text('Anwärter oder Prüfung suchen …');s.value=search;s.type='search';s.setAttribute('aria-label','Prüfungen suchen');searchWrap.append(examIcon('search'),s);
 const k=select(view==='practice'?[['praxis','PM-Praxisprüfung']]:[['','Alle Prüfungsarten'],...Object.entries(data.arten||{})]);k.value=view==='practice'?'praxis':kind;k.setAttribute('aria-label','Prüfungsart filtern');const counter=node('span','','exam-count-label');toolbar.append(searchWrap,k,counter);c.append(toolbar);
 const tableWrap=node('div',undefined,'exam-table-wrap');const table=node('table',undefined,'exam-table');const h=node('tr');for(const label of (view==='practice'?['Prüfling / Prüfung','Status','Bewertung','Aktion']:['Prüfling / Prüfung','Status','Fortschritt','Prüfungsende','Tabwechsel','Aktion']))h.append(node('th',label));const thead=node('thead');thead.append(h);table.append(thead);const body=node('tbody');table.append(body);tableWrap.append(table);const empty=node('div',undefined,'exam-empty');c.append(tableWrap,empty);main.append(c);
 function renderRows(){
  const needle=search.trim().toLocaleLowerCase('de-DE');
  const rows=data.pruefungen.filter(p=>examMatchesView(p,view)&&(view==='practice'||!kind||p.art===kind)&&(!needle||[p.kandidat,p.titel,kinds[p.art]||''].join(' ').toLocaleLowerCase('de-DE').includes(needle)));
  counter.textContent=rows.length+' Prüfungen';body.replaceChildren();tableWrap.hidden=!rows.length;empty.hidden=!!rows.length;empty.replaceChildren();
  if(!rows.length){empty.append(examIcon('clipboard'),node('strong',needle||kind?'Keine passenden Prüfungen':'Keine Prüfungen in diesem Bereich'),node('p',needle||kind?'Passe die Suche oder den Prüfungsfilter an.':'Neue Vorgänge erscheinen hier automatisch.','mut'));return}
  for(const p of rows){
   const tr=node('tr');const who=node('td');who.append(node('strong',p.kandidat),node('small',p.titel));tr.append(who);
   const status=node('td');const pill=node('span',states[p.status]||p.status,'exam-status');pill.dataset.status=p.status;status.append(pill);tr.append(status);
   const progress=node('td');if(p.art==='praxis')progress.textContent=view==='practice'?(p.status==='abgegeben'?'In Bewertung':p.status==='erstkorrigiert'?'Erstbewertet':p.status==='zweitkorrigiert'||p.status==='freigegeben'?'Zweitbewertet':'—'):'—';else{const total=Number(p.fragenGesamt)||0,done=Number(p.bearbeitet)||0,percent=total?Math.min(100,Math.max(0,done/total*100)):0;const meter=node('div',undefined,'exam-meter'),fill=node('i');fill.style.width=percent+'%';meter.append(fill);progress.append(node('span',done+' / '+total,'exam-progress-label'),meter);}tr.append(progress);
   if(view!=='practice'){tr.append(node('td',date(p.ende_am)));const focus=node('td');const f=node('span',String(p.tabwechsel??0),'exam-focus-count');if(Number(p.tabwechsel)>0)f.classList.add('has-events');focus.append(f);tr.append(focus);}
   const td=node('td');const openButton=btn('Öffnen',()=>run(async()=>{lastList=view;await details(p.id)}),'exam-open');openButton.append(examIcon('arrow'));td.append(openButton);tr.append(td);body.append(tr);
  }
 }
 s.oninput=()=>{search=s.value;renderRows()};k.onchange=()=>{kind=k.value;renderRows()};renderRows();
 }
 function create(practice=false){if(practice)main.append(btn('← PM-Praxisprüfung',()=>navigate('practice'),'exam-back'));const c=card(practice?'PM-Praxisprüfung anlegen':'Prüfung vorbereiten');c.classList.add('exam-form');
 const choices=(data.pruefungsauswahl||[]).filter(x=>practice?x.art==='praxis':x.art!=='praxis');
 if(!choices.length){c.append(node('p','Zuerst muss die berechtigte Leitung oder ein Administrator eine geprüfte Prüfungsvorlage hinterlegen.'));if(practice&&data.vorlagenBearbeiten)c.append(btn('Bewertungsbogen erstellen',()=>navigate('practice-template'),'p'));main.append(c);return}
 const grid=node('div',undefined,'exam-form-grid');c.append(node('p','Wähle die Prüfungsart, den Prüfling und zwei unterschiedliche Prüfer.','mut'),grid);
 const v=field(grid,'Prüfungsvorlage',select(choices.map(x=>[x.id,x.titel+' · Version #'+x.id])));
 const a=field(grid,'Anwärter',select(data.anwaerter.filter(x=>!practice||x.laufbahn==='PMA').map(x=>[x.id,x.name+' · DN '+x.personalnummer+' · '+x.laufbahn])));
 const options=data.pruefer.map(x=>[x.id,x.anzeigename+' · '+x.dienstnummer]);
 const first=field(grid,'Erstprüfer',select(options)),second=field(grid,'Zweitprüfer',select([['','Bitte wählen'],...options]));first.value=String(data.user);first.disabled=!data.leitung;
 c.append(node('p',practice?'Die Praxisprüfung wird zur Erstbewertung angelegt. Kein Prüflingslink und kein Zeitlimit.':'Einmaliger Prüfungsversuch. Der Link kann vor dem Start erneuert werden und gilt 24 Stunden für den Prüfungsbeginn.','mut'),
 btn('Prüfung anlegen',()=>run(async()=>{const j=await api('',{vorlage:Number(v.value),anwaerter:Number(a.value),erst:Number(first.value),zweit:Number(second.value)});view=practice?'practice':'overview';await load();linkBox(j.link);message(j.link?'Prüfung erstellt. Link jetzt kopieren.':'Praxisbewertung zur Erstkorrektur angelegt.');})));main.append(c);
 }
 function templates(practice=false){
 if(!data.vorlagenBearbeiten)return;
 if(practice)main.append(btn('← PM-Praxisprüfung',()=>navigate('practice'),'exam-back'));
 const c=card(practice?'PM-Praxisprüfung · Bewertungsbogen':'Prüfungsvorlagen · Frageneditor');c.classList.add('exam-form','exam-template');
 const draft=templateDraft;
 const meta=node('div',undefined,'exam-form-grid');c.append(meta);
 const v=field(meta,'Prüfungsart',select(Object.entries(data.arten).filter(([id])=>practice?id==='praxis':id!=='praxis')));
 const t=field(meta,'Titel (optional)',text('Standardtitel'));
 const time=field(meta,'Bearbeitungszeit (Minuten; Praxis = 0)',num(0,480));
 const pass=field(meta,'Bestehensgrenze (%)',num(1,100,'0.01'));
 if(practice){v.value='praxis';v.disabled=true;time.value=0;time.disabled=true;c.append(node('p','Kriterien, maximal erreichbare Punkte und Bewertungsmaßstäbe festlegen. Die Bestehensgrenze bitte entsprechend der gültigen Praxisprüfungsrichtlinie eintragen.','mut'));}
 if(draft){v.value=draft.art;v.disabled=true;t.value=draft.titel;time.value=draft.minuten;pass.value=draft.grenze;c.append(node('p','Bearbeitung von Version #'+draft.id+' · Speichern erzeugt eine neue Version. Bereits gestartete und archivierte Prüfungen behalten ihre ursprünglichen Fragen.','mut'));}
 const questionList=node('div',undefined,'exam-question-list');const total=node('p','','exam-editor-total');let questions=structuredClone(draft?.fragen||[]);let importBlockers=[],importWarnings=[];const acknowledged=new Set();const importNotes=node('div',undefined,'exam-import-review');
 const confirmation=node('input');confirmation.type='checkbox';
 const questionSearch=text('Frage suchen …');questionSearch.type='search';questionSearch.setAttribute('aria-label','Fragen durchsuchen');
 const questionFilter=select([['all','Alle Fragen'],['issues','Nur offene Fragen']]);questionFilter.setAttribute('aria-label','Fragen filtern');
 const saveStatus=node('p','','exam-save-status');saveStatus.setAttribute('aria-live','polite');
 const openQuestions=new Set();const rows=new Map();
 const pending=()=>examImportReview(importBlockers,acknowledged).filter(x=>!x.checked);
 function update(edited=false){
  if(edited){dirty=true;confirmation.checked=false;}
  const errors=questions.map((q,i)=>({i,issues:examQuestionIssues(q,v.value)})).filter(x=>x.issues.length);
  const sum=questions.reduce((n,q)=>n+(Number(q.punkte)||0),0);
  total.textContent=questions.length+' Fragen · '+Math.round(sum*100)/100+' Gesamtpunkte · '+errors.length+' Fragen mit Handlungsbedarf';
  const missing=pending().length;
  saveStatus.textContent=[missing?missing+' Importpunkte noch bestätigen':null,errors.length?errors.length+' Fragen vervollständigen':null,!questions.length?'Keine Fragen vorhanden':null,!confirmation.checked?'Fachliche Gesamtprüfung bestätigen':null].filter(Boolean).join(' · ')||'Bereit zum Speichern';
  for(const [q,r] of rows){
   const issues=examQuestionIssues(q,v.value);r.name.textContent=String(q.titel||'Neue Frage').trim()||'Neue Frage';r.points.textContent=(q.punkte===''?'—':q.punkte)+' P.';r.state.textContent=issues.length?issues[0]:'Vollständig';r.state.dataset.ok=String(!issues.length);
   r.detail.hidden=(questionFilter.value==='issues'&&!issues.length)||!String(q.titel+' '+(q.muster||'')).toLocaleLowerCase('de-DE').includes(questionSearch.value.trim().toLocaleLowerCase('de-DE'));
  }
 }
 function renderImportReview(){
  importNotes.replaceChildren();if(!importBlockers.length&&!importWarnings.length)return;
  const review=node('section',undefined,'exam-review-panel');
  const head=node('div',undefined,'exam-review-heading');head.append(node('h3','Importprüfung'),node('strong',acknowledged.size+' / '+importBlockers.length+' bestätigt','exam-review-count'));review.append(head);
  if(importBlockers.length){
   review.append(node('p','Prüfe jeden nicht automatisch übernommenen Inhalt. Ergänze fehlende Inhalte bei den Fragen oder bestätige bewusst, dass sie für diese Prüfung nicht benötigt werden.','mut'));
   for(const item of examImportReview(importBlockers,acknowledged)){
    const label=node('label',undefined,'exam-review-item');const check=node('input');check.type='checkbox';check.checked=item.checked;
    label.append(check,node('span',item.text));label.dataset.done=String(item.checked);
    check.onchange=()=>{if(check.checked)acknowledged.add(item.index);else acknowledged.delete(item.index);label.dataset.done=String(check.checked);head.lastChild.textContent=acknowledged.size+' / '+importBlockers.length+' bestätigt';dirty=true;update();};
    review.append(label);
   }
   review.append(btn('Alle Importpunkte als geprüft bestätigen',()=>{if(!confirm('Alle offenen Importpunkte geprüft, fehlende Inhalte ergänzt oder bewusst als nicht erforderlich bewertet?'))return;importBlockers.forEach((_,i)=>acknowledged.add(i));dirty=true;renderImportReview();update();},''));
  }
  if(importWarnings.length){const d=node('details',undefined,'exam-warning-list');d.append(node('summary',importWarnings.length+' weitere Hinweise (nicht speicherblockierend)'));for(const w of importWarnings)d.append(node('p',w));review.append(d);}
  importNotes.append(review);
 }
 const blank=()=>({typ:v.value==='praxis'?'praxis':'text',titel:'',punkte:1,muster:'',kontext:'',feedback:'',bilder:[],optionBilder:[],optionen:[],richtig:[]});
 function renderQuestions(){
  questionList.replaceChildren();rows.clear();
  questions.forEach((q,i)=>{
   const detail=node('details',undefined,'exam-question');detail.open=openQuestions.has(q);
   detail.ontoggle=()=>{if(detail.open)openQuestions.add(q);else openQuestions.delete(q);};
   const summary=node('summary',undefined,'exam-question-summary'),number=node('span',String(i+1).padStart(2,'0'),'exam-question-number'),name=node('strong','','exam-question-name'),points=node('span','','exam-question-points'),state=node('span','','exam-question-state');
   summary.append(number,name,points,state,examIcon('arrow'));detail.append(summary);
   const row=node('div',undefined,'exam-question-body');detail.append(row);rows.set(q,{detail,name,points,state});
   const tools=node('div');tools.style.display='flex';tools.style.gap='8px';tools.style.flexWrap='wrap';
   if(i>0)tools.append(btn('↑ Nach oben',()=>{[questions[i-1],questions[i]]=[questions[i],questions[i-1]];renderQuestions();update(true)},''));
   if(i<questions.length-1)tools.append(btn('↓ Nach unten',()=>{[questions[i+1],questions[i]]=[questions[i],questions[i+1]];renderQuestions();update(true)},''));
   tools.append(btn('Frage löschen',()=>{if(confirm('Frage aus dieser Vorlagenversion entfernen?')){questions.splice(i,1);renderQuestions();update(true)}},'danger'));row.append(tools);
   const typ=field(row,'Fragetyp',select(v.value==='praxis'?[['praxis','Praxis-Kriterium']]:[['text','Freitext'],['single','Single Choice'],['multiple','Multiple Choice']]));typ.value=q.typ;
   typ.onchange=()=>{q.typ=typ.value;if(['single','multiple'].includes(q.typ)&&!q.optionen.length)q.optionen=['',''];if(q.typ==='single')q.richtig=q.richtig.slice(0,1);renderQuestions();update(true)};
   const title=field(row,'Frage / Kriterium',area());title.value=q.titel||'';title.oninput=()=>{q.titel=title.value;update(true)};
   const extra=node('details',undefined,'exam-question-extra');extra.append(node('summary','Zusatzinformationen, Feedback & Bilder'));const context=field(extra,'Abschnitt / Hinweise für den Prüfling',area());context.value=q.kontext||'';context.oninput=()=>{q.kontext=context.value;update(true)};
   const p=field(row,'Maximale Punktzahl',num(0,1000,'0.01'));p.value=q.punkte;p.oninput=()=>{q.punkte=p.value===''?'':Number(p.value);update(true)};
   const m=field(row,'Musterlösung / Bewertungskriterien',area());m.value=q.muster||'';m.oninput=()=>{q.muster=m.value;update(true)};
   const feedback=field(extra,'Originales Bewertungsfeedback (nur Prüfer)',area());feedback.value=q.feedback||'';feedback.oninput=()=>{q.feedback=feedback.value;update(true)};
   if(q.feedback)extra.append(btn('Bewertungsfeedback in Musterlösung übernehmen',()=>{const next=examModelAnswer(q.muster,q.feedback);q.muster=next;m.value=next;update(true);message('Bewertungsfeedback als Musterlösung übernommen.');},''));
   q.bilder=q.bilder||[];q.optionBilder=q.optionBilder||[];
   q.bilder.forEach((src,j)=>{showImage(extra,src);extra.append(btn('Bild entfernen',()=>{q.bilder.splice(j,1);renderQuestions();update(true)},''))});
   const picture=field(extra,'Fragenbild hinzufügen',node('input'));picture.type='file';picture.accept='image/png,image/jpeg,image/webp,image/gif';picture.onchange=()=>{const f=picture.files[0];if(!f)return;if(f.size>450000){message('Bild darf höchstens 450 KB groß sein.',true);return}const reader=new FileReader();reader.onload=()=>{q.bilder.push(reader.result);renderQuestions();update(true)};reader.readAsDataURL(f)};
   if(['single','multiple'].includes(q.typ)){
    row.append(node('p','Antwortoptionen · richtige Antworten markieren','exam-options-heading'));
    q.optionen.forEach((o,j)=>{
     const line=node('div',undefined,'exam-option-row');
     const mark=node('input');mark.type=q.typ==='single'?'radio':'checkbox';mark.name='solution-'+i;mark.checked=q.richtig.includes(j);mark.setAttribute('aria-label','Antwort '+(j+1)+' ist richtig');
     mark.onchange=()=>{q.richtig=q.typ==='single'?[j]:mark.checked?[...q.richtig,j]:q.richtig.filter(x=>x!==j);update(true)};
     const value=text('Antwort '+(j+1));value.value=o;value.style.flex='1';value.oninput=()=>{q.optionen[j]=value.value;update(true)};
     line.append(mark,value,btn('Entfernen',()=>{q.optionen.splice(j,1);q.optionBilder.splice(j,1);q.richtig=q.richtig.filter(x=>x!==j).map(x=>x>j?x-1:x);renderQuestions();update(true)},''));row.append(line);showImage(row,q.optionBilder[j]);
     if(q.optionBilder[j])row.append(btn('Antwortbild entfernen',()=>{q.optionBilder[j]=null;renderQuestions();update(true)},''));
     const img=field(row,'Antwortbild '+(j+1),node('input'));img.type='file';img.accept='image/png,image/jpeg,image/webp,image/gif';img.onchange=()=>{const f=img.files[0];if(!f)return;if(f.size>450000){message('Bild darf höchstens 450 KB groß sein.',true);return}const r=new FileReader();r.onload=()=>{q.optionBilder=Array.from({length:q.optionen.length},(_,k)=>q.optionBilder[k]||null);q.optionBilder[j]=r.result;renderQuestions();update(true)};r.readAsDataURL(f)};
    });row.append(btn('+ Antwortoption',()=>{q.optionen.push('');if(q.optionBilder.length)q.optionBilder.push(null);renderQuestions();update(true)},''));
   }row.append(extra);questionList.append(detail);
  });update();
 }
 v.onchange=()=>{if(questions.length&&!confirm('Prüfungsart wechseln und bisherige Fragen entfernen?')){v.value=questions[0].typ==='praxis'?'praxis':(v.dataset.previous||'pm');return}questions=[];openQuestions.clear();importBlockers=[];importWarnings=[];acknowledged.clear();renderImportReview();v.dataset.previous=v.value;if(v.value==='praxis')time.value=0;renderQuestions();update(true)};v.dataset.previous=v.value;
 for(const input of [t,time,pass])input.addEventListener('input',()=>update(true));confirmation.onchange=()=>update();questionSearch.oninput=()=>update();questionFilter.onchange=()=>update();
 if(data.importAdmin&&!practice){
 const googleBox=card('Google Forms direkt importieren · nur Admin');
 const source=field(googleBox,'Originalprüfung',select([['pm','PM-Theorieprüfung'],['pk','PK-Prüfung'],['dgl','DGL-Theorieprüfung']]));
 if(['pm','pk','dgl'].includes(v.value))source.value=v.value;
 const googleHint=node('p','Google-Anmeldung wird vorbereitet …','mut');googleHint.setAttribute('role','status');googleHint.setAttribute('aria-live','polite');googleBox.append(googleHint);
 const download=node('button','Originalexport (JSON) sichern');download.type='button';download.hidden=true;googleBox.append(download);
 let googleConfig=null,googleReady=false,lastRaw=null,googleClient=null,job=null;
 const importStatus=(text,bad=false)=>{googleHint.textContent=text;googleHint.style.color=bad?'var(--bad)':'';};
 download.onclick=()=>{if(!lastRaw)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastRaw,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='IDV-'+lastRaw.art+'-Forms.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 function useImport(raw,art){
  const result=Array.isArray(raw)?{fragen:raw,warnings:[],blockers:[]}:Array.isArray(raw.fragen)?{fragen:raw.fragen,warnings:[],blockers:[]}:convertGoogle(raw);
  if(art){v.value=art;v.dataset.previous=art;t.value=raw.definition?.info?.title||data.arten[art];}
  questions=result.fragen.map(q=>({...q,muster:String(q.muster||'').trim()||String(q.feedback||'').trim(),optionen:Array.isArray(q.optionen)?q.optionen:[],richtig:Array.isArray(q.richtig)?q.richtig:[],bilder:q.bilder||[],optionBilder:q.optionBilder||[]}));
  importBlockers=result.blockers;importWarnings=result.warnings;acknowledged.clear();openQuestions.clear();confirmation.checked=false;renderImportReview();
  renderQuestions();dirty=true;message('Import geladen: '+questions.length+' Fragen. '+(importBlockers.length?'Offene Importprobleme zuerst beheben.':'Lösungen und Punktwerte prüfen.'));
 }
 const idleLabel='Mit Google verbinden und importieren';
 function finish(current,text,bad=false){
  if(job!==current)return;
  clearTimeout(current.timer);job=null;busy=false;
  if(googleBox.isConnected){googleButton.disabled=!googleReady;source.disabled=false;googleButton.textContent=idleLabel;cancelImport.hidden=true;importStatus(text,bad);}
 }
 function oauthError(response){
  const code=String(response?.error||response?.type||'');
  return ({access_denied:'Google-Zugriff wurde nicht erteilt.',popup_closed:'Google-Fenster wurde geschlossen, ohne dass ein Autorisierungscode angekommen ist.',popup_failed_to_open:'Google-Popup konnte nicht geöffnet werden. Popups für diese Website zulassen.',invalid_scope:'Google hat den Forms-Lesezugriff abgelehnt.',interaction_required:'Google benötigt eine erneute Bestätigung.'})[code]||'Google-Anmeldung konnte nicht abgeschlossen werden'+(/^[a-z_]{1,60}$/.test(code)?' ('+code+')':'')+'.';
 }
 async function receiveCode(response){
  const current=job;if(!current||current.phase!=='oauth')return;
  if(response?.error||!response?.code){finish(current,oauthError(response),true);return;}
  clearTimeout(current.timer);current.phase='fetch';current.controller=new AbortController();
  importStatus('Google-Konto verbunden. Fragen, Lösungen, Punktwerte und Bilder werden abgerufen …');
  googleButton.textContent='Prüfung wird importiert …';
  current.timer=setTimeout(()=>{current.controller.abort();finish(current,'Zeitlimit beim Formularabruf erreicht. Bitte erneut verbinden.',true)},75000);
  try{
   const raw=await api('/google/import',{art:current.art,google_code:response.code},current.controller.signal);
   if(job!==current||!googleBox.isConnected)return;
   useImport(raw,current.art);lastRaw=raw;download.hidden=false;
   finish(current,'Import erfolgreich: '+questions.length+' Fragen · '+questions.reduce((n,q)=>n+(Number(q.punkte)||0),0)+' Gesamtpunkte. '+(importBlockers.length?'Offene Importprobleme prüfen.':'Lösungen prüfen und Vorlage speichern.'));
  }catch(e){if(job===current)finish(current,'Import fehlgeschlagen: '+e.message,true);}
 }
 const googleButton=btn(idleLabel,()=>{
  if(!googleReady||!googleClient||busy)return;
  if(draft&&source.value!==draft.art){importStatus('Die ausgewählte Prüfung passt nicht zur bearbeiteten Vorlage.',true);return;}
  if(questions.length&&!confirm('Aktuellen Entwurf durch Google-Import ersetzen?'))return;
  const current={art:source.value,phase:'oauth',timer:null,controller:null};job=current;busy=true;googleButton.disabled=true;source.disabled=true;cancelImport.hidden=false;
  googleButton.textContent='Warte auf Google …';importStatus('Google-Fenster geöffnet. Konto auswählen und Forms-Lesezugriff bestätigen.');
  current.timer=setTimeout(()=>finish(current,'Google hat keinen Autorisierungscode zurückgegeben. Popups zulassen und erneut versuchen. Falls nötig: COOP-Konfiguration des Hosters prüfen.',true),120000);
  try{googleClient.requestCode();}catch(e){finish(current,'Google-Popup konnte nicht geöffnet werden: '+e.message,true);}
 });
 const cancelImport=btn('Abbrechen',()=>{const current=job;if(!current)return;current.controller?.abort();finish(current,'Import abgebrochen. Du kannst dich erneut verbinden.');},'');cancelImport.hidden=true;
 googleButton.disabled=true;googleBox.append(googleButton,cancelImport);c.append(googleBox);
 (async()=>{try{
  const config=await api('/google/status');if(!config.eingerichtet)throw Error(config.hinweis||'Google OAuth nicht eingerichtet.');if(location.origin!==config.origin)throw Error('Google-Import bitte auf '+config.origin+' öffnen.');
  await loadFormsGoogle();if(!googleBox.isConnected)return;googleConfig=config;
  googleClient=google.accounts.oauth2.initCodeClient({client_id:config.clientId,scope:'https://www.googleapis.com/auth/forms.body.readonly',include_granted_scopes:false,ux_mode:'popup',select_account:true,callback:receiveCode,error_callback:e=>{if(job)finish(job,oauthError(e),true)}});
  googleReady=true;googleButton.disabled=false;importStatus('Bereit. Lesezugriff auf Fragen, hinterlegte Lösungen, Punkte und Feedback. Keine Prüfungsantworten.');
 }catch(e){importStatus('Google-Verbindung nicht bereit: '+e.message,true)}})();
 const fallback=node('details',undefined,'exam-question-extra');fallback.append(node('summary','Alternative Importmöglichkeit · JSON-Datei (optional)'));c.append(fallback);
 const file=field(fallback,'Vorhandenen JSON-Export auswählen',node('input'));file.type='file';file.accept='.json,application/json';
 file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>1800000)throw Error('Datei zu groß');const raw=JSON.parse(await f.text());if(questions.length&&!confirm('Fragen im aktuellen Entwurf durch Import ersetzen?'))return;useImport(raw,null)}catch(e){message(e.message,true)}};
 }else if(!practice){c.append(node('p','Der Import aus Google Forms oder JSON-Dateien ist ausschließlich Administratoren vorbehalten. Fragen und Lösungen können hier weiterhin manuell bearbeitet werden.','mut'));}
 const tools=node('div',undefined,'exam-editor-toolbar');
 tools.append(questionSearch,questionFilter,btn('Alle einklappen',()=>{openQuestions.clear();for(const r of rows.values())r.detail.open=false;},''),btn(practice?'+ Bewertungskriterium hinzufügen':'+ Frage hinzufügen',()=>{const q=blank();questions.push(q);openQuestions.add(q);questionSearch.value='';questionFilter.value='all';renderQuestions();update(true);rows.get(q)?.detail.scrollIntoView({block:'nearest'});},''));
 tools.append(btn('Fehlende Musterlösungen aus Feedback ergänzen',()=>{let n=0;for(const q of questions){if(!String(q.muster||'').trim()&&String(q.feedback||'').trim()){q.muster=q.feedback;n++;}}if(n){renderQuestions();update(true);}message(n+' fehlende Musterlösungen aus Bewertungsfeedback ergänzt.');},''));
 c.append(importNotes,total,tools,questionList);
 const savebar=node('div',undefined,'exam-savebar');const label=node('label',' Ich habe Fragen, Punktwerte, Musterlösungen und Bestehensgrenze fachlich geprüft.');label.className='exam-review-item';label.prepend(confirmation);savebar.append(label,saveStatus);
 const save=btn('Geprüfte Version speichern',()=>run(async()=>{
  if(pending().length){renderImportReview();importNotes.scrollIntoView({block:'center'});throw Error(pending().length+' Importpunkte noch bestätigen.');}
  const invalid=questions.findIndex(q=>examQuestionIssues(q,v.value).length);
  if(invalid>=0){questionSearch.value='';questionFilter.value='all';update();const r=rows.get(questions[invalid]);if(r){r.detail.open=true;r.detail.scrollIntoView({block:'center'});}throw Error('Frage '+(invalid+1)+': '+examQuestionIssues(questions[invalid],v.value).join(' · '));}
  if(!questions.length||questions.length>200||questions.reduce((n,q)=>n+Number(q.punkte),0)<=0)throw Error('1 bis 200 Fragen und eine positive Gesamtpunktzahl erforderlich.');
  if(time.value===''||pass.value===''||!time.checkValidity()||!pass.checkValidity()||(v.value==='praxis'?Number(time.value)!==0:Number(time.value)<1))throw Error('Bearbeitungszeit und Bestehensgrenze überprüfen.');
  if(!confirmation.checked){label.scrollIntoView({block:'center'});throw Error('Bitte die fachliche Gesamtprüfung bestätigen.');}
  await api('/vorlagen',{art:v.value,...(t.value?{titel:t.value}:{}),...(draft?{basis:Number(draft.id)}:{}),minuten:Number(time.value),grenze:Number(pass.value),fragen:questions,bestaetigt:true});templateDraft=null;await load();message('Neue Vorlagenversion gespeichert.');
 }));
 savebar.append(save);c.append(savebar);
 if(draft)c.append(btn('Neue Vorlage statt Bearbeitung',()=>{if(confirm('Entwurf verwerfen?')){templateDraft=null;render()}},''));
 const l=card('Vorhandene Versionen');for(const x of data.vorlagen.filter(x=>practice?x.art==='praxis':x.art!=='praxis')){const line=node('div');line.style.display='flex';line.style.justifyContent='space-between';line.style.alignItems='center';line.style.gap='8px';line.style.margin='8px 0';line.append(node('span','#'+x.id+' · '+x.titel+' · '+x.grenze+' % · '+x.minuten+' Min.'),btn('Bearbeiten',()=>run(async()=>{if(questions.length&&!confirm('Aktuellen Entwurf verwerfen und Vorlage laden?'))return;templateDraft=(await api('/vorlagen/'+x.id)).vorlage;render();}),''));
 l.append(line)}main.append(c,l);renderQuestions();
 }
 async function details(id){if(data.pruefungen.some(p=>Number(p.id)===Number(id)&&p.praxisSchema==='pm-praxis-v1')||lastList==='practice'&&!data.pruefungen.some(p=>Number(p.id)===Number(id))){detailId=id;view='detail';dirty=false;main.replaceChildren(nav());const back=btn('← Zurück zur Prüfungsliste',()=>navigate(lastList),'exam-back');main.append(back);await window.IDVPractice.open(main,id,{api,run,message,dirty:()=>{dirty=true;},clean:()=>{dirty=false;},reload:details});return;}const {pruefung:p,user,leitung,verwaltung}=await api('/'+id);if(!connected())return;detailId=id;view='detail';dirty=false;main.replaceChildren(nav());const back=btn('Zurück zur Prüfungsliste',()=>navigate(lastList),'exam-back');back.prepend(examIcon('back'));main.append(back);
 const c=card(p.kandidat+' · '+p.titel);c.append(node('p',states[p.status]+' · Erstprüfer #'+p.erst+' · Zweitprüfer #'+p.zweit),node('p','Start: '+date(p.start_am)+' · Ende: '+date(p.ende_am)+' · Abgabe: '+date(p.abgabe_am)));
 const actions=node('div');actions.style.display='flex';actions.style.gap='8px';actions.style.flexWrap='wrap';c.append(actions);
 if(p.status==='bereit'&&p.art!=='praxis')actions.append(btn('Link erneuern',()=>run(async()=>{const r=await api('/'+id+'/link',{revision:Number(p.revision)});await details(id);linkBox(r.link);}), ''));
 if(leitung&&!['freigegeben','annulliert'].includes(p.status))actions.append(btn('Annullieren',()=>run(async()=>{const n=prompt('Begründung für die Annullierung:');if(!n)return;await api('/'+id+'/annullieren',{revision:Number(p.revision),notiz:n});view='archive';await load();}),'danger'));
 if(leitung&&p.status==='zweitkorrigiert')actions.append(btn('Ergebnis freigeben',()=>run(async()=>{if(!confirm('Endgültiges Ergebnis für den Prüfling freigeben?'))return;await api('/'+id+'/freigabe',{revision:Number(p.revision)});await details(id);message('Ergebnis freigegeben.');})));
 if(p.ergebnis!==null&&p.fragen){const max=p.fragen.reduce((n,q)=>n+Number(q.punkte),0);c.append(node('h2',Number(p.ergebnis)+' / '+max+' Punkte · '+(100*Number(p.ergebnis)/max>=Number(p.grenze)?'Bestanden':'Nicht bestanden')));}
 main.append(c);
 const f=card('Fokusprotokoll · Hinweise, kein Täuschungsnachweis');f.append(node('p','Tab-/Fensterwechsel: '+(p.fokus.wechsel||0)));for(const e of (p.fokus.events||[]))f.append(node('p',new Date(e.am).toLocaleString('de-DE')+' · '+e.ereignis));main.append(f);
 if(p.fragen){
 const first=p.status==='abgegeben'&&Number(p.erst)===user,second=p.status==='erstkorrigiert'&&Number(p.zweit)===user;
 const override=verwaltung&&['abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben'].includes(p.status);
 let editOverride=false;
 const fields=[];p.fragen.forEach((q,i)=>{const b=card((q.typ==='praxis'?'Bewertungskriterium ':'Frage ')+(i+1)+' · '+q.punkte+' Punkte');if(q.kontext)b.append(node('p',q.kontext));b.append(node('p',q.titel));(q.bilder||[]).forEach(img=>showImage(b,img));(q.optionBilder||[]).forEach((img,j)=>{if(img){b.append(node('p','Antwortoption: '+q.optionen[j]));showImage(b,img)}});if(q.feedback)b.append(node('p','Originales Bewertungsfeedback: '+q.feedback));
 const ans=p.antworten[i];const answer=Array.isArray(ans)?ans.map(a=>q.optionen[a]).join(' · '):ans;
 if(q.typ!=='praxis')b.append(node('p','Antwort: '+(answer||'—')));b.append(node('p','Muster / Kriterien: '+([q.muster,...(q.richtig||[]).map(a=>q.optionen[a])].filter(Boolean).join(' · ')||'—')));
 const automatic=p.automatisch[i];if(automatic!==null)b.append(node('p','Automatische Vorbewertung: '+automatic+' / '+q.punkte));
 const score=field(b,'Punkte',num(0,q.punkte,'0.01'));score.value=p.bewertung[i]?.punkte??automatic??'';score.disabled=!first;
 const n=field(b,'Korrekturvermerk',area());n.value=p.bewertung[i]?.notiz||'';n.disabled=!first&&!second;fields.push({score,n});main.append(b);
 });
 if(override){
 const b=card('Leitung · Korrektursperre übergehen');
 b.append(node('p','Auch nach der Zweitkorrektur und Ergebnisfreigabe darf die Leitung Punkte und Vermerke berichtigen. Ursprüngliche Antworten bleiben unverändert; der alte und neue Bewertungsstand werden protokolliert. Bei bereits freigegebenen Ergebnissen wird die neue Punktzahl unmittelbar im Ergebnislink angezeigt.','mut'));
 const why=field(b,'Pflichtbegründung',area('Warum ist die Berichtigung erforderlich?'));
 const saveOverride=btn('Berichtigung verbindlich speichern',()=>run(async()=>{if(!editOverride||!why.value.trim())throw Error('Berichtigungsmodus aktivieren und Begründung eingeben.');if(fields.some(x=>x.score.value===''||!x.score.checkValidity()))throw Error('Alle Punkte vollständig und gültig eintragen.');if(!confirm('Bewertung mit Leitungsrecht berichtigen?'))return;await api('/'+id+'/berichtigen',{revision:Number(p.revision),notiz:why.value,bewertung:fields.map(x=>({punkte:Number(x.score.value),notiz:x.n.value}))});await details(id);message('Berichtigung protokolliert.');}));
 saveOverride.disabled=true;
 b.append(btn('Berichtigung aktivieren',()=>{editOverride=true;fields.forEach(x=>{x.score.disabled=false;x.n.disabled=false});saveOverride.disabled=false;message('Berichtigungsmodus aktiv. Begründung ist Pflicht.');}),saveOverride);
 if(p.status!=='abgegeben')b.append(btn('Erst- und Zweitkorrektur erneut öffnen',()=>run(async()=>{if(!why.value.trim())throw Error('Begründung erforderlich.');if(!confirm('Korrektur erneut öffnen? Ein freigegebenes Ergebnis wird bis zur erneuten Freigabe ausgeblendet.'))return;await api('/'+id+'/wiedereroeffnen',{revision:Number(p.revision),notiz:why.value});await details(id);message('Korrektur erneut geöffnet.');}),''));
 main.append(b);
 }
 if(first||second){const b=card(first?'Erstkorrektur abschließen':'Zweitkorrektur abschließen');const note=field(b,'Gesamtvermerk / Begründung',area());
 b.append(btn(first?'An Zweitprüfer übergeben':'Zweitkorrektur bestätigen',()=>run(async()=>{if(fields.some(x=>x.score.value===''||!x.score.checkValidity()))throw Error('Alle Punkte vollständig und gültig eintragen.');await api('/'+id+'/korrektur',{revision:Number(p.revision),notiz:note.value,bewertung:fields.map(x=>({punkte:Number(x.score.value),notiz:x.n.value}))});await details(id);message('Korrektur gespeichert.');})));
 if(second)b.append(btn('Mit Begründung an Erstprüfer zurückgeben',()=>run(async()=>{await api('/'+id+'/korrektur',{revision:Number(p.revision),notiz:note.value,zurueck:true});await details(id);message('Zurückgegeben.');}),''));
 main.append(b);}
 }
 const h=card('Verlauf');for(const e of p.protokoll){h.append(node('p',new Date(e.am).toLocaleString('de-DE')+' · '+e.aktion+' · '+(e.user?'#'+e.user:'System')+(e.notiz?' · '+e.notiz:'')));if(e.vorher&&e.nachher){const d=node('details');d.append(node('summary','Bewertungsänderungen: '+(e.vorher.ergebnis??'offen')+' → '+(e.nachher.ergebnis??'offen')+' Punkte · '+e.vorher.status+' → '+e.nachher.status));const old=e.vorher.bewertung||[],next=e.nachher.bewertung||[];for(let i=0;i<Math.max(old.length,next.length);i++){const a=old[i],b=next[i];if(JSON.stringify(a)!==JSON.stringify(b))d.append(node('p','Frage '+(i+1)+': '+(a?.punkte??'offen')+' → '+(b?.punkte??'offen')+' Punkte · '+(a?.notiz||'—')+' → '+(b?.notiz||'—')));}h.append(d);}}main.append(h);
 }
 main.append(node('h1','Prüfungszentrum'),node('p','Prüfungen werden geladen …','mut'));run(load);
 const interval=setInterval(()=>{if(!connected()){clearInterval(interval);return}if(view==='running'&&!busy&&document.visibilityState==='visible')run(load)},10000);
}
window.IDVPruefungen={open,convertGoogle,examQuestionIssues,examImportReview,examMatchesView,isMounted:()=>!!document.getElementById('idvExamMount')};
})();