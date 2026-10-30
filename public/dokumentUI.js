/* Gemeinsamer Generator für RP-Verwaltungsdokumente.
   Berechtigungen, Aktenzuordnung und Speicherung werden serverseitig geprüft. */
const DG_FIELDS={
 datum:['Ausstellungsdatum','date'],unterzeichner:['Polizeilicher Unterzeichner (angemeldetes Konto)','text'],
 rang:['Dienstgrad des Unterzeichners','text'],anrede:['Anrede','select'],
 strasse:['Straße','text'],hausnummer:['Hausnummer','text'],
 wohnort:['Wohnort','text'],beginn:['Beginn des Arbeitsverhältnisses','date'],
 enddatum:['Letzter Arbeitstag','date'],probezeit:['Probezeit (Wochen)','text'],
 taetigkeit:['Nebentätigkeit / Funktion','text'],arbeitgeber:['Arbeitgeber / Unternehmen','text'],
 sachverhalt:['Sachverhalt / Begründung','textarea'],paragraphen:['Verstoß gegen Paragraphen','textarea'],
 begruendung:['Kündigungsgrund','textarea'],stufe:['Abmahnungsstufe','select-stufe'],
 praktikumsdatum:['Praktikumstag','date'],
 uhrzeit_von:['Beginn (Uhrzeit)','time'],uhrzeit_bis:['Ende (Uhrzeit)','time']
};
const DG_TYPES={
 abmahnung:['Abmahnung',['stufe','paragraphen','sachverhalt','anrede']],
 fristgerecht:['Fristgerechte Kündigung',['enddatum','anrede','strasse','hausnummer']],
 fristlos:['Fristlose Kündigung',['begruendung','anrede','strasse','hausnummer']],
 hauptvertrag:['Arbeitsvertrag Hauptberuf',['beginn','probezeit']],
 pmavertrag:['Arbeitsvertrag PMA',['beginn']],
 nebenvertrag:['Arbeitsvertrag Nebenberuf',['beginn','taetigkeit','arbeitgeber']],
 praktikum:['Praktikumsvertrag',['anrede','strasse','hausnummer','wohnort']],
 praktikumsbestaetigung:['Praktikumsbestätigung',['praktikumsdatum','uhrzeit_von','uhrzeit_bis','anrede','strasse','hausnummer']],
 nebenjob:['Nebenjobfreigabe',['arbeitgeber','anrede','strasse','hausnummer']]
};
const dgEsc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dgCodeClient=null,dgPending=null,dgClientId='',dgScript;
function dgLoadGoogle(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 if(!dgScript)dgScript=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=resolve;script.onerror=()=>reject(Error('Google-Anmeldung nicht erreichbar'));
  document.head.appendChild(script);
 });
 return dgScript;
}
void dgLoadGoogle().catch(()=>{});
const dgNow=()=>new Date().toLocaleDateString('sv-SE');
function dgField(key,defaults){
 const [label,type]=DG_FIELDS[key];const value=defaults[key]||'';
 const input=type==='textarea'?'<textarea rows="4" id="dg_'+key+'" maxlength="3000">'+dgEsc(value)+'</textarea>':
 type==='select'?'<select id="dg_'+key+'"><option value="Herr">Herr</option><option value="Frau">Frau</option></select>':
 type==='select-stufe'?'<select id="dg_'+key+'"><option value="1">1. Abmahnung</option><option value="2">2. Abmahnung</option><option value="3">3. Abmahnung</option></select>':
 '<input id="dg_'+key+'" type="'+type+'" value="'+dgEsc(value)+'" maxlength="160">';
 return '<div class="dg-input"><label for="dg_'+key+'">'+label+'</label>'+input+'</div>';
}
const dgBlocks=[
 ['Allgemeiner Pflichtverstoß','Es wurde gegen die geltende Polizeidienstvorschrift verstoßen.'],
 ['Unentschuldigtes Fernbleiben','Die betroffene Person ist dem eingeteilten Dienst ohne rechtzeitige Abmeldung ferngeblieben.'],
 ['Weisungen nicht befolgt','Eine dienstliche Anweisung wurde trotz entsprechender Belehrung nicht befolgt.'],
 ['Wiederholter Verstoß','Der beanstandete Sachverhalt ist trotz vorheriger Hinweise erneut aufgetreten.'],
 ['Dienstliche Pflichten','Die erforderlichen dienstlichen Pflichten wurden nicht in der vorgesehenen Weise erfüllt.']
];
async function dgTextbausteine(){
 let liste=dgBlocks.map(x=>({titel:x[0],inhalt:x[1]}));
 try{if(can('texte')){const more=await api('/textbausteine');if(Array.isArray(more))liste=liste.concat(more);}}catch{}
 const sel=document.getElementById('dg_block');
 if(sel)sel.innerHTML='<option value="">Textbaustein auswählen …</option>'+
   liste.map((x,i)=>'<option value="'+i+'">'+dgEsc(x.titel)+'</option>').join('');
 window.dgCurrentBlocks=liste;
}
async function dgPrepareAuth(){
  try{
   const result=await api('/dokumentgenerator/status');
   if(!result.eingerichtet)throw Error('Google OAuth ist noch nicht eingerichtet.');
   const nameInput=document.getElementById('dg_unterzeichner');
   if(nameInput){
    nameInput.value=result.ersteller||'';
    nameInput.readOnly=true;
    nameInput.title='Wird automatisch aus dem angemeldeten Benutzerkonto übernommen';
   }
   if(!result.erstellerVollstaendig)
    throw Error('Dein Benutzerkonto benötigt einen vollständigen Vor- und Nachnamen für die polizeiliche Unterschrift.');
   await dgLoadGoogle();
   if(!dgCodeClient||dgClientId!==result.clientId){
    dgClientId=result.clientId;
    dgCodeClient=google.accounts.oauth2.initCodeClient({
     client_id:dgClientId,
     // drive.file zum Anlegen der fertigen Dokumente;
     // drive.readonly zum Lesen der bestehenden, privaten Originalvorlagen.
     scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
     ux_mode:'popup',select_account:true,
     callback:async response=>{
      const job=dgPending;dgPending=null;if(!job)return;
      try{
       if(!response.code)throw Error('Google-Kontoauswahl abgebrochen');
       const saved=await api('/dokumentgenerator/erstellen',{
        method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({...job.payload,google_code:response.code})
       });
       job.dialog.close();
       await starten();
       window.open(saved.url,'_blank','noopener,noreferrer');
       alert('Dokument wurde in deinem Google Drive erzeugt und in der Akte verlinkt.');
      }catch(err){alert('Dokument konnte nicht erstellt werden: '+err.message);}
      finally{if(job.button.isConnected){job.button.disabled=false;job.button.textContent='Mit Google Drive erstellen';}}
     },
     error_callback:err=>{
      if(dgPending){const b=dgPending.button;dgPending=null;b.disabled=false;b.textContent='Mit Google Drive erstellen';}
      if(err.type!=='popup_closed')alert('Google-Anmeldung konnte nicht abgeschlossen werden.');
     }
    });
   }

  }catch(err){throw err;}
}
async function dgShow(typ,nr=0,kontext=0){
 if(!DG_TYPES[typ])return;
 const right=['abmahnung'].includes(typ)?'dis':['fristgerecht','fristlos'].includes(typ)?'kue':['praktikum','praktikumsbestaetigung'].includes(typ)?'praktika':'pers';
 if(!can(right,2))return;
 const person=(D.personal||[]).find(x=>Number(x.personalnummer)===Number(nr));
 const name=person?[person.vorname,person.nachname].join(' '):'Externe Person';
 const defaults={datum:dgNow(),beginn:person?.eintrittsdatum?String(person.eintrittsdatum).slice(0,10):dgNow(),
  unterzeichner:ME?.anzeigename||'',rang:'',
  arbeitgeber:person?.nebenjob||''};
 let dlg=document.getElementById('dgDialog');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='dgDialog';document.body.appendChild(dlg);}
 const fields=['datum','unterzeichner','rang',...DG_TYPES[typ][1]];
 const external=!person&&['praktikum','praktikumsbestaetigung'].includes(typ);
 const own=external?'<fieldset><legend>Praktikant (noch keine Personalakte)</legend>'+
   '<div class="dg-grid">'+
   '<div><label>Vorname</label><input id="dg_ext_vorname" maxlength="120" required></div>'+
   '<div><label>Nachname</label><input id="dg_ext_nachname" maxlength="120" required></div>'+
   '<div><label>Geburtsdatum</label><input type="date" id="dg_ext_geburtsdatum" required></div>'+
   '</div></fieldset>':'';
 const snippets=['abmahnung','fristlos'].includes(typ)?
  '<div class="dg-input"><label for="dg_block">Textbaustein einfügen</label><select id="dg_block"></select><p class="mut">Der Text kann anschließend vollständig bearbeitet werden.</p></div>':'';
 dlg.innerHTML='<div class="dg-head"><div><h2>'+DG_TYPES[typ][0]+'</h2><p class="mut">'+dgEsc(name)+
   (nr?' · Nr. '+Number(nr):'')+'</p></div><button type="button" id="dg_close">✕</button></div>'+
  '<p class="mut">Die Personaldaten werden automatisch aus der Akte eingesetzt. Freitextfelder kannst du bearbeiten. Die Originalvorlage bleibt unverändert. Google fragt beim ersten Mal zusätzlich nach Leserechten für bestehende Drive-Dateien, damit die geschützte Vorlage geladen werden kann.</p>'+
  '<form id="dg_form">'+own+'<div class="dg-grid">'+
   fields.map(k=>dgField(k,defaults)).join('')+'</div>'+snippets+
  '<div class="dg-bottom"><span class="fehler" id="dg_error" role="alert"></span><button type="submit" class="p" id="dg_submit">Mit Google Drive erstellen</button></div></form>';
 dlg.showModal();document.getElementById('dg_close').onclick=()=>dlg.close();
 // Name ist ausschließlich aus der Benutzeridentität zu übernehmen.
 const creatorInput=document.getElementById('dg_unterzeichner');
 if(creatorInput){
  creatorInput.readOnly=true;
  creatorInput.title='Der Name wird aus deiner aktuellen Anmeldung übernommen';
 }
 const createButton=document.getElementById('dg_submit');
 createButton.disabled=true;createButton.textContent='Google-Anmeldung wird geladen …';
 void dgPrepareAuth().then(()=>{
  if(createButton.isConnected){createButton.disabled=false;createButton.textContent='Mit Google Drive erstellen';}
 }).catch(err=>{
  if(createButton.isConnected){document.getElementById('dg_error').textContent=err.message;createButton.textContent='Google nicht verfügbar';}
 });
 if(snippets){
  void dgTextbausteine();
  document.getElementById('dg_block').onchange=e=>{
   const selected=window.dgCurrentBlocks?.[Number(e.target.value)];
   const target=document.getElementById(typ==='abmahnung'?'dg_sachverhalt':'dg_begruendung');
   if(selected&&target)target.value+=(target.value?'\n':'')+selected.inhalt;
  };
 }
 document.getElementById('dg_form').onsubmit=async e=>{
  e.preventDefault();
  const data={};
  for(const key of fields)data[key]=document.getElementById('dg_'+key)?.value?.trim()||'';
  if(!data.unterzeichner.includes(' ')){document.getElementById('dg_error').textContent='Vor- und Nachname des Unterzeichners angeben.';return;}
  const extern=external?{
   vorname:document.getElementById('dg_ext_vorname').value.trim(),
   nachname:document.getElementById('dg_ext_nachname').value.trim(),
   geburtsdatum:document.getElementById('dg_ext_geburtsdatum').value
  }:null;
  const request={typ,nr:Number(nr)||0,kontext:Number(kontext)||0,felder:data,extern};
  const btn=document.getElementById('dg_submit');btn.disabled=true;
  btn.textContent='Google-Anmeldung …';
  if(!dgCodeClient){
   document.getElementById('dg_error').textContent='Google-Anmeldung wird vorbereitet. Bitte erneut versuchen.';
   btn.disabled=false;btn.textContent='Mit Google Drive erstellen';return;
  }
  dgPending={payload:request,dialog:dlg,button:btn};
  try{dgCodeClient.requestCode();}
  catch(err){dgPending=null;document.getElementById('dg_error').textContent=err.message;btn.disabled=false;btn.textContent='Mit Google Drive erstellen';}
 };
}
window.dgShow=dgShow;
window.dgArchivLaden=async (nr,target)=>{
 const el=document.getElementById(target);if(!el)return;
 try{
  let docs=await api('/dokumentgenerator/archiv'+(nr?'?nr='+Number(nr):''));
  if(target==='dgPraktikaArchiv')docs=docs.filter(d=>['praktikum','praktikumsbestaetigung'].includes(d.typ));
  if(!el.isConnected)return;
  el.innerHTML=docs.length?docs.map(x=>'<div class="dashboard-line"><span>'+dgEsc(x.titel)+' · '+new Date(x.erstellt).toLocaleDateString('de-DE')+
   '</span><a class="l" target="_blank" rel="noopener noreferrer" href="'+dgEsc(x.url)+'">Dokument öffnen</a></div>').join(''):
   '<p class="mut">Noch keine generierten Dokumente.</p>';
 }catch(err){el.textContent='Archiv nicht verfügbar: '+err.message;}
};
window.dgPraktika=()=>{
 const persons=(D.personal||[]).filter(p=>p.vorname&&p.nachname);
 return '<h1>Praktika</h1><p class="mut">Praktikumsverträge und Bestätigungen erstellen. Auch Praktikanten ohne Personalnummer sind möglich.</p>'+
 '<div class="box">'+(can('praktika',2)?
 '<label for="dgPraktikaPerson">Personalakte übernehmen (optional)</label>'+
 '<select id="dgPraktikaPerson"><option value="0">Externer Praktikant – Daten manuell eintragen</option>'+
 persons.map(p=>'<option value="'+Number(p.personalnummer)+'">'+dgEsc(p.personalnummer+' · '+p.vorname+' '+p.nachname)+'</option>').join('')+'</select>'+
 '<div style="margin-top:12px"><button class="p" type="button" data-dg-type="praktikum">Praktikumsvertrag erstellen</button> '+
 '<button type="button" data-dg-type="praktikumsbestaetigung">Praktikumsbestätigung erstellen</button></div>':
 '<p class="mut">Du hast nur Leserechte für diesen Bereich.</p>')+'</div>'+
 '<section class="box"><h3>Praktikumsarchiv</h3><div id="dgPraktikaArchiv">Lade …</div></section>';
};
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-dg-type]');
 if(b){const k=Number(b.dataset.dgContext||0),nr=Number(b.dataset.dgNr||document.getElementById('dgPraktikaPerson')?.value||0);void dgShow(b.dataset.dgType,nr,k);}
});
