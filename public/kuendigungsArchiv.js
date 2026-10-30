/* Aufrufbare Kündigungs-Personalakte; zeigt unveränderte Momentaufnahme,
   einzelne Dokumentlinks und historische Vorlagen nur mit passenden Rechten. */
(()=>{
 const titles={
  personalnummer:'Personalnummer',vorname:'Vorname',nachname:'Nachname',
  dienstgrad:'Dienstgrad',status:'Status',gruppe:'Mitarbeitergruppe',
  beschaeftigungsart:'Beschäftigungsart',eintrittsdatum:'Dienstantritt',
  geburtsdatum:'Geburtsdatum',handy:'Telefon',waffenschein:'Waffenschein',
  spind:'Spind',nebenjob:'Nebenjob',arbeitsvertrag:'Arbeitsvertrag',
  arbeitsvertrag_url:'Vertrag (Link)',ernennungsurkunde:'Ernennungsurkunde',
  ernennungsurkunde_url:'Ernennungsurkunde (Link)',letzte_befoerderung:'Letzte Beförderung',
  naechste_befoerderung:'Nächste Beförderung',por_status:'POR-Status',
  urlaub_von:'Urlaub von',urlaub_bis:'Urlaub bis',urlaub_tage:'Urlaubstage',
  bemerkung:'Bemerkung',rsa:'RSA',dienststelle_id:'Dienststelle'
 };
 const fmt=x=>{
  if(x==null||x==='')return '–';
  if(x===true)return 'Ja';if(x===false)return 'Nein';
  if(typeof x==='object')return JSON.stringify(x);
  return String(x);
 };
 const urlValue=x=>{
  try{
   const u=new URL(String(x||'').trim());
   if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.'))return u.href;
  }catch{}
  return '';
 };
 const content=x=>{
  const val=fmt(x),url=urlValue(val);
  return url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">Dokument öffnen ↗</a>':esc(val);
 };
 const cell=(key,value)=>'<div><small>'+esc(titles[key]||key.replaceAll('_',' '))+'</small>'+
  '<div>'+content(value)+'</div></div>';
 const date=x=>x?new Date(x).toLocaleString('de-DE',{dateStyle:'medium'}):'–';
 const doc=(name,value)=>{
  const item=kueDokInfo(value);
  const label=item.name||name;
  const link=urlValue(item.url);
  return '<div><strong>'+esc(name)+': </strong>'+
   (link?'<a target="_blank" rel="noopener noreferrer" href="'+esc(link)+'">'+esc(label)+' ↗</a>':
     esc(label)+' <span class="mut">(kein Dokumentlink hinterlegt)</span>')+'</div>';
 };
 async function akte(id){
  if(!Number.isSafeInteger(id)||id<1||!can('kue'))return;
  let dialog=document.getElementById('kueAkteDialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='kueAkteDialog';document.body.append(dialog);}
  dialog.innerHTML='<h2>Kündigungsakte</h2><p class="mut">Vollständige Momentaufnahme und Dokumentverweise werden geladen …</p>'+
   '<div class="actions"><button type="button" data-kue-akte-close>Schließen</button></div>';
  dialog.showModal();
  try{
   const info=await api('/kuendigungen/'+id+'/akte');
   if(!dialog.open)return;
   const k=info.vorgang,shot=info.momentaufnahme||{},p=shot.personal;
   const quelle=shot.quelle==='bei_erstellung'?'Gesichert bei Anlage des Kündigungsvorgangs':
    shot.quelle==='nachtraeglich_aus_aktuellem_personal'?
    'Nachträglich gesicherter Personalstand (nicht der historische Stand am Kündigungstag)':
    'Keine ursprüngliche Personalakte zuordenbar';
   const files=(info.dokumente||[]).map(x=>doc(x.name,x.wert)).join('')||
     '<p class="mut">Keine Dokumente vorhanden.</p>';
   const allGenerated=[
     ...(shot.generierte_dokumente||[]),
     ...(shot.kuendigungsdokumente_nachtraeglich||[])
   ].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i);
   const generated=allGenerated.map(x=>{
    const link=urlValue(x.url);
    return '<div><strong>'+esc(x.titel||x.typ||'Dokument')+'</strong> · '+
      (link?'<a target="_blank" rel="noopener noreferrer" href="'+esc(link)+'">Öffnen ↗</a>':
      '<span class="mut">Link nicht verfügbar</span>')+'</div>';
   }).join('');
   const pers=p&&typeof p==='object'?
    '<div class="kue-akte-grid">'+Object.entries(p).filter(([key])=>key!=='_revision').map(([key,v])=>cell(key,v)).join('')+'</div>':
    '<p class="mut">Für diesen Vorgang liegt keine zugängliche Personal-Momentaufnahme vor. Vorhandene Kündigungsunterlagen bleiben unten verlinkt.</p>';
   dialog.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">'+
    '<div><h2>Kündigungsakte · '+esc([k.vorname,k.nachname].filter(Boolean).join(' '))+'</h2>'+
    '<p class="mut">Personalnummer '+esc(k.personalnummer)+' · Vorgang #'+Number(k.id)+'</p></div>'+
    '<button type="button" data-kue-akte-close>Schließen</button></div>'+
    '<section class="box"><h3>Kündigung</h3>'+
    '<div class="kue-akte-grid">'+cell('grund',k.grund)+cell('Dienstgrad',k.rang)+
    cell('Dienstantritt',k.eintritt)+cell('Kündigungsdatum',k.kuendigungsdatum||k.erfasst_am||'Nicht erfasst')+'</div></section>'+
    '<section class="box"><h3>Dokumente aus dem Kündigungsvorgang</h3>'+
    '<div class="kue-akte-docs">'+files+'</div></section>'+
    '<section class="box"><h3>Gesicherte Personalakte</h3>'+
    '<p class="mut">'+esc(quelle)+' · gespeichert: '+esc(date(shot.gesichert_am))+'</p>'+pers+'</section>'+
    (generated?'<section class="box"><h3>Zusätzlich generierte Dokumente</h3>'+
      '<div class="kue-akte-docs">'+generated+'</div></section>':'');
  }catch(err){
   if(dialog.open)dialog.innerHTML='<h2>Kündigungsakte</h2><p class="fehler">'+
    esc(err.message)+'</p><button type="button" data-kue-akte-close>Schließen</button>';
  }
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-kue-akte-close]');
  if(b)document.getElementById('kueAkteDialog')?.close();
 });
 window.IDVKueArchiv={akte};
})();