/* Portalweite Popup-Einstellungen. Keine Änderung fachlicher Freigaben. */
(()=>{
 const groups=[
   {title:'POR-Freigaben',desc:'Orange Hinweise für berechtigte Entscheider.',items:[
     ['por_bef','Beförderungsfreigaben','Offene reguläre POR-Freigabeanfragen.'],
     ['por_rang','Rangänderungsanträge','Offene Anträge auf Rangänderung.']
   ]},
   {title:'PMA · Ausbildungsbenachrichtigungen',desc:'Rote Hinweise für berechtigte Ausbilder.',items:[
     ['pma_warnung','Zieltermin nähert sich','Ab Tag 7 bis Tag 9, wenn noch Stimmenpunkte fehlen und weitere Voraussetzungen offen sind.'],
     ['pma_stimmen','Nur Stimmen fehlen','Sofort, wenn Module und RSA erfüllt sind und nur Stimmen fehlen (vor Tag 10 oder ohne Eintrittsdatum).'],
     ['pma_dringend','10-Tage-Ziel erreicht','Ab Tag 10 bei fehlenden Stimmenpunkten.']
   ]}
 ];
 let flags=null,account='',timer=null,inFlight=null,sequence=0,saving=false;
 const keys=groups.flatMap(g=>g.items.map(i=>i[0]));
 const who=()=>String(ME?.id??ME?.dienstnummer??'');
 const allowed=()=>typeof can==='function'&&can('benachrichtigungen');
 const enabled=key=>flags?.[key]===true;
 function accept(payload){
   const next=payload?.einstellungen;
   if(!next||!keys.every(k=>typeof next[k]==='boolean'))throw Error('Ungültige Einstellungen vom Server');
   flags=next;window.IDVPMA?.settingsChanged();window.IDVPOR?.settingsChanged();paint();
 }
 function reset(){
   if(account!==who()){account=who();flags=null;sequence++;inFlight=null;window.IDVPMA?.settingsChanged();window.IDVPOR?.settingsChanged();}
 }
 async function refresh(){
   if(!ME)return;reset();if(saving)return;if(inFlight)return inFlight;
   const id=who(),version=++sequence;
   const pending=(async()=>{try{const data=await api('/benachrichtigungs-einstellungen');if(who()===id&&sequence===version)accept(data);}
     catch(e){if(who()===id&&sequence===version){if([401,403].includes(e.status)){flags=null;window.IDVPMA?.settingsChanged();window.IDVPOR?.settingsChanged();}paint();status('Einstellungen konnten nicht geladen werden.',true);}}
   })();
   inFlight=pending;try{await pending;}finally{if(inFlight===pending)inFlight=null;}
 }
 function status(message,error=false){const el=document.querySelector('#nsStatus');if(el){el.textContent=message;el.classList.toggle('error',error);}}
 function paint(){
   document.querySelectorAll('[data-notify-setting]').forEach(b=>{
     const key=b.dataset.notifySetting,on=enabled(key);b.disabled=!flags||saving||!allowed();b.setAttribute('aria-checked',String(on));
     const label=b.parentElement.querySelector('span');if(label)label.textContent=flags?(on?'Aktiv':'Aus'):'Lädt …';
   });
 }
 async function save(key){
   if(!allowed()||!flags||saving||!keys.includes(key))return;
   saving=true;++sequence;paint();status('Speichert …');
   const id=who();
   try{const result=await api('/benachrichtigungs-einstellungen/'+key,{method:'PUT',body:JSON.stringify({aktiv:!enabled(key)})});if(who()===id){accept(result);status('Gespeichert. Gilt portalweit.');}}
   catch(e){status('Speichern fehlgeschlagen: '+e.message,true);}
   finally{saving=false;paint();}
 }
 function open(){
   const root=document.querySelector('#inhalt');if(!root)return;
   if(!allowed()){root.textContent='Keine Berechtigung.';return;}
   root.innerHTML='<section class="notify-settings"><div class="ns-heading"><h1>Benachrichtigungen</h1><p>Hier steuerst du die automatischen Popup-Hinweise für alle berechtigten Nutzer im Portal. Änderungen werden sofort gespeichert.</p></div>'+
     groups.map(g=>'<section class="ns-group"><h2>'+g.title+'</h2><p>'+g.desc+'</p>'+g.items.map(([key,label,desc])=>'<div class="ns-row"><div><strong>'+label+'</strong><small>'+desc+'</small></div><div class="ns-control"><span></span><button type="button" role="switch" aria-label="'+label+'" aria-checked="false" data-notify-setting="'+key+'" disabled></button></div></div>').join('')+'</section>').join('')+
     '<div id="nsStatus" class="ns-status" role="status"></div><p class="ns-legend">Das Ausschalten blendet nur das Popup aus. Offene Anträge und Ausbildungsstände bleiben in den jeweiligen Übersichten sichtbar. Prüfungsregeln und Rechte bleiben unverändert.</p></section>';
   root.querySelectorAll('[data-notify-setting]').forEach(b=>b.addEventListener('click',()=>void save(b.dataset.notifySetting)));
   paint();void refresh();
 }
 function start(){if(!ME)return;reset();if(!timer)timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);void refresh();}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();});
 window.IDVNotificationSettings={enabled,start,open};
})();
