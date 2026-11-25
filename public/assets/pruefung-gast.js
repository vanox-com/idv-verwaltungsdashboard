(()=>{'use strict';
const token=location.hash.slice(1),root=document.getElementById('root'),msg=document.getElementById('message'),clock=document.getElementById('clock'),title=document.getElementById('title');
let s=null,answers=[],index=0,dirty=false,saving=false,finished=false,lastFocus=null,offset=0,timer=null,saveTimer=null,conflict=false;
const node=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
const btn=(txt,fn)=>{const b=node('button',txt);b.type='button';b.onclick=fn;return b;};
function message(t,bad=false){msg.textContent=t;msg.className=bad?'error':''}
async function call(action,b={},keepalive=false){const r=await fetch('/api/pruefung-gast/'+action,{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...b}),keepalive});const j=await r.json().catch(()=>({}));if(!r.ok){const e=Error(j.error||'HTTP '+r.status);e.status=r.status;throw e;}return j}
function sync(j){s=j;offset=j.serverZeit*1000-Date.now();title.textContent=j.titel;}
function event(kind){if(s?.status==='laufend'&&!finished)void call('fokus',{ereignis:kind},true).catch(()=>{});}
function focus(){const v=document.visibilityState==='hidden'||!document.hasFocus();if(v===lastFocus)return;lastFocus=v;event(v?'verlassen':'zurueck');}
function complete(j){sync(j);finished=true;clearInterval(timer);clearTimeout(saveTimer);clock.textContent='';root.replaceChildren();const c=node('section',undefined,'card');
 c.append(node('h2',j.status==='freigegeben'?(j.bestanden?'Bestanden':'Nicht bestanden'):'Prüfung abgegeben'));
 c.append(node('p',j.status==='freigegeben'?j.ergebnis+' / '+j.max+' Punkte':'Die Prüfung kann nicht mehr bearbeitet werden. Die Prüfer müssen das Ergebnis noch freigeben.'));
 c.append(btn('Ergebnis aktualisieren',async()=>{try{const d=await call('status');complete(d);message('Status aktualisiert.')}catch(e){message(e.message,true)}}));root.append(c);}
function renderStart(){root.replaceChildren();const c=node('section',undefined,'card');c.append(node('h2','Hinweise vor Prüfungsbeginn'),node('p','Bearbeitungszeit: '+s.minuten+' Minuten. Der Server bestimmt das Ende. Antworten werden regelmäßig übertragen; bei Zeitablauf zählt der zuletzt gespeicherte Stand. Der Link ermöglicht genau einen Versuch und darf nicht weitergegeben werden.'));
 c.append(node('p','Tab- und Fensterwechsel, Rückkehr, Neuladen, Verlassen des Vollbilds und Einfügevorgänge innerhalb der Prüfungsseite können protokolliert werden. Dies sind Hinweise, keine sicheren Täuschungsnachweise. Keine Überwachung fremder Programme, Kamera oder Bildschirm.'));
 const chk=node('input');chk.type='checkbox';const l=node('label',' Hinweise gelesen und einverstanden.');l.prepend(chk);c.append(l);
 const b=btn('Prüfung verbindlich starten',async()=>{if(!chk.checked)return;b.disabled=true;try{const j=await call('start',{einverstanden:true});start(j)}catch(e){message(e.message,true);b.disabled=false}});b.style.display='block';b.style.marginTop='16px';c.append(b);root.append(c);}
function answered(i){const a=answers[i];return Array.isArray(a)?a.length>0:Boolean(a.trim())}
function progress(){const p=document.getElementById('progress');if(!p)return;p.replaceChildren();answers.forEach((_,i)=>{const b=btn(String(i+1),()=>{index=i;renderQuestion()});b.className=(answered(i)?'done ':'')+(i===index?'active':'');p.append(b)});}
function changed(){dirty=true;progress();clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(false),700);message('Änderungen werden gespeichert …')}
function renderQuestion(){if(finished||!s?.fragen)return;const q=s.fragen[index];root.replaceChildren();const c=node('section',undefined,'card');c.append(node('div','Frage '+(index+1)+' von '+s.fragen.length+' · '+q.punkte+' Punkte','muted'),node('h2',q.titel));
 if(q.typ==='text'){const a=node('textarea');a.value=answers[index];a.maxLength=4000;a.oninput=()=>{answers[index]=a.value;changed()};c.append(a)}
 else q.optionen.forEach((o,i)=>{const l=node('label',undefined,'option');const a=node('input');a.type=q.typ==='single'?'radio':'checkbox';a.name='choice';a.checked=answers[index].includes(i);a.onchange=()=>{if(q.typ==='single')answers[index]=[i];else answers[index]=a.checked?[...answers[index],i]:answers[index].filter(x=>x!==i);changed()};l.append(a,node('span',o));c.append(l)});
 const p=node('div');p.id='progress';const act=node('div',undefined,'actions');const prev=btn('Zurück',()=>{index--;renderQuestion()});prev.disabled=index===0;const next=btn('Weiter',()=>{index++;renderQuestion()});next.disabled=index===s.fragen.length-1;const done=btn('Endgültig abgeben',()=>{if(confirm('Prüfung wirklich abgeben? '+answers.filter((_,i)=>answered(i)).length+' von '+answers.length+' Fragen beantwortet.'))void save(true)});act.append(prev,next,done);root.append(c,p,act);progress();}
async function save(submit){
 if(finished||conflict)return;
 if(saving){if(submit){message('Speichervorgang läuft. Bitte anschließend erneut abgeben.')}return;}
 if(!dirty&&!submit)return;saving=true;
 const snapshot=JSON.stringify(answers);
 try{const j=await call(submit?'abgeben':'speichern',{antworten:JSON.parse(snapshot),revision:s.revision});sync(j);if(j.status!=='laufend'){complete(j);message('Prüfung abgegeben.');return}dirty=JSON.stringify(answers)!==snapshot;message(dirty?'Weitere Änderungen werden gespeichert …':'Antworten gespeichert.');}
 catch(e){if(e.status===409){try{const d=await call('status');if(d.status!=='laufend'){complete(d);message('Bearbeitungszeit beendet. Zuletzt gespeicherte Antworten zählen.');return}}catch{}conflict=true;message('Speicherkonflikt. Bitte Prüfungsseite neu laden. Ungespeicherte Antworten bleiben nur in diesem Fenster sichtbar.',true);}else message('Speichern fehlgeschlagen – Verbindung prüfen. Erneuter Versuch folgt.',true);}
 finally{saving=false;}
}
function tick(){if(finished||!s?.ende)return;const remaining=Math.max(0,Math.ceil((s.ende*1000-Date.now()-offset)/1000));clock.textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');if(remaining===0&&!saving){root.querySelectorAll('textarea,input,button').forEach(e=>e.disabled=true);void call('status').then(j=>{if(j.status!=='laufend'){complete(j);message('Zeit abgelaufen. Prüfung automatisch abgegeben.')}}).catch(()=>message('Zeit abgelaufen. Der Server akzeptiert keine weiteren Antworten.',true))}}
function start(j){sync(j);answers=j.antworten;finished=false;lastFocus=document.visibilityState==='hidden'||!document.hasFocus();renderQuestion();message('Prüfung läuft.');clearInterval(timer);timer=setInterval(()=>{tick();if(dirty&&!saving)void save(false)},1000);tick()}
document.addEventListener('visibilitychange',focus);window.addEventListener('blur',focus);window.addEventListener('focus',focus);
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)event('vollbild_aus')});
document.addEventListener('paste',()=>event('paste'));
window.addEventListener('beforeunload',e=>{if(dirty&&!finished){e.preventDefault();e.returnValue=''}});
(async()=>{try{if(!/^[a-f0-9]{64}$/.test(token))throw Error('Ungültiger Prüfungslink.');const j=await call('status');sync(j);if(j.status==='bereit'){message('Bereit für den Prüfungsbeginn.');renderStart()}else if(j.status==='laufend'){start(j);event('reload')}else{complete(j);message('Prüfungsstatus geladen.')}}catch(e){message(e.message,true)}})();
})();