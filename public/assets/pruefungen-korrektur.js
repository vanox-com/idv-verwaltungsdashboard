/* Theory review workspace; drafts remain local to the open view until explicit handoff. */
(()=>{'use strict';
const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const btn=(txt,fn,cls='')=>{const b=el('button',txt,cls);b.type='button';b.onclick=fn;return b};
const box=(title,cls='')=>{const b=el('section',undefined,'box review-box '+cls);b.append(el('h3',title));return b};
const field=(p,t,input)=>{const l=el('label',t);l.append(input);p.append(l);return input};
const area=(value='',placeholder='')=>{const a=el('textarea');a.value=value;a.placeholder=placeholder;a.rows=3;return a};
const fmt=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:2});
const parseDate=s=>s?Date.parse(String(s).includes('T')?s:s.replace(' ','T')+'Z'):NaN;
const date=s=>Number.isFinite(parseDate(s))?new Date(parseDate(s)).toLocaleString('de-DE'):'—';
const duration=(start,end)=>{const a=parseDate(start),b=parseDate(end);if(!Number.isFinite(a)||!Number.isFinite(b))return '—';const n=Math.max(0,Math.floor((b-a)/1000));return Math.floor(n/60)+' min '+String(n%60).padStart(2,'0')+' s'};
const labels={verlassen:'Tab/Fenster verlassen',zurueck:'Zur Prüfung zurückgekehrt',reload:'Seite neu geladen',vollbild_aus:'Vollbild verlassen',paste:'Text eingefügt',paste_versuch:'Einfügetastenkürzel (Versuch)',copy:'Kopiert',cut:'Ausgeschnitten',frage_geoeffnet:'Frage geöffnet'};
function scoreSummary(questions,values,threshold){
 const max=questions.reduce((s,q)=>s+Number(q.punkte),0);
 let total=0,open=0;questions.forEach((q,i)=>{const x=values[i];if(x===''||x===null||x===undefined||!Number.isFinite(Number(x))||Number(x)<0||Number(x)>Number(q.punkte)||Math.abs(Number(x)*100-Math.round(Number(x)*100))>1e-7){open++;return;}total+=Number(x)});
 const percent=max>0?total/max*100:0;
 return {total:Math.round(total*100)/100,max,open,percent,passed:percent>=Number(threshold)};
}
function image(parent,src){if(typeof src!=='string'||!/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(src))return;const i=el('img');i.src=src;i.alt='Prüfungsabbildung';i.className='review-image';parent.append(i)}
function eventsPanel(p){
 const f=p.fokus||{},events=Array.isArray(f.events)?f.events:[],c=box('Prüfungsereignisse');
 const metrics=el('div',undefined,'review-event-metrics');
 for(const [label,count] of [['Tab-/Fensterwechsel',f.wechsel??events.filter(e=>e.ereignis==='verlassen').length],['Einfügevorgänge',events.filter(e=>e.ereignis==='paste').length],['Einfügeversuche',events.filter(e=>e.ereignis==='paste_versuch').length],['Neuladen',events.filter(e=>e.ereignis==='reload').length],['Kopieren / Ausschneiden',events.filter(e=>['copy','cut'].includes(e.ereignis)).length],['Vollbild verlassen',events.filter(e=>e.ereignis==='vollbild_aus').length],['Fragen geöffnet',events.filter(e=>e.ereignis==='frage_geoeffnet').length]]){
  const b=el('div',undefined,'review-event-stat');b.append(el('strong',String(count)),el('span',label));metrics.append(b);
 }
 c.append(metrics);if(f.aktuelleFrage)c.append(el('p',(p.status==='laufend'?'Zuletzt gemeldete aktuelle Frage: ':'Zuletzt gemeldete Frage: ')+'#'+f.aktuelleFrage,'mut'));c.append(el('p','Browser-Ereignisse sind technische Hinweise und keine Täuschungsnachweise. Es werden keine Zwischenablageinhalte erfasst. Fehlende Ereignisse beweisen nicht, dass nichts geschehen ist.','mut'));
 const d=el('details',undefined,'review-event-log');d.append(el('summary','Ereignisprotokoll · '+events.length+' Einträge'));
 if(f.limit)d.append(el('p','Protokolllimit erreicht; weitere Ereignisse können fehlen.','mut'));
 if(!events.length)d.append(el('p','Keine aufgezeichneten Ereignisse.','mut'));
 else {const table=el('table');const tr=el('tr');for(const s of ['Zeit','Ereignis','Frage'])tr.append(el('th',s));const th=el('thead');th.append(tr);table.append(th);const body=el('tbody');for(const e of events){const r=el('tr');const qCell=el('td',e.frage?'#'+e.frage:'—');if(e.frage&&p.fragen?.[e.frage-1])qCell.title=p.fragen[e.frage-1].titel;r.append(el('td',date(e.am)),el('td',labels[e.ereignis]||String(e.ereignis)),qCell);body.append(r)}table.append(body);const wrap=el('div',undefined,'review-log-scroll');wrap.append(table);d.append(wrap);}
 c.append(d);return c;
}
function render(host,r,ctx){
 const p=r.pruefung,uid=Number(r.user),id=Number(p.id),first=r.korrekturRechte?.erst===true,second=r.korrekturRechte?.zweit===true;
 const override=r.verwaltung&&['abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben'].includes(p.status);
 const q=p.fragen||[],max=q.reduce((n,x)=>n+Number(x.punkte),0);
 let mode='normal',active=0,filter='all',query='',aiRunning=false;
 const draft=q.map((x,i)=>({score:p.bewertung?.[i]?.punkte??p.automatisch?.[i]??(Number(x.punkte)===0?0:''),note:p.bewertung?.[i]?.notiz||'',suggestion:null,error:''}));
 const editable=()=>first||mode==='override',notesEditable=()=>first||second||mode==='override';
 const header=box(p.kandidat+' · '+p.titel,'review-head');const stage=el('div',ctx.states[p.status]||p.status,'review-stage');header.prepend(stage);
 const reviewer=n=>ctx.reviewers.find(x=>Number(x.id)===Number(n))?.anzeigename||'#'+n;
 const meta=el('div',undefined,'review-meta');for(const [k,v] of [['Erstprüfer (zugeteilt)',reviewer(p.erst)],...(r.erstBearbeiter?[['Erstkorrektur durchgeführt von',reviewer(r.erstBearbeiter)]]:[]),['Zweitprüfer (zugeteilt)',reviewer(p.zweit)],['Beginn',date(p.start_am)],['Abgabe',date(p.abgabe_am)],['Bearbeitungsdauer',duration(p.start_am,p.abgabe_am)],['Zeitlimit',p.minuten+' min']]){const item=el('div');item.append(el('small',k),el('strong',v));meta.append(item)}header.append(meta);host.append(header);
 const summary=el('section',undefined,'review-summary');const totals=el('div',undefined,'review-total-grid');
 const kpis={};for(const [k,label] of [['points','Punkte aktuell'],['percent','Prozent'],['status','Voraussichtliches Ergebnis'],['open','Offene Bewertungen']]){const b=el('div',undefined,'review-kpi');const v=el('strong','—');kpis[k]=v;b.append(el('small',label),v);totals.append(b)}
 summary.append(totals);const threshold=el('p','Bestehensgrenze: '+fmt(p.grenze)+' % · Vorschau, bis die Korrektur verbindlich abgeschlossen wurde.','mut');summary.append(threshold);if(q.length)host.append(summary);
 const actions=el('div',undefined,'review-top-actions');header.append(actions);
 function runAction(action,body){return ctx.run(async()=>{const result=await ctx.api('/'+id+'/'+action,{revision:Number(p.revision),...body});await ctx.reload(id);if(result.link)ctx.link(result.link);ctx.message('Änderung gespeichert.');});}
 if(r.verwaltung&&p.status==='bereit')actions.append(btn('Prüfungslink erneuern',()=>runAction('link',{})));
 if(r.leitung&&p.status!=='annulliert')actions.append(btn('Annullieren',()=>{const why=prompt('Begründung für die Annullierung:');if(why?.trim())runAction('annullieren',{notiz:why});},'danger'));
 if(r.leitung&&p.status==='zweitkorrigiert')actions.append(btn('Ergebnis freigeben',()=>{if(confirm('Endgültiges Ergebnis freigeben?'))runAction('freigabe',{});},'p'));
 if(p.status==='erstkorrigiert'&&!second){const notice=box('Zweitkorrektur · Zuständigkeit');notice.append(el('p',r.korrekturRechte?.eigeneErstkorrektur?'Du hast die Erstkorrektur durchgeführt. Die verbindliche Zweitkorrektur muss eine andere Person übernehmen. Leitungsberichtigungen bleiben möglich.':'Zuständig: '+reviewer(p.zweit)+'. Die Leitung kann die Prüferzuteilung ändern.'));host.append(notice);}
 if(r.verwaltung&&(first&&Number(p.erst)!==uid||second&&Number(p.zweit)!==uid))host.append(el('p','Du kannst diese Korrektur aufgrund deiner Leitungsberechtigung direkt durchführen. Dein Konto wird als tatsächlicher Bearbeiter protokolliert; die ursprüngliche Zuteilung bleibt erhalten.','mut'));
 if(r.verwaltung&&p.status!=='annulliert'&&p.art!=='praxis'){
  const c=box('Prüferzuteilung');const d=el('details');d.append(el('summary','Erst- und Zweitprüfer ändern'));
  const make=(id,label)=>{const s=el('select');for(const x of ctx.reviewers){const o=el('option',x.anzeigename+(Number(x.id)===uid?' (ich)':''));o.value=String(x.id);s.append(o);}s.value=String(id);field(d,label,s);return s;};
  const a=make(p.erst,'Erstprüfer'),b=make(p.zweit,'Zweitprüfer');const reason=area('','Pflichtbegründung');reason.maxLength=1000;field(d,'Begründung',reason);
  d.append(el('p','Bei Wechsel nach einer abgeschlossenen Korrektur wird der betroffene Schritt erneut geöffnet. Das Vier-Augen-Prinzip bleibt erhalten.','mut'),btn('Prüferzuteilung speichern',()=>{if(!a.value||!b.value||a.value===b.value||!reason.value.trim()){ctx.message('Zwei unterschiedliche Prüfer und Begründung erforderlich.',true);return;}if(confirm('Prüferzuteilung verbindlich ändern?'))runAction('pruefer',{erst:Number(a.value),zweit:Number(b.value),notiz:reason.value});},'p'));c.append(d);host.append(c);
 }
 if(p.status==='zweitkorrigiert'){const b=box('Bereit zur Ergebnisfreigabe');b.append(el('p',r.leitung?'Beide Korrekturen abgeschlossen. Das Ergebnis kann jetzt verbindlich freigegeben werden.':'Beide Korrekturen abgeschlossen. Die Ausbildungsleitung muss das Ergebnis noch freigeben.'));if(r.leitung)b.append(btn('Ergebnis jetzt freigeben',()=>{if(confirm('Endgültiges Ergebnis freigeben?'))runAction('freigabe',{});},'p'));host.append(b);}
 const events=eventsPanel(p);host.append(events);
 if(!q.length){host.append(box('Antworten werden erst nach Abgabe angezeigt'));return;}
 const layout=el('div',undefined,'review-layout'),side=box('Fragen','review-sidebar'),content=el('div',undefined,'review-content');layout.append(side,content);host.append(layout);
 const search=el('input');search.type='search';search.placeholder='Frage suchen …';const sel=el('select');for(const [k,v] of [['all','Alle Fragen'],['open','Nur offene Bewertungen'],['text','Nur Freitext'],['ai','Mit KI-Vorschlag']]){const o=el('option',v);o.value=k;sel.append(o)}side.append(search,sel);
 const grid=el('div',undefined,'review-question-grid');side.append(grid);const legend=el('p','Offen · bewertet · aktuelle Frage','mut');side.append(legend);
 const aiBox=el('div',undefined,'review-ai-controls'),aiStatus=el('p','','mut');aiStatus.setAttribute('role','status');
 const aiEnabled=Boolean(r.kiBereit&&(first||override)&&p.status==='abgegeben');
 function canAI(i){return aiEnabled&&q[i].typ==='text'&&!(q[i].bilder||[]).length&&String(q[i].muster||'').trim()!=='';}
 async function requestAI(indices){
  if(aiRunning)return;if(!indices.length){aiStatus.textContent='Keine weiteren geeigneten Fragen vorhanden.';return;}if(!confirm('KI-Vorschläge anfordern? Fragen, Musterlösungen und Freitextantworten werden zur Bewertung an die konfigurierte GroqCloud-API übertragen. Kontonamen und Prüfungsprotokolle werden nicht mitgesendet. Die endgültige Bewertung bleibt bei dir.'))return;
  aiRunning=true;ctx.dirty();aiStatus.textContent='KI-Vorschläge werden geladen …';let done=0,errors=0,limited=false;
  try{for(const i of indices){if(!host.isConnected)break;aiStatus.textContent='KI-Vorkorrektur '+(done+errors+1)+' / '+indices.length;try{const v=await ctx.api('/'+id+'/ki',{revision:Number(p.revision),frage:i});draft[i].suggestion=v.vorschlag;draft[i].error='';done++;ctx.dirty();}catch(e){draft[i].error=e.message;errors++;if(e.status===429){limited=true;renderQuestion();refresh();break;}}if(host.isConnected){renderQuestion();refresh();}}}finally{aiRunning=false;aiStatus.textContent=done+' Vorschläge erstellt · '+errors+' fehlgeschlagen. '+(limited?'Groq-Limit erreicht. Später fortsetzen. ':'')+'Vorschläge einzeln prüfen und übernehmen.';}
 }
 if(first||override){const aiButton=btn('KI-Vorkorrektur starten',()=>requestAI(q.map((_,i)=>i).filter(i=>canAI(i)&&!draft[i].suggestion)),'p');aiButton.disabled=!aiEnabled;aiBox.append(aiButton,aiStatus);if(!r.kiBereit){aiStatus.textContent='KI noch nicht eingerichtet. Manuelle Korrektur verfügbar.';if(ctx.configure)aiBox.append(btn('KI-Verbindung einrichten',ctx.configure,''));}else if(!aiEnabled)aiStatus.textContent='KI-Vorschläge sind nur während der Erstkorrektur verfügbar.';side.append(aiBox);}
 function matches(i){const x=q[i];return (filter==='all'||filter==='open'&&draft[i].score===''||filter==='text'&&x.typ==='text'||filter==='ai'&&draft[i].suggestion)&&String(x.titel||'').toLocaleLowerCase('de-DE').includes(query.toLocaleLowerCase('de-DE'));}
 function refresh(){
  const s=scoreSummary(q,draft.map(x=>x.score),p.grenze);kpis.points.textContent=fmt(s.total)+' / '+fmt(s.max);kpis.percent.textContent=fmt(s.percent)+' %';kpis.status.textContent=(s.open?'Vorläufig: ':'')+(s.passed?'Bestanden':'Nicht bestanden');kpis.status.dataset.pass=String(s.passed);kpis.open.textContent=s.open+' / '+q.length;
  grid.replaceChildren();q.forEach((x,i)=>{if(!matches(i))return;const b=btn(String(i+1),()=>{active=i;renderQuestion();refresh();},'review-question-button');b.dataset.done=String(draft[i].score!=='');b.dataset.active=String(i===active);b.title='Frage '+(i+1)+' · '+x.titel;b.setAttribute('aria-label','Frage '+(i+1)+(draft[i].score===''?' offen':' bewertet'));grid.append(b)});
 }
 function changed(){ctx.dirty();refresh();}
 search.oninput=()=>{query=search.value;refresh()};sel.onchange=()=>{filter=sel.value;refresh()};
 function renderQuestion(){
  content.replaceChildren();const x=q[active],d=draft[active],i=active;const c=box('Frage '+(i+1)+' von '+q.length);
  const head=el('div',undefined,'review-question-heading');head.append(el('span',x.typ==='text'?'FREITEXT':x.typ==='multiple'?'MULTIPLE CHOICE':x.typ==='single'?'SINGLE CHOICE':'BEWERTUNGSKRITERIUM'),el('strong',fmt(x.punkte)+' Punkte'));c.append(head,el('h2',x.titel));
  if(x.kontext){const con=el('details');con.append(el('summary','Abschnitt / Zusatzinformationen'),el('p',x.kontext));c.append(con)}
  (x.bilder||[]).forEach(src=>image(c,src));
  const comparison=el('div',undefined,'review-comparison'),answer=el('section',undefined,'review-answer'),solution=el('section',undefined,'review-solution');answer.append(el('h4','Antwort des Prüflings'));solution.append(el('h4','Musterlösung / Bewertungskriterien'));
  const a=p.antworten?.[i];if(Array.isArray(a)&&['single','multiple'].includes(x.typ)){for(const [j,opt] of (x.optionen||[]).entries()){const row=el('div',undefined,'review-choice');row.append(el('span',(a.includes(j)?'☑ ':'☐ ')+opt));if(a.includes(j))row.dataset.selected='true';image(row,x.optionBilder?.[j]);answer.append(row);}if(!a.length)answer.append(el('p','Keine Antwort ausgewählt.','mut'))}
  else answer.append(el('p',x.typ==='praxis'?'Manuelle Bewertung':String(a??'').trim()||'Keine Antwort abgegeben.'));
  solution.append(el('p',[x.muster,...(x.richtig||[]).map(j=>x.optionen?.[j])].filter(Boolean).join('\n')||'Keine Musterlösung hinterlegt.'));
  if(x.feedback&&x.feedback!==x.muster){const more=el('details');more.append(el('summary','Originales Bewertungsfeedback'),el('p',x.feedback));solution.append(more)}
  comparison.append(answer,solution);c.append(comparison);
  if(p.automatisch?.[i]!==null&&p.automatisch?.[i]!==undefined)c.append(el('p','Automatische Auswahlbewertung: '+fmt(p.automatisch[i])+' / '+fmt(x.punkte)+' Punkte','review-automatic'));
  if(canAI(i)||d.suggestion||d.error){const panel=el('section',undefined,'review-ai');panel.append(el('h4','KI-Vorschlag'));if(d.suggestion){panel.append(el('strong',fmt(d.suggestion.punkte)+' / '+fmt(x.punkte)+' Punkte'),el('p',d.suggestion.begruendung));const use=btn('Vorschlag übernehmen',()=>{if(!editable())return;d.score=d.suggestion.punkte;d.note=[d.note,'KI-Vorschlag (geprüft): '+d.suggestion.begruendung].filter(Boolean).join('\n').slice(0,4000);changed();renderQuestion();},'p');use.disabled=!editable();panel.append(use)}else panel.append(el('p',d.error||'Noch kein Vorschlag vorhanden.','mut'));if(canAI(i)){const b=btn(d.suggestion?'Neu bewerten':'KI-Vorschlag für diese Frage',()=>requestAI([i]));b.disabled=aiRunning;panel.append(b)}c.append(panel)}
  const grading=el('div',undefined,'review-grading');const score=el('input');score.type='number';score.min='0';score.max=String(x.punkte);score.step='0.01';score.value=d.score;score.disabled=!editable();score.oninput=()=>{d.score=score.value;changed()};field(grading,'Vergebene Punkte (max. '+fmt(x.punkte)+')',score);
  const note=area(d.note,'Korrekturvermerk …');note.maxLength=4000;note.disabled=!notesEditable();note.oninput=()=>{d.note=note.value;changed()};field(grading,'Korrekturvermerk',note);c.append(grading);
  const nav=el('div',undefined,'review-question-actions');const prev=btn('← Vorherige Frage',()=>{active--;renderQuestion();refresh()});prev.disabled=i===0;const next=btn('Nächste Frage →',()=>{active++;renderQuestion();refresh()},'p');next.disabled=i===q.length-1;nav.append(prev,next);content.append(c,nav);
 }
 const bottom=box(first?'Erstkorrektur abschließen':second?'Zweitkorrektur · Übergabe zur Freigabe':'Bewertungsstand','review-finish');const overall=area('','Gesamtvermerk / Begründung');overall.maxLength=4000;const why=area('','Pflichtbegründung für Leitungsberichtigung');why.maxLength=4000;
 function collect(){const s=scoreSummary(q,draft.map(x=>x.score),p.grenze);if(s.open){const i=draft.findIndex((d,j)=>scoreSummary([q[j]],[d.score],p.grenze).open);if(i>=0){active=i;renderQuestion();refresh();}throw Error('Noch '+s.open+' unvollständige oder ungültige Bewertungen.');}return draft.map(d=>({punkte:Number(d.score),notiz:d.note}));}
 const finishStatus=el('p','','mut');finishStatus.setAttribute('role','status');bottom.append(finishStatus);
 function submit(action,body){ctx.run(async()=>{finishStatus.textContent='Bewertung wird gespeichert …';try{await ctx.api('/'+id+'/'+action,{revision:Number(p.revision),...body()});ctx.clean();if(!r.verwaltung&&action==='korrektur')await ctx.afterHandoff();else await ctx.reload(id);ctx.message(action==='korrektur'&&second?'Zweitkorrektur abgeschlossen. Ergebnis wartet auf Freigabe.':action==='korrektur'&&first?'Erstkorrektur übergeben.':'Bewertung gespeichert.');}catch(e){finishStatus.textContent=e.message;finishStatus.style.color='var(--bad)';throw e;}});}
 if(first||second){field(bottom,'Gesamtvermerk',overall);overall.oninput=()=>ctx.dirty();const finish=btn(first?'An Zweitprüfer übergeben':'Zweitkorrektur abschließen · zur Freigabe',()=>submit('korrektur',()=>{if(second&&mode==='override')throw Error('Berichtigung zuerst separat speichern und anschließend erneut bestätigen.');return second?{notiz:overall.value,bestaetigen:true,vermerke:draft.map(d=>d.note)}:{notiz:overall.value,bewertung:collect()};}),'p');bottom.append(finish);if(second)bottom.append(btn('Mit Begründung an Erstprüfer zurückgeben',()=>submit('korrektur',()=>{if(!overall.value.trim())throw Error('Begründung erforderlich.');return{notiz:overall.value,zurueck:true};}))); }
 if(override){const d=el('details',undefined,'review-override');d.append(el('summary','Leitungsfunktionen · Korrektursperre'),el('p','Änderungen werden mit Begründung protokolliert. Ursprüngliche Antworten bleiben unverändert.','mut'));field(d,'Pflichtbegründung',why);why.oninput=()=>ctx.dirty();const save=btn('Berichtigung verbindlich speichern',()=>submit('berichtigen',()=>{if(mode!=='override'||!why.value.trim())throw Error('Berichtigungsmodus aktivieren und Begründung eingeben.');return{notiz:why.value,bewertung:collect()};}),'p');save.disabled=true;d.append(btn('Berichtigungsmodus aktivieren',()=>{mode='override';save.disabled=false;ctx.dirty();renderQuestion();refresh();}),save);if(p.status!=='abgegeben')d.append(btn('Korrektur erneut öffnen',()=>{if(!why.value.trim()){ctx.message('Begründung erforderlich.',true);return;}if(confirm('Erst- und Zweitkorrektur erneut öffnen? Freigegebene Ergebnisse werden vorübergehend verborgen.'))submit('wiedereroeffnen',()=>({notiz:why.value}));}));bottom.append(d);}
 host.append(bottom);
 const history=box('Änderungsverlauf');const h=el('details');h.append(el('summary',(p.protokoll||[]).length+' Einträge anzeigen'));for(const e of p.protokoll||[]){h.append(el('p',date(e.am)+' · '+e.aktion+' · '+(e.user?reviewer(e.user):'System')+(e.notiz?' · '+e.notiz:'')+(e.prueferNachher?' · Erstprüfer: '+reviewer(e.prueferVorher.erst)+' → '+reviewer(e.prueferNachher.erst)+' · Zweitprüfer: '+reviewer(e.prueferVorher.zweit)+' → '+reviewer(e.prueferNachher.zweit)+' · '+e.prueferVorher.status+' → '+e.prueferNachher.status:e.zweitNachher?' · Zweitprüfer: '+reviewer(e.zweitVorher)+' → '+reviewer(e.zweitNachher):'')));if(e.vorher&&e.nachher){const d=el('details');d.append(el('summary','Bewertungsänderung: '+(e.vorher.ergebnis??'offen')+' → '+(e.nachher.ergebnis??'offen')+' Punkte'));for(let i=0;i<Math.max(e.vorher.bewertung?.length||0,e.nachher.bewertung?.length||0);i++){const a=e.vorher.bewertung?.[i],b=e.nachher.bewertung?.[i];if(JSON.stringify(a)!==JSON.stringify(b))d.append(el('p','Frage '+(i+1)+': '+(a?.punkte??'offen')+' → '+(b?.punkte??'offen')+' Punkte · '+(a?.notiz||'—')+' → '+(b?.notiz||'—')));}h.append(d)}}history.append(h);host.append(history);renderQuestion();refresh();
}
window.IDVReview={render,scoreSummary,duration};
})();