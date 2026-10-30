/* Richtlinienpflege nur für Personen mit befricht-Recht; Server prüft erneut. */
const brEsc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.befRichtView=()=>'<h1>Beförderungsrichtlinien verwalten</h1>'+
 '<p class="mut">Eigenständiges Verwaltungsrecht: Die Beförderungsbedingungen können unabhängig von POR-Freigaben und Beförderungsrechten bearbeitet werden. Bestehende Beförderungshistorien bleiben erhalten.</p>'+
 '<div class="box"><strong>Gleichgestellte Kommissarlaufbahnen</strong><p class="mut">Polizeikommissar = Kriminalkommissar; Polizeioberkommissar = Kriminaloberkommissar; Polizeihauptkommissar = Kriminalhauptkommissar. Die Beförderungen laufen parallel, nicht abwechselnd.</p></div>'+
 '<section class="box"><h3>Dienstgrade und Fristen</h3><p class="mut">Mindestzeit, Bemerkung und Beförderungsgrund lassen sich mit dem gesonderten Recht „Beförderungsrichtlinien bearbeiten“ ändern. Dienstgradfolge und Prüfungsbindung bleiben dabei erhalten.</p><div id="brLade">Lade Dienstgrade …</div></section>';
const brAnwaerter=new Set(['Polizeimeisteranwärter','Polizeikommissaranwärter','Kriminalkommissaranwärter']);
let brEntries=[];
window.befRichtLaden=async()=>{
 const box=document.getElementById('brLade');if(!box)return;
 try{
  brEntries=await api('/befricht');
  if(!box.isConnected)return;
  const canWrite=can('befricht',2);
  box.innerHTML='<div class="tw"><table><thead><tr><th>Dienstgrad</th><th>Nächster Rang</th><th>Wartezeit</th><th>Bemerkung</th><th>Grund</th>'+(canWrite?'<th>Aktion</th>':'')+'</tr></thead><tbody>'+
   brEntries.map(r=>'<tr><td>'+brEsc(r.name)+'</td><td>'+brEsc(r.naechster_rang||'Enddienstgrad')+'</td><td>'+
    (brAnwaerter.has(r.name)?'Keine Mindestzeit':r.tage!=null?Number(r.tage)+' Tage':'–')+
    '</td><td>'+brEsc(r.bemerkung||'')+'</td><td>'+brEsc(r.grund||'')+'</td>'+
    (canWrite?'<td><button type="button" data-br-edit="'+brEsc(r.name)+'">Bearbeiten</button></td>':'')+'</tr>').join('')+
   '</tbody></table></div>';
 }catch(err){if(box.isConnected)box.textContent='Beförderungsrichtlinien konnten nicht geladen werden: '+err.message;}
};
window.befRichtEdit=name=>{
 if(!can('befricht',2))return;
 const r=brEntries.find(x=>x.name===name);
 if(!r)return;
 let dlg=document.getElementById('brEditDialog');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='brEditDialog';document.body.appendChild(dlg);}
 const timeLocked=!r.naechster_rang||brAnwaerter.has(r.name);
 dlg.innerHTML='<h2>Richtlinie · '+brEsc(r.name)+'</h2>'+
 '<p class="mut">Nächster Rang: <strong>'+brEsc(r.naechster_rang||'Enddienstgrad')+'</strong>. Der festgelegte Laufbahnzweig wird nicht verändert.</p>'+
 '<form id="brEditForm">'+
 '<label for="brDays">Mindestzeit in Tagen'+(timeLocked?' (fest ohne Mindestzeit)':'')+'</label>'+
 '<input type="number" id="brDays" min="1" max="3650" step="1" value="'+(r.tage??'')+'"'+(timeLocked?' disabled':'')+' placeholder="Keine Mindestzeit">'+
 '<p class="mut">Leer bedeutet keine automatische Beförderung nach Dienstzeit. Für PMA, PKA und KKA ist ausschließlich die jeweilige PM-, PK- oder KK-Prüfung entscheidend.</p>'+
 '<label for="brNote">Bemerkung / Voraussetzung</label><textarea id="brNote" rows="3" maxlength="1500">'+brEsc(r.bemerkung||'')+'</textarea>'+
 '<label for="brReason">Beförderungsgrund</label><input id="brReason" maxlength="500" value="'+brEsc(r.grund||'')+'">'+
 '<p class="fehler" id="brError" role="alert"></p>'+
 '<div class="por-actions"><button type="button" id="brCancel">Abbrechen</button><button class="p" type="submit" id="brSave">Speichern</button></div></form>';
 dlg.showModal();
 document.getElementById('brCancel').onclick=()=>dlg.close();
 document.getElementById('brEditForm').onsubmit=async ev=>{
  ev.preventDefault();const btn=document.getElementById('brSave'),value=document.getElementById('brDays').value.trim();
  const days=timeLocked||!value?null:Number(value);
  if(days!==null&&(!Number.isSafeInteger(days)||days<1||days>3650)){
   document.getElementById('brError').textContent='Bitte eine gültige Wartezeit zwischen 1 und 3650 Tagen eintragen.';return;
  }
  btn.disabled=true;
  try{
   await api('/befricht/'+encodeURIComponent(r.name),{
    method:'PATCH',body:JSON.stringify({tage:days,bemerkung:document.getElementById('brNote').value,grund:document.getElementById('brReason').value})
   });
   dlg.close();
   await starten();
  }catch(err){document.getElementById('brError').textContent='Speichern fehlgeschlagen: '+err.message;}
  finally{btn.disabled=false;}
 };
};
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-br-edit]');
 if(b){event.preventDefault();window.befRichtEdit(b.dataset.brEdit);}
});
