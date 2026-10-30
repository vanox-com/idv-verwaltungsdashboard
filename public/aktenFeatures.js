/* IDV: zusätzliche Aktenoberflächen */
(()=>{
const labels={personal:'Personal',kuendigungen:'Kündigungen',disziplin:'Disziplin',sonderfunktionen:'Sonderfunktionen',checklisten:'Checklisten',textbausteine:'Textbausteine',routine:'Routine',sonderzahlungen:'Sonderzahlungen',bef:'Beförderungen'};
const fieldNames={vorname:'Vorname',nachname:'Nachname',dienstgrad:'Dienstgrad',status:'Status',gruppe:'Mitarbeitergruppe',beschaeftigungsart:'Beschäftigungsart',eintrittsdatum:'Dienstantritt',letzte_befoerderung:'Letzte Beförderung',naechste_befoerderung:'Nächste Beförderung',por_status:'POR-Status',waffenschein:'Waffenschein',spind:'Spind',rsa:'RSA',nebenjob:'Nebenjob',aufgaben:'Aufgaben',sortierung:'Sortierung',slots:'Maßnahmen',bemerkung:'Bemerkung',leitung:'Leitung',sonstige:'Sonstiges',werte:'Qualifikationen',kategorie:'Kategorie',titel:'Titel',inhalt:'Inhalt',geloescht:'Gelöscht',tage:'Termine',personen:'Teilnehmende',erhalten:'Erhalten',betrag:'Betrag',datum:'Datum',grund:'Grund'};
const fmt=x=>{
 if(x===null||x===undefined||x==='')return '–';
 if(x===true)return 'Ja';if(x===false)return 'Nein';
 return typeof x==='object'?JSON.stringify(x,null,2):String(x);
};
const datum=x=>{
 if(!x)return 'Ohne Datum';
 const d=new Date(x);
 return Number.isNaN(d.getTime())?String(x):d.toLocaleString('de-DE',{dateStyle:'medium',...(String(x).includes('T')?{timeStyle:'short'}:{})});
};
function styles(){
 if(document.getElementById('idvAktenStyle'))return;
 const s=document.createElement('style');s.id='idvAktenStyle';
 s.textContent=[
 '.idv-history{display:grid;gap:10px;max-height:520px;overflow-y:auto;margin-top:14px}',
 '.idv-event{background:#172839;border-left:3px solid #7291af;border-radius:8px;padding:12px}',
 '.idv-event summary{cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}',
 '.idv-event small,.idv-trash-meta{color:#a7bacd;font-size:12px}',
 '.idv-diff{display:grid;gap:8px;margin-top:12px}',
 '.idv-diff-item{border-top:1px solid #3a5065;padding-top:8px}',
 '.idv-diff-values{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:6px}',
 '.idv-diff-values>div{background:#112031;min-width:0;padding:8px;border-radius:6px}',
 '.idv-diff-values small{display:block;margin-bottom:6px}',
 '.idv-diff-values pre{margin:0;color:#ecf2fb;font:12px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow-y:auto}',
 '.idv-trash-list{display:grid;gap:10px;margin-top:18px}',
 '.idv-trash-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px;background:#192b3c;border:1px solid #3b5168;border-radius:9px}',
 '@media(max-width:650px){.idv-diff-values{grid-template-columns:1fr}}'
 ].join('');
 document.head.append(s);
}
function renderDiff(rows){
 if(!rows?.length)return '<p class="mut">Keine Feldänderungen gespeichert.</p>';
 return '<div class="idv-diff">'+rows.map(r=>
  '<div class="idv-diff-item"><strong>'+esc(fieldNames[r.feld]||r.feld)+'</strong>'+
  '<div class="idv-diff-values"><div><small>Vorher</small><pre>'+esc(fmt(r.alt))+'</pre></div>'+
  '<div><small>Nachher</small><pre>'+esc(fmt(r.neu))+'</pre></div></div></div>'
 ).join('')+'</div>';
}
function eventCard(e,sub){
 return '<details class="idv-event"><summary><span><strong>'+esc(e.titel||e.vorgang)+'</strong>'+
  '<small style="display:block">'+esc(sub)+'</small></span><small>'+esc(datum(e.zeit))+'</small></summary>'+
  renderDiff(e.details)+'</details>';
}
async function laufbahn(nr,el){
 styles();if(!el)return;
 el.textContent='Personallaufbahn wird geladen …';
 try{
  const d=await api('/akten/'+nr+'/laufbahn');
  if(!el.isConnected||!document.getElementById('personalDialog')?.open)return;
  el.innerHTML='<h3>Digitale Personallaufbahn · '+esc(d.person?.name||'')+'</h3>'+
   '<p class="mut">Dienstantritt, Beförderungen, Anträge, Dokumente und berechtigte Aktenänderungen. Feldvergleiche werden ab der Einführung des neuen Journals erfasst.</p>'+
   '<div class="idv-history">'+(d.ereignisse?.length?d.ereignisse.map(e=>eventCard(e,(labels[e.bereich]||e.bereich)+(e.benutzer?' · '+e.benutzer:''))).join(''):
   '<p class="mut">Noch keine Laufbahneinträge vorhanden.</p>')+'</div>';
 }catch(err){if(el.isConnected)el.textContent='Laufbahn konnte nicht geladen werden: '+err.message;}
}
async function vergleich(){
 styles();
 const el=document.getElementById('idvVergleich');if(!el)return;
 el.innerHTML='<h3>Änderungsvergleich</h3><p class="mut">Lade Änderungen …</p>';
 try{
  const list=await api('/aenderungsvergleich?limit=120');
  if(!el.isConnected||tab!=='log')return;
  const bereiche=[...new Set(list.map(x=>x.bereich))];
  el.innerHTML='<h3>Änderungshistorie mit Vergleich</h3>'+
   '<p class="mut">Neue Änderungen ab Aktivierung des Journals; bisherige Personal-Auditeinträge bleiben oben erhalten. Fehlt die Zuordnung zu einem Benutzer, steht „Automatisch erfasst“.</p>'+
   '<label for="idvDiffFilter">Bereich</label><select id="idvDiffFilter"><option value="">Alle berechtigten Bereiche</option>'+
   bereiche.map(x=>'<option value="'+esc(x)+'">'+esc(labels[x]||x)+'</option>').join('')+'</select>'+
   '<div class="idv-history" id="idvDiffRows"></div>';
  const render=()=>{
   const filter=document.getElementById('idvDiffFilter')?.value;
   const rows=list.filter(x=>!filter||x.bereich===filter);
   const dest=document.getElementById('idvDiffRows');
   if(dest)dest.innerHTML=rows.length?rows.map(x=>eventCard({...x,titel:(labels[x.bereich]||x.bereich)+' · '+x.vorgang},'Datensatz '+x.schluessel+' · '+(x.benutzer||'Automatisch erfasst'))).join(''):
    '<p class="mut">Keine Änderungen vorhanden.</p>';
  };
  document.getElementById('idvDiffFilter')?.addEventListener('change',render);
  render();
 }catch(err){if(el.isConnected)el.innerHTML='<h3>Änderungsvergleich</h3><p class="fehler">'+esc(err.message)+'</p>';}
}
async function papierkorb(){
 styles();const el=document.getElementById('inhalt');
 if(!el||tab!=='papierkorb')return;
 el.innerHTML='<h1>Papierkorb</h1><p class="mut">Lade wiederherstellbare Vorgänge …</p>';
 try{
  const list=await api('/papierkorb');if(tab!=='papierkorb'||!el.isConnected)return;
  el.innerHTML='<h1>Papierkorb</h1><p class="mut">Gelöschte Kündigungsvorgänge, Checklisten und Textbausteine können hier wiederhergestellt werden. Administrativ entfernte Personal-Datensätze sind ausschließlich für Administratoren sichtbar und bleiben mit ihren Verknüpfungen erhalten. Frühere endgültige Löschungen können nicht nachträglich rekonstruiert werden.</p>'+
   '<p id="idvTrashInfo" class="mut" role="status"></p><div class="idv-trash-list">'+
   (list.length?list.map(x=>'<div class="idv-trash-row"><div><strong>'+esc(x.titel)+'</strong><div class="idv-trash-meta">'+
    esc(labels[x.bereich]||x.bereich)+' · '+esc(x.schluessel)+' · '+esc(datum(x.geloescht_am))+
    ' · '+esc(x.geloescht_von||'Unbekannt')+'</div></div>'+
    (can('papierkorb',2)?'<button type="button" data-idv-restore="'+Number(x.id)+'">Wiederherstellen</button>':'')+'</div>').join(''):
   '<p class="mut">Der Papierkorb ist leer.</p>')+'</div>';
 }catch(err){if(tab==='papierkorb')el.innerHTML='<h1>Papierkorb</h1><p class="fehler">'+esc(err.message)+'</p>';}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-idv-restore]');
 if(!b||!can('papierkorb',2))return;
 const id=Number(b.dataset.idvRestore);
 if(!Number.isSafeInteger(id)||id<1||!confirm('Diesen Eintrag mit seinen gespeicherten Daten wiederherstellen?'))return;
 b.disabled=true;
 try{await api('/papierkorb/'+id+'/wiederherstellen',{method:'POST'});await papierkorb();}
 catch(err){const el=document.getElementById('idvTrashInfo');if(el)el.textContent='Wiederherstellung fehlgeschlagen: '+err.message;b.disabled=false;}
});
window.IDVAkten={laufbahn,vergleich,papierkorb};
})();
