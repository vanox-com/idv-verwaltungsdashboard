/* PM-Praxisprüfung: fixed assessment form. The server calculates and validates every saved result. */
(()=>{'use strict';
const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const button=(txt,fn,cls='')=>{const b=el('button',txt,cls);b.type='button';b.onclick=fn;return b};
const select=entries=>{const s=el('select');for(const [v,t] of entries){const o=el('option',t);o.value=v;s.append(o)}return s};
const field=(p,label,input)=>{const l=el('label',label);l.append(input);p.append(l);return input};
const box=(title)=>{const b=el('section',undefined,'box exam-form');b.append(el('h3',title));return b};
const pct=v=>v===null?'—':Number(v).toLocaleString('de-DE',{maximumFractionDigits:2})+' %';
const pts=v=>Number(v).toLocaleString('de-DE',{maximumFractionDigits:2});
const round2=n=>Math.round((n+1e-9)*100)/100;
const validExtra=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000&&Math.abs(n*100-Math.round(n*100))<1e-7;
const theoryRaw=t=>t&&t.punkte!=null&&t.max!=null&&String(t.punkte).trim()!==''&&String(t.max).trim()!==''&&Number.isFinite(Number(t.punkte))&&Number.isFinite(Number(t.max))&&Number(t.max)>0&&Number(t.punkte)>=0&&Number(t.punkte)<=Number(t.max)?Number(t.punkte)/Number(t.max)*100:null;
const status=(n,theory=false)=>n===null?'Offen':n>=(theory?75:80)?'Bestanden':n>=70?'Nachprüfung erforderlich':'Nicht bestanden';
function calculate(schema,f,theory){
 const modules={},groups={},rounds=[];
 for(const [key,sets] of Object.entries(schema.sections)){
  const s=f.sections[key];let complete=true,loss=0;groups[key]=sets.map(g=>{
   let sum=0,done=true;for(const q of g.criteria){const v=s.answers[q.id];if(!v){complete=false;done=false}else sum+=q.options[v]}
   const deduction=sum*g.weight/100;loss+=deduction;return {deduction,complete:done};
  });modules[key]=complete&&validExtra(s.extra)?round2(Math.max(0,100-loss-s.extra)):null;
 }
 for(const r of f.drive.rounds){
  let complete=r.seconds!==null,safety=0;
  for(const q of schema.drive){const v=r[q.id];if(!v)complete=false;else safety+=q.options[v]}
  const delta=r.seconds===null?null:Math.abs(r.seconds-schema.targetSeconds),time=delta===null?null:delta<=2?0:delta<=5?20:delta<=8?40:60;
  rounds.push({difference:delta,timeDeduction:time===null?null:time*.3,safetyDeduction:safety*.7,score:complete?round2(Math.max(0,100-time*.3-safety*.7)):null});
 }
 let best=null;rounds.forEach((r,i)=>{if(r.score!==null&&(best===null||r.score>rounds[best].score))best=i});
 const selected=f.drive.selected??best;
 modules.drive=selected===null||rounds[selected].score===null||!validExtra(f.drive.extra)?null:round2(Math.max(0,rounds[selected].score-f.drive.extra));
 const rawTheory=theoryRaw(theory);modules.theory=rawTheory===null?null:round2(rawTheory);
 let total=0,complete=rounds.every(r=>r.score!==null);const result={};
 for(const [k,w] of Object.entries(schema.weights)){const v=modules[k];if(v===null)complete=false;const weighted=v===null?null:(k==='theory'?rawTheory:v)*w/100;total+=weighted??0;result[k]={percent:v,weight:w,weighted:weighted===null?null:Math.round((weighted+1e-9)*10000)/10000,status:status(v,k==='theory')}}
 return {modules:result,groups,rounds,best,selected,total:complete?round2(total):null};
}
async function create(host,ctx){
 const b=box('Neue PM-Praxisprüfung');host.append(b);b.append(el('p','Es werden nur PMA angezeigt, die laut aktuellem Ausbildungsmonitor zugelassen sind.','mut'));
 const r=await ctx.api('/praxis');if(!b.isConnected)return;
 const grid=el('div',undefined,'exam-form-grid');b.append(grid);
 const d=el('input');d.type='date';const now=new Date();d.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');field(grid,'Prüfungstermin',d);
 const a=field(grid,'Zugelassener Prüfling',select([['','Bitte auswählen'],...r.anwaerter.map(x=>[x.id,x.name+' · DN '+x.personalnummer])]));
 const u=field(grid,'Prüfer/in',select(ctx.data.pruefer.map(x=>[x.id,x.anzeigename+' · DN '+x.dienstnummer])));u.value=String(ctx.data.user);u.disabled=!ctx.data.leitung;
 const hint=el('p','','mut');b.append(hint);
 const update=()=>{const candidate=r.anwaerter.find(x=>String(x.id)===a.value);hint.textContent=candidate?candidate.theorie?'Freigegebene PM-Theorieprüfung: '+pts(candidate.theorie.punkte)+' / '+pts(candidate.theorie.max)+' Punkte.':'Noch kein freigegebenes Theorieergebnis. Praxisbogen kann vorbereitet, aber noch nicht abgeschlossen werden.':r.anwaerter.length?'Prüfling auswählen.':'Derzeit kein zugelassener PMA vorhanden.';};a.onchange=update;update();
 b.append(button('Praxisbogen anlegen',()=>ctx.run(async()=>{if(!a.value||!u.value||!d.value)throw Error('Termin, Prüfling und Prüfer auswählen.');const saved=await ctx.api('/praxis',{termin:d.value,anwaerter:Number(a.value),pruefer:Number(u.value)});await ctx.open(saved.id);}), 'p'));
}
async function open(host,id,ctx){
 const r=await ctx.api('/praxis/'+id);if(!host.isConnected)return;
 const f=structuredClone(r.formular),schema=r.schema,readOnly=!r.bearbeiten&&!r.berichtigen;let revision=Number(r.pruefung.revision),active='overview';let locked=readOnly||!r.bearbeiten;
 const title=box(r.pruefung.kandidat+' · PM-Praxisprüfung');title.append(el('p','Termin: '+r.termin.split('-').reverse().join('.')+' · Prüfer/in: '+r.pruefer+' · '+(r.pruefung.status==='freigegeben'?'Abgeschlossen':'In Bewertung'),'mut'));host.append(title);
 const nav=el('div',undefined,'practice-tabs');title.append(nav);
 const content=el('div');host.append(content);
 const savebar=el('section',undefined,'box practice-save');const saveHint=el('p','','mut');savebar.append(saveHint);host.append(savebar);
 const reason=el('textarea');reason.placeholder='Pflichtbegründung für nachträgliche Änderung';reason.rows=2;reason.hidden=true;
 if(r.berichtigen){savebar.append(button('Berichtigung aktivieren',()=>{locked=false;reason.hidden=false;render();},''),reason);}
 function persist(action){ctx.run(async()=>{if(locked)throw Error('Bewertung ist gesperrt.');if(![...Object.values(f.sections),f.drive].every(s=>validExtra(s.extra)))throw Error('Zusätzliche Minuspunkte müssen zwischen 0 und 1000 liegen (maximal zwei Nachkommastellen).');if(action==='berichtigen'&&!reason.value.trim())throw Error('Begründung erforderlich.');if(action==='abschliessen'&&!confirm('Prüfung verbindlich abschließen?'))return;
   const res=await ctx.api('/praxis/'+id,{revision,aktion:action,formular:f,begruendung:reason.value});revision=res.revision;r.theorie=res.theorie;refresh();ctx.clean();ctx.message(action==='speichern'?'Zwischenstand gespeichert.':'Praxisprüfung verbindlich gespeichert.');if(action==='abschliessen')await ctx.afterHandoff();else if(action==='berichtigen')await ctx.reload(id);
 });}
 if(r.bearbeiten)savebar.append(button('Zwischenstand speichern',()=>persist('speichern'),''),button('Prüfung abschließen',()=>persist('abschliessen'),'p'));
 if(r.berichtigen)savebar.append(button('Berichtigung speichern',()=>persist('berichtigen'),'p'));
 let updates=[];
 function changed(){ctx.dirty();refresh();}
 function refresh(){const result=calculate(schema,f,r.theorie);if(locked&&r.pruefung.status==='freigegeben'&&r.pruefung.ergebnis!=null){result.recalculatedTotal=result.total;result.total=Number(r.pruefung.ergebnis);}for(const fn of updates)fn(result);saveHint.textContent=result.total===null?'Gesamtergebnis offen · alle Module, drei Runden und Theorie erforderlich.':'Gesamtergebnis: '+pct(result.total)+' · '+status(result.total);}
 function infoField(parent,label,value,fn,number=false){
  const input=el(number?'input':'textarea');if(number){input.type='number';input.min='0';input.max='1000';input.step='.01';input.value=value??'';}else{input.rows=2;input.value=value||'';}input.disabled=locked;input.oninput=()=>{if(number){const n=Number(input.value);const valid=!input.validity.badInput&&validExtra(n);input.setCustomValidity(valid?'':'0 bis 1000 Minuspunkte, maximal zwei Nachkommastellen.');fn(valid?n:null)}else fn(input.value);changed()};field(parent,label,input);return input;
 }
 function options(parent,q,value,onchange){
  const row=el('div',undefined,'practice-criterion');const label=el('div');label.append(el('strong',q.label),el('small',Object.entries(q.options).map(([k,v])=>k+': −'+v).join(' · '),'mut'));const input=select([['','Bitte bewerten'],...Object.entries(q.options).map(([k,v])=>[k,(k==='grün'?'Gut (grün)':k==='gelb'?'Mittel (gelb)':k==='rot'?'Schlecht (rot)':k)])]);input.value=value||'';input.disabled=locked;
  const deduction=el('span','','practice-deduction');const sync=()=>{deduction.textContent=input.value?'−'+pts(q.options[input.value]):'—';input.dataset.rating=input.value;};sync();input.onchange=()=>{onchange(input.value);sync();changed()};row.append(label,input,deduction);parent.append(row);
 }
 function extra(parent,s){const wrap=el('div',undefined,'exam-form-grid');parent.append(wrap);infoField(wrap,'Zusätzliche Minuspunkte',s.extra,v=>s.extra=v,true);infoField(wrap,'Begründung / Notiz zu Minuspunkten',s.extraNote,v=>s.extraNote=v);infoField(parent,'Notizen',s.notes,v=>s.notes=v);}
 function overview(){
  const b=box('Gesamtauswertung');const table=el('table',undefined,'practice-results');const thead=el('thead'),tr=el('tr');for(const t of ['Modul','Anteil','Ergebnis','Gewichtet','Status'])tr.append(el('th',t));thead.append(tr);table.append(thead);const tbody=el('tbody');table.append(tbody);
  for(const [key,w] of Object.entries(schema.weights)){const row=el('tr');const link=button(schema.labels[key],()=>{active=key;render()},'');const a=el('td');a.append(link);const p=el('td'),weight=el('td'),st=el('td');row.append(a,el('td',w+' %'),p,weight,st);tbody.append(row);updates.push(result=>{const m=result.modules[key];p.textContent=pct(m.percent);weight.textContent=m.weighted===null?'—':Number(m.weighted).toLocaleString('de-DE',{maximumFractionDigits:4})+' / '+w;st.textContent=m.status;st.dataset.status=m.status;});}
  const sc=el('div',undefined,'practice-scroll');sc.append(table);b.append(sc,el('p','Gesamtergebnis = Summe der gewichteten Modulwerte. Die Theorie wird aus den erreichten / maximalen Punkten berechnet; gerundet wird erst beim Gesamtergebnis auf zwei Nachkommastellen. Gewichtete Beiträge werden mit bis zu vier Nachkommastellen angezeigt.','mut'));const total=el('div','','practice-total');b.append(total);updates.push(x=>{total.textContent=x.total===null?'Warte auf vollständige Ergebnisse':'Gesamtergebnis: '+pct(x.total)+' · '+status(x.total)+(x.recalculatedTotal!==undefined&&x.recalculatedTotal!==x.total?' (gespeicherter Abschlusswert; aktuelle Nachrechnung: '+pct(x.recalculatedTotal)+')':'');});infoField(b,'Gesamtnotizen',f.notes,v=>f.notes=v);content.append(b);
 }
 function theory(){const b=box('Theorieprüfung · 40 %');if(theoryRaw(r.theorie)!==null){const n=round2(theoryRaw(r.theorie));b.append(el('p',pts(r.theorie.punkte)+' von '+pts(r.theorie.max)+' Punkten'),el('h2',pct(n)),el('p','Freigegebenes Ergebnis aus PM-Theorieprüfung #'+r.theorie.id+' · '+status(n,true),'mut'));}else b.append(el('p','Noch keine freigegebene PM-Theorieprüfung vorhanden. Das Ergebnis wird automatisch nach Freigabe beim nächsten Laden übernommen.','mut'));content.append(b);}
 function module(key){const b=box(schema.labels[key]+' · '+schema.weights[key]+' %'),s=f.sections[key];schema.sections[key].forEach((g,i)=>{const group=el('section',undefined,'practice-group');const h=el('div',undefined,'practice-group-head');const loss=el('span');h.append(el('strong',g.label+' · '+g.weight+' %'),loss);group.append(h);g.criteria.forEach(q=>options(group,q,s.answers[q.id],v=>s.answers[q.id]=v));b.append(group);updates.push(result=>{const x=result.groups[key][i];loss.textContent='Gewichteter Abzug: −'+pts(x.deduction)+(x.complete?'':' · offen');});});extra(b,s);const total=el('p','','practice-total');b.append(total);updates.push(result=>{total.textContent='Ergebnis: '+pct(result.modules[key].percent);});content.append(b);}
 function driving(){const b=box('Fahrprüfung · 15 %');b.append(el('p','Wunschzeit 1:47 Minuten · Zeit 30 %, Sicherheit 70 %. Abweichung bis 2 / 5 / 8 Sekunden: 0 / 20 / 40 / 60 rohe Zeit-Minuspunkte.','mut'));
  const rounds=el('div',undefined,'practice-rounds');b.append(rounds);
  f.drive.rounds.forEach((round,i)=>{const card=el('section',undefined,'practice-group');card.append(el('h3','Runde '+(i+1)));const time=el('input');time.placeholder='mm:ss, z. B. 1:47';time.value=round.seconds===null?'':Math.floor(round.seconds/60)+':'+String(round.seconds%60).padStart(2,'0');time.disabled=locked;time.oninput=()=>{const m=time.value.match(/^(\d{1,2}):([0-5]\d)$/);round.seconds=m?Number(m[1])*60+Number(m[2]):null;if(round.seconds===0||round.seconds>3599)round.seconds=null;changed()};field(card,'Erreichte Zeit (mm:ss)',time);
  for(const q of schema.drive)options(card,q,round[q.id],v=>round[q.id]=v);
  const result=el('p','','practice-round-result');card.append(result);updates.push(x=>{const z=x.rounds[i];result.textContent=(z.difference===null?'Zeit offen':'Abweichung '+z.difference+' s · Zeitabzug −'+pts(z.timeDeduction))+' · Sicherheitsabzug −'+pts(z.safetyDeduction)+' · '+pct(z.score)+(x.best===i?' · Bester Versuch':'');});rounds.append(card);});
  const selection=select([['','Automatisch bester vollständiger Versuch'],['0','Runde 1'],['1','Runde 2'],['2','Runde 3']]);selection.value=f.drive.selected===null?'':String(f.drive.selected);selection.disabled=locked;selection.onchange=()=>{f.drive.selected=selection.value===''?null:Number(selection.value);changed()};field(b,'Gewerteter Versuch (in Absprache mit dem Prüfling)',selection);extra(b,f.drive);const total=el('p','','practice-total');b.append(total);updates.push(x=>{total.textContent='Gewertet: '+(x.selected===null?'—':'Runde '+(x.selected+1))+' · '+pct(x.modules.drive.percent);});content.append(b);}
 function render(){nav.replaceChildren();content.replaceChildren();updates=[];for(const [key,label] of [['overview','Übersicht'],...Object.entries(schema.labels)]){const b=button(label,()=>{active=key;render()},active===key?'p':'');nav.append(b);}if(active==='overview')overview();else if(active==='theory')theory();else if(active==='drive')driving();else module(active);refresh();}
 render();
}
window.IDVPractice={create,open,calculate};
})();
