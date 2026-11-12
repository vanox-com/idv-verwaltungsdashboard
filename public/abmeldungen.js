/* Abmeldungen aus dem Polizei-Discord-Bot (/abmelden).
   Daten und Ablauf liegen beim Bot; das Panel zeigt sie an und löst
   „Annehmen“/„Ablehnen“ serverseitig aus – mit denselben Folgen wie die
   Discord-Buttons (Personaltabelle, Abmeldungskanal, DM, Genehmigungs-Embed).
   Zugriff: Modul „abm“ (Stufe 1 lesen, Stufe 2 entscheiden). */
(()=>{
 const STATUS={offen:['Offen','warn'],angenommen:['Angenommen','ok'],abgelehnt:['Abgelehnt','bad']};
 let daten=null,filter='offen',suche='',laeuft=false,meldung='';
 const zeit=iso=>{if(!iso)return '–';const d=new Date(iso);return isNaN(d)?'–':d.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});};
 const aktiv=()=>tab==='abm';
 async function laden(){
  if(!can('abm')){$('#inhalt').innerHTML='<p>Für Abmeldungen fehlt die Berechtigung.</p>';return;}
  if(!daten)$('#inhalt').innerHTML='<h1>Abmeldungen</h1><p class="mut">Lade Abmeldungen vom Polizei-Bot …</p>';
  try{
   const r=await api('/abmeldungen');
   if(!aktiv())return;
   daten=Array.isArray(r?.abmeldungen)?r.abmeldungen:[];
   zeichnen();
  }catch(e){
   if(aktiv())$('#inhalt').innerHTML='<h1>Abmeldungen</h1><p class="fehler">Abmeldungen konnten nicht geladen werden: '+esc(e.message)+'</p>'+
    '<p><button type="button" data-abm-reload>Erneut versuchen</button></p>';
  }
 }
 function zeichnen(){
  if(!aktiv())return;
  const schreiben=can('abm',2);
  const alle=daten||[];
  const anzahl=s=>alle.filter(a=>a.status===s).length;
  const q=suche.trim().toLowerCase();
  const liste=alle.filter(a=>(filter==='alle'||a.status===filter)&&
   (!q||[a.dienstnummer,a.erstelltVon,a.begruendung,a.von,a.bis,a.entschiedenVon?.name].join(' ').toLowerCase().includes(q)));
  const tabs='<div class="kue-archive-toolbar" role="group" aria-label="Status filtern">'+
   [['offen','Offen · '+anzahl('offen')],['angenommen','Angenommen · '+anzahl('angenommen')],
    ['abgelehnt','Abgelehnt · '+anzahl('abgelehnt')],['alle','Alle · '+alle.length]]
   .map(([k,l])=>'<button type="button" data-abm-filter="'+k+'" class="'+(filter===k?'active':'')+'">'+esc(l)+'</button>').join('')+
   '<span class="spacer"></span><button type="button" data-abm-reload'+(laeuft?' disabled':'')+'>Aktualisieren</button></div>';
  const zeilen=liste.map(a=>{
   const [label,cls]=STATUS[a.status]||[a.status,''];
   const entschieden=a.status==='offen'?(a.fehler?'<small class="fehler">Letzter Versuch: '+esc(a.fehler)+'</small>':'–'):
    esc(a.entschiedenVon?.name||'–')+(a.entschiedenVon?.quelle?' <small class="mut">('+esc(a.entschiedenVon.quelle)+')</small>':'')+
    '<br><small class="mut">'+esc(zeit(a.entschiedenAm))+'</small>';
   const aktionen=a.status==='offen'&&schreiben?
    '<button type="button" class="p" data-abm-entscheid="annehmen" data-abm-id="'+esc(a.id)+'"'+(laeuft?' disabled':'')+'>Annehmen</button> '+
    '<button type="button" data-abm-entscheid="ablehnen" data-abm-id="'+esc(a.id)+'"'+(laeuft?' disabled':'')+'>Ablehnen</button>':'';
   return '<tr><td><span class="tag '+cls+'">'+esc(label)+'</span></td>'+
    '<td>'+esc(a.dienstnummer||'–')+'</td>'+
    '<td>'+esc(a.erstelltVon||'–')+'<br><small class="mut">'+esc(zeit(a.erstelltAm))+'</small></td>'+
    '<td>'+esc(a.von||'–')+' – '+esc(a.bis||'–')+'</td>'+
    '<td style="white-space:pre-wrap;max-width:420px">'+esc(a.begruendung||'–')+'</td>'+
    '<td>'+entschieden+'</td>'+
    (schreiben?'<td style="white-space:nowrap">'+aktionen+'</td>':'')+'</tr>';
  }).join('');
  $('#inhalt').innerHTML='<h1>Abmeldungen</h1>'+
   '<p class="mut">Abmeldungen aus dem Polizei-Discord-Bot (<code>/abmelden</code>). Annehmen oder Ablehnen wirkt genau wie der Button im Discord-Genehmigungskanal: Eintrag in die Personaltabelle, Nachricht im Abmeldungskanal, DM an die Person und Aktualisierung der Genehmigungsnachricht.</p>'+
   tabs+
   '<div class="pers-bar"><input id="abmSuche" type="search" placeholder="Dienstnummer, Name oder Begründung …" aria-label="Abmeldungen durchsuchen" value="'+esc(suche)+'">'+
   '<span class="spacer"></span><span class="mut">'+liste.length+' Einträge</span></div>'+
   '<p id="abmMeldung" class="mut" role="status" aria-live="polite">'+esc(meldung)+'</p>'+
   (liste.length?'<div class="tw"><table><thead><tr><th>Status</th><th>Dienstnr.</th><th>Erstellt von</th><th>Zeitraum</th><th>Begründung</th><th>Bearbeitet von</th>'+
    (schreiben?'<th>Aktion</th>':'')+'</tr></thead><tbody>'+zeilen+'</tbody></table></div>':'<p>Keine Abmeldungen in dieser Ansicht.</p>');
 }
 async function entscheiden(id,aktion){
  const a=(daten||[]).find(x=>x.id===id);
  if(!a||!can('abm',2)||laeuft)return;
  const text=(aktion==='annehmen'?'Abmeldung ANNEHMEN?':'Abmeldung ABLEHNEN?')+'\n'+
   'Dienstnummer '+a.dienstnummer+' · '+a.von+' – '+a.bis+'\n'+(a.erstelltVon||'')+'\n\n'+
   (aktion==='annehmen'?'Wird in die Personaltabelle eingetragen, im Abmeldungskanal gepostet und die Person per DM informiert.':
    'Die Person wird per DM über die Ablehnung informiert.');
  if(!confirm(text))return;
  laeuft=true;meldung=aktion==='annehmen'?'Abmeldung wird angenommen …':'Abmeldung wird abgelehnt …';zeichnen();
  try{
   const r=await api('/abmeldungen/'+encodeURIComponent(id)+'/entscheidung',{method:'POST',body:JSON.stringify({aktion})});
   meldung=aktion==='annehmen'?'Abmeldung angenommen – Personaltabelle, Abmeldungskanal und DM erledigt.':'Abmeldung abgelehnt – die Person wurde per DM benachrichtigt.';
   if(r?.abmeldung)daten=(daten||[]).map(x=>x.id===id?r.abmeldung:x);
  }catch(e){meldung='Fehler: '+e.message;}
  laeuft=false;
  await laden();
 }
 document.addEventListener('click',e=>{
  if(!aktiv())return;
  const f=e.target.closest('[data-abm-filter]');
  if(f){filter=f.dataset.abmFilter;meldung='';zeichnen();return;}
  if(e.target.closest('[data-abm-reload]')){meldung='';laden();return;}
  const b=e.target.closest('[data-abm-entscheid]');
  if(b){entscheiden(b.dataset.abmId,b.dataset.abmEntscheid);}
 });
 document.addEventListener('input',e=>{
  if(!aktiv()||e.target.id!=='abmSuche')return;
  suche=e.target.value;const pos=e.target.selectionStart;zeichnen();
  const el=$('#abmSuche');if(el){el.focus();try{el.setSelectionRange(pos,pos);}catch{}}
 });
 window.IDVAbmeldungen={laden};
})();
