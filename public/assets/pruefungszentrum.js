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
const date=s=>s?new Date(s.replace(' ','T')+'Z').toLocaleString('de-DE'):'—';
async function api(path='',data){const r=await fetch(root+path,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'XMLHttpRequest'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error((j.error||'HTTP '+r.status)+(j.referenz?' · Referenz '+j.referenz:''));return j;}
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
  const context=[intro,section,...pending].filter(Boolean).join('\n\n');intro='';pending=[];
  const base={titel:title,punkte:points,kontext:context,bilder:[...pendingImages,...images],optionBilder,feedback,muster:'',optionen:[],richtig:[]};pendingImages=[];
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
   const muster=correct.join('\n');
   if(points>0&&!muster)warnings.push(title+': keine explizite Musterlösung; vorhandenes Feedback prüfen und Lösung ergänzen.');
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
function open(host){
 const mount=node('div');host.replaceChildren(mount);
 const title=node('h1','Prüfungszentrum');const note=node('p','', 'mut');const main=node('div');mount.append(title,note,main);
 let data=null,busy=false,view='overview',detailId=null,templateDraft=null;
 const connected=()=>mount.isConnected;
 function message(t,bad=false){if(connected()){note.textContent=t;note.style.color=bad?'#e7a3a3':'';}}
 async function run(fn){if(busy)return;busy=true;try{await fn()}catch(e){message(e.message,true)}finally{busy=false}}
 async function load(){try{data=await api();if(connected()){message('');render();}}catch(e){if(connected()&&!data){main.replaceChildren();const b=card('Prüfungszentrum konnte nicht geladen werden');b.append(node('p',e.message),node('p','Die übrigen Panel-Funktionen bleiben verfügbar. Prüfe die Meldung oder gib sie an die Administration weiter.','mut'),btn('Erneut versuchen',()=>run(load)));main.append(b);}throw e;}}
 function linkBox(url){if(!url)return;const box=card('Prüfungslink · vertraulich weitergeben');const i=text();i.value=location.origin+url;i.readOnly=true;box.append(i,btn('Link kopieren',async()=>{try{await navigator.clipboard.writeText(i.value);message('Link kopiert.')}catch{ i.select();message('Bitte markierten Link manuell kopieren.')}}));main.prepend(box);}
 function nav(){const bar=node('div',undefined,'box');bar.style.display='flex';bar.style.gap='8px';bar.style.flexWrap='wrap';
  for(const [v,t] of [['overview','Übersicht'],['create','Prüfung erstellen'],['running','Laufend'],['first','Erstkorrektur'],['second','Zweitkorrektur'],['archive','Archiv'],...(data.vorlagenAdmin?[['templates','Vorlagen']]:[])]){
   bar.append(btn(t,()=>{view=v;detailId=null;render()},view===v?'p':''));
  }bar.append(btn('Aktualisieren',()=>run(load),''));return bar;}
 function render(){if(!connected())return;main.replaceChildren();
 if(!data.bereit){const b=card('Datenbank-Erweiterung erforderlich');b.append(node('p','Das Prüfungszentrum ist vorbereitet. Nach einer aktuellen verschlüsselten Datensicherung kann der Administrator die additive Erweiterung direkt einrichten. Alternativ kann der Hoster die SQL-Migration 2026-11-25-pruefungszentrum.sql einspielen. Bestehende Ausbildungsdaten werden nicht verändert.'),btn('Erneut prüfen',()=>run(load)));if(data.admin)b.append(btn('Nach Backup einrichten',()=>run(async()=>{if(!confirm('Aktuelles verschlüsseltes Datenbankbackup erstellt und heruntergeladen?'))return;await api('/setup',{bestaetigung:'BACKUP_ERSTELLT_PRUEFUNGEN'});await load();message('Prüfungszentrum eingerichtet.');})));main.append(b);return}
 main.append(nav());
 if(view==='create'){create();return}if(view==='templates'){if(data.vorlagenAdmin){templates();return}view='overview';templateDraft=null;}
 const stats=node('div');stats.style.display='grid';stats.style.gridTemplateColumns='repeat(auto-fit,minmax(160px,1fr))';stats.style.gap='12px';
 for(const [label,filter] of [['Laufend',p=>p.status==='laufend'],['Erstkorrektur',p=>p.status==='abgegeben'],['Zweitkorrektur',p=>p.status==='erstkorrigiert'],['Freigegeben',p=>p.status==='freigegeben']]){const c=card(label);c.append(node('h2',String(data.pruefungen.filter(filter).length)));stats.append(c)}main.append(stats);
 const filters={running:['bereit','laufend'],first:['abgegeben'],second:['erstkorrigiert','zweitkorrigiert'],archive:['freigegeben','annulliert']};
 const c=card('Prüfungen');const table=node('table');const h=node('tr');for(const s of ['Anwärter','Prüfung','Status','Bearbeitet','Ende','Tabwechsel',''])h.append(node('th',s));const thead=node('thead');thead.append(h);table.append(thead);const body=node('tbody');
 for(const p of data.pruefungen.filter(p=>!filters[view]||filters[view].includes(p.status))){
 const tr=node('tr');for(const s of [p.kandidat,p.titel,states[p.status]||p.status,p.art==='praxis'?'—':p.bearbeitet+'/'+p.fragenGesamt,date(p.ende_am),String(p.tabwechsel)])tr.append(node('td',s));const td=node('td');td.append(btn('Öffnen',()=>run(()=>details(p.id)),''));tr.append(td);body.append(tr)}
 table.append(body);if(!body.children.length)c.append(node('p','Keine Prüfungen in dieser Ansicht.','mut'));else{const scroll=node('div');scroll.style.overflowX='auto';scroll.append(table);c.append(scroll)}main.append(c);
 }
 function create(){const c=card('Neue Prüfung');
 const choices=data.pruefungsauswahl||[];
 if(!choices.length){c.append(node('p','Zuerst muss ein Administrator eine geprüfte Prüfungsvorlage hinterlegen.'));main.append(c);return}
 const v=field(c,'Prüfungsvorlage',select(choices.map(x=>[x.id,x.titel+' · Version #'+x.id])));
 const a=field(c,'Anwärter',select(data.anwaerter.map(x=>[x.id,x.name+' · DN '+x.personalnummer+' · '+x.laufbahn])));
 const options=data.pruefer.map(x=>[x.id,x.anzeigename+' · '+x.dienstnummer]);
 const first=field(c,'Erstprüfer',select(options)),second=field(c,'Zweitprüfer',select([['','Bitte wählen'],...options]));first.value=String(data.user);first.disabled=!data.leitung;
 c.append(node('p','Einmaliger Prüfungsversuch. Der Link kann vor dem Start erneuert werden und gilt 24 Stunden für den Prüfungsbeginn.','mut'),
 btn('Prüfung anlegen',()=>run(async()=>{const j=await api('',{vorlage:Number(v.value),anwaerter:Number(a.value),erst:Number(first.value),zweit:Number(second.value)});view='overview';await load();linkBox(j.link);message(j.link?'Prüfung erstellt. Link jetzt kopieren.':'Praxisbewertung zur Erstkorrektur angelegt.');})));main.append(c);
 }
 function templates(){
 if(!data.vorlagenAdmin)return;
 const c=card('Prüfungsvorlagen · Frageneditor');
 const draft=templateDraft;
 const v=field(c,'Prüfungsart',select(Object.entries(data.arten)));
 const t=field(c,'Titel (optional)',text('Standardtitel'));
 const time=field(c,'Bearbeitungszeit (Minuten; Praxis = 0)',num(0,480));
 const pass=field(c,'Bestehensgrenze (%)',num(1,100,'0.01'));
 if(draft){v.value=draft.art;v.disabled=true;t.value=draft.titel;time.value=draft.minuten;pass.value=draft.grenze;c.append(node('p','Bearbeitung von Version #'+draft.id+' · Speichern erzeugt eine neue Version. Bereits gestartete und archivierte Prüfungen behalten ihre ursprünglichen Fragen.','mut'));}
 const questionList=node('div');const total=node('p','','mut');let questions=structuredClone(draft?.fragen||[]);let importBlockers=[];const importNotes=node('div');
 const confirmation=node('input');confirmation.type='checkbox';
 const update=()=>{total.textContent=questions.length+' Fragen · '+questions.reduce((n,q)=>n+(Number(q.punkte)||0),0)+' Gesamtpunkte';confirmation.checked=false};
 const blank=()=>({typ:v.value==='praxis'?'praxis':'text',titel:'',punkte:1,muster:'',kontext:'',feedback:'',bilder:[],optionBilder:[],optionen:[],richtig:[]});
 function renderQuestions(){
  questionList.replaceChildren();
  questions.forEach((q,i)=>{
   const row=card('Frage '+(i+1));row.style.border='1px solid var(--border,#405268)';row.style.padding='14px';
   const tools=node('div');tools.style.display='flex';tools.style.gap='8px';tools.style.flexWrap='wrap';
   if(i>0)tools.append(btn('↑ Nach oben',()=>{[questions[i-1],questions[i]]=[questions[i],questions[i-1]];renderQuestions();update()},''));
   if(i<questions.length-1)tools.append(btn('↓ Nach unten',()=>{[questions[i+1],questions[i]]=[questions[i],questions[i+1]];renderQuestions();update()},''));
   tools.append(btn('Frage löschen',()=>{if(confirm('Frage aus dieser Vorlagenversion entfernen?')){questions.splice(i,1);renderQuestions();update()}},'danger'));row.append(tools);
   const typ=field(row,'Fragetyp',select(v.value==='praxis'?[['praxis','Praxis-Kriterium']]:[['text','Freitext'],['single','Single Choice'],['multiple','Multiple Choice']]));typ.value=q.typ;
   typ.onchange=()=>{q.typ=typ.value;if(['single','multiple'].includes(q.typ)&&!q.optionen.length)q.optionen=['',''];if(q.typ==='single')q.richtig=q.richtig.slice(0,1);renderQuestions();update()};
   const title=field(row,'Frage / Kriterium',area());title.value=q.titel||'';title.oninput=()=>{q.titel=title.value;update()};
   const context=field(row,'Abschnitt / Hinweise für den Prüfling',area());context.value=q.kontext||'';context.oninput=()=>{q.kontext=context.value;update()};
   const p=field(row,'Maximale Punktzahl',num(0,1000,'0.01'));p.value=q.punkte;p.oninput=()=>{q.punkte=Number(p.value);update()};
   const m=field(row,'Musterlösung / Bewertungskriterien',area());m.value=q.muster||'';m.oninput=()=>{q.muster=m.value;update()};
   const feedback=field(row,'Originales Bewertungsfeedback (nur Prüfer)',area());feedback.value=q.feedback||'';feedback.oninput=()=>{q.feedback=feedback.value;update()};
   q.bilder=q.bilder||[];q.optionBilder=q.optionBilder||[];
   q.bilder.forEach((src,j)=>{showImage(row,src);row.append(btn('Bild entfernen',()=>{q.bilder.splice(j,1);renderQuestions()},''))});
   const picture=field(row,'Fragenbild hinzufügen',node('input'));picture.type='file';picture.accept='image/png,image/jpeg,image/webp,image/gif';picture.onchange=()=>{const f=picture.files[0];if(!f)return;if(f.size>450000){message('Bild darf höchstens 450 KB groß sein.',true);return}const reader=new FileReader();reader.onload=()=>{q.bilder.push(reader.result);renderQuestions()};reader.readAsDataURL(f)};
   if(['single','multiple'].includes(q.typ)){
    row.append(node('p','Antwortoptionen · richtige Antworten markieren','mut'));
    q.optionen.forEach((o,j)=>{
     const line=node('div');line.style.display='flex';line.style.gap='8px';line.style.margin='5px 0';
     const mark=node('input');mark.type=q.typ==='single'?'radio':'checkbox';mark.name='solution-'+i;mark.checked=q.richtig.includes(j);mark.setAttribute('aria-label','Antwort '+(j+1)+' ist richtig');
     mark.onchange=()=>{q.richtig=q.typ==='single'?[j]:mark.checked?[...q.richtig,j]:q.richtig.filter(x=>x!==j);update()};
     const value=text('Antwort '+(j+1));value.value=o;value.style.flex='1';value.oninput=()=>{q.optionen[j]=value.value;update()};
     line.append(mark,value,btn('Entfernen',()=>{q.optionen.splice(j,1);q.optionBilder.splice(j,1);q.richtig=q.richtig.filter(x=>x!==j).map(x=>x>j?x-1:x);renderQuestions();update()},''));row.append(line);showImage(row,q.optionBilder[j]);
     if(q.optionBilder[j])row.append(btn('Antwortbild entfernen',()=>{q.optionBilder[j]=null;renderQuestions()},''));
     const img=field(row,'Antwortbild '+(j+1),node('input'));img.type='file';img.accept='image/png,image/jpeg,image/webp,image/gif';img.onchange=()=>{const f=img.files[0];if(!f)return;if(f.size>450000){message('Bild darf höchstens 450 KB groß sein.',true);return}const r=new FileReader();r.onload=()=>{q.optionBilder=Array.from({length:q.optionen.length},(_,k)=>q.optionBilder[k]||null);q.optionBilder[j]=r.result;renderQuestions()};r.readAsDataURL(f)};
    });row.append(btn('+ Antwortoption',()=>{q.optionen.push('');if(q.optionBilder.length)q.optionBilder.push(null);renderQuestions();update()},''));
   }questionList.append(row);
  });update();
 }
 v.onchange=()=>{if(questions.length&&!confirm('Prüfungsart wechseln und bisherige Fragen entfernen?')){v.value=questions[0].typ==='praxis'?'praxis':(v.dataset.previous||'pm');return}questions=[];v.dataset.previous=v.value;if(v.value==='praxis')time.value=0;renderQuestions()};v.dataset.previous=v.value;
 for(const input of [t,time,pass])input.addEventListener('input',()=>confirmation.checked=false);
 const googleBox=card('Google Forms direkt importieren');
 const source=field(googleBox,'Originalprüfung',select([['pm','PM-Theorieprüfung'],['pk','PK-Prüfung'],['dgl','DGL-Theorieprüfung']]));
 if(['pm','pk','dgl'].includes(v.value))source.value=v.value;
 const googleHint=node('p','Google-Anmeldung wird vorbereitet …','mut');googleBox.append(googleHint);
 const download=node('button','Originalexport (JSON) sichern');download.type='button';download.hidden=true;googleBox.append(download);
 let googleConfig=null,googleReady=false,lastRaw=null;
 download.onclick=()=>{if(!lastRaw)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastRaw,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='IDV-'+lastRaw.art+'-Forms.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 function useImport(raw,art){
  const result=Array.isArray(raw)?{fragen:raw,warnings:[],blockers:[]}:Array.isArray(raw.fragen)?{fragen:raw.fragen,warnings:[],blockers:[]}:convertGoogle(raw);
  if(art){v.value=art;v.dataset.previous=art;t.value=raw.definition?.info?.title||data.arten[art];}
  questions=result.fragen.map(q=>({...q,optionen:Array.isArray(q.optionen)?q.optionen:[],richtig:Array.isArray(q.richtig)?q.richtig:[],bilder:q.bilder||[],optionBilder:q.optionBilder||[]}));
  importBlockers=result.blockers;importNotes.replaceChildren();
  if(result.warnings.length||result.blockers.length){
   const d=node('details');d.open=true;d.append(node('summary','Importprüfung · '+result.warnings.length+' Hinweise · '+result.blockers.length+' offene Probleme'));
   for(const x of result.blockers)d.append(node('p','OFFEN: '+x));for(const x of result.warnings)d.append(node('p','Hinweis: '+x));importNotes.append(d);
   if(result.blockers.length)importNotes.append(btn('Offene Importprobleme nach manueller Ergänzung bestätigen',()=>{if(confirm('Hast du alle oben genannten nicht übernommenen Inhalte vollständig manuell ergänzt?')){importBlockers=[];confirmation.checked=false;message('Manuelle Ergänzung bestätigt. Bitte Vorlage fachlich prüfen.');}},''));
  }
  renderQuestions();message('Import geladen: '+questions.length+' Fragen. '+(importBlockers.length?'Offene Importprobleme zuerst beheben.':'Lösungen und Punktwerte prüfen.'));
 }
 const googleButton=btn('Mit Google verbinden und importieren',()=>{
  if(!googleReady||!googleConfig||busy)return;
  if(draft&&source.value!==draft.art){message('Die ausgewählte Prüfung passt nicht zur bearbeiteten Vorlage.',true);return}
  if(questions.length&&!confirm('Aktuellen Entwurf durch Google-Import ersetzen?'))return;
  const art=source.value;busy=true;googleButton.disabled=true;source.disabled=true;
  const done=()=>{busy=false;googleButton.disabled=false;source.disabled=false};
  try{
   const client=google.accounts.oauth2.initCodeClient({client_id:googleConfig.clientId,scope:'https://www.googleapis.com/auth/forms.body.readonly',include_granted_scopes:false,ux_mode:'popup',select_account:true,
    callback:async response=>{try{if(!response.code)throw Error('Google-Anmeldung abgebrochen.');const raw=await api('/google/import',{art,google_code:response.code});if(!googleBox.isConnected)return;lastRaw=raw;download.hidden=false;useImport(raw,art);}catch(e){message(e.message,true)}finally{done()}},
    error_callback:e=>{done();message(e.type==='popup_closed'?'Google-Anmeldung abgebrochen.':'Google-Popup konnte nicht geöffnet werden.',true)}});
   client.requestCode();
  }catch(e){done();message(e.message,true)}
 });googleButton.disabled=true;googleBox.append(googleButton);c.append(googleBox);
 (async()=>{try{const config=await api('/google/status');if(!config.eingerichtet)throw Error(config.hinweis||'Google OAuth nicht eingerichtet.');if(location.origin!==config.origin)throw Error('Google-Import bitte auf '+config.origin+' öffnen.');await loadFormsGoogle();if(!googleBox.isConnected)return;googleConfig=config;googleReady=true;googleButton.disabled=false;googleHint.textContent='Nur Lesezugriff auf Formularstruktur und hinterlegte Lösungen. Kein Zugriff auf Prüfungsantworten.';}catch(e){googleHint.textContent=e.message}})();
 const file=field(c,'JSON-Datei importieren (optional)',node('input'));file.type='file';file.accept='.json,application/json';
 file.onchange=async()=>{try{const f=file.files[0];if(!f)return;if(f.size>1800000)throw Error('Datei zu groß');const raw=JSON.parse(await f.text());if(questions.length&&!confirm('Fragen im aktuellen Entwurf durch Import ersetzen?'))return;useImport(raw,null)}catch(e){message(e.message,true)}};
 c.append(importNotes,total,questionList,btn('+ Frage hinzufügen',()=>{questions.push(blank());renderQuestions()},''));
 const label=node('label',' Ich habe Fragen, Punktwerte, Musterlösungen und Bestehensgrenze fachlich geprüft.');label.prepend(confirmation);label.style.display='block';label.style.margin='14px 0';c.append(label);
 c.append(btn('Geprüfte Version speichern',()=>run(async()=>{if(importBlockers.length)throw Error('Offene Importprobleme zuerst beheben und bestätigen.');if(!confirmation.checked||time.value===''||pass.value==='')throw Error('Zeit, Bestehensgrenze und Bestätigung erforderlich.');await api('/vorlagen',{art:v.value,...(t.value?{titel:t.value}:{}),...(draft?{basis:Number(draft.id)}:{}),minuten:Number(time.value),grenze:Number(pass.value),fragen:questions,bestaetigt:true});templateDraft=null;await load();message('Neue Vorlagenversion gespeichert.');})));
 if(draft)c.append(btn('Neue Vorlage statt Bearbeitung',()=>{if(confirm('Entwurf verwerfen?')){templateDraft=null;render()}},''));
 const l=card('Vorhandene Versionen');for(const x of data.vorlagen){const line=node('div');line.style.display='flex';line.style.justifyContent='space-between';line.style.alignItems='center';line.style.gap='8px';line.style.margin='8px 0';line.append(node('span','#'+x.id+' · '+x.titel+' · '+x.grenze+' % · '+x.minuten+' Min.'),btn('Bearbeiten',()=>run(async()=>{if(questions.length&&!confirm('Aktuellen Entwurf verwerfen und Vorlage laden?'))return;templateDraft=(await api('/vorlagen/'+x.id)).vorlage;render();}),''));
 l.append(line)}main.append(c,l);renderQuestions();
 }
 async function details(id){const {pruefung:p,user,leitung,verwaltung}=await api('/'+id);if(!connected())return;detailId=id;view='detail';main.replaceChildren(nav());
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
 const fields=[];p.fragen.forEach((q,i)=>{const b=card('Frage '+(i+1)+' · '+q.punkte+' Punkte');if(q.kontext)b.append(node('p',q.kontext));b.append(node('p',q.titel));(q.bilder||[]).forEach(img=>showImage(b,img));(q.optionBilder||[]).forEach((img,j)=>{if(img){b.append(node('p','Antwortoption: '+q.optionen[j]));showImage(b,img)}});if(q.feedback)b.append(node('p','Originales Bewertungsfeedback: '+q.feedback));
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
 run(load);
 const interval=setInterval(()=>{if(!connected()){clearInterval(interval);return}if(view==='running'&&!busy&&document.visibilityState==='visible')run(load)},10000);
}
window.IDVPruefungen={open,convertGoogle};
})();