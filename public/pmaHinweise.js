/* Internal PMA vote reminders; no public data or automatic votes. */
(()=>{
 let account='',seen=new Set(),items=[],toast=null,inFlight=false,last=0,timer=null,day='';
 const eligible=()=>Boolean(typeof can==='function'&&can('ausbildung-pma'));
 const who=()=>String(ME?.id??ME?.dienstnummer??'');
 const hide=()=>{if(toast)toast.hidden=true;};
 const key=h=>h.key+':'+h.stufe+(h.stufe==='dringend'?':'+day:'');
 function reset(){const id=who();if(account!==id){account=id;seen=new Set();items=[];last=0;hide();}}
 function place(){
   if(!toast||toast.hidden)return;
   const por=document.getElementById('idvPorHinweis');
   const base=window.innerWidth<=600?12:16;
   const top=por&&!por.hidden?Math.max(base,por.getBoundingClientRect().bottom+10):base;
   toast.style.top=top+'px';toast.style.maxHeight=Math.max(80,window.innerHeight-top-12)+'px';
 }
 function dismiss(){items.filter(x=>x.stufe!=='hinweis').forEach(x=>seen.add(key(x)));hide();}
 function ensure(){
   if(toast?.isConnected)return toast;
   toast=document.createElement('div');toast.id='idvPmaHinweis';toast.hidden=true;
   toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
   toast.innerHTML='<div class="pma-icon" aria-hidden="true">!</div><div class="pma-body"><strong class="pma-title"></strong><span class="pma-text"></span><span class="pma-own"></span><button type="button" class="pma-open">PMA-Monitor öffnen</button></div><button type="button" class="pma-close" aria-label="PMA-Hinweis schließen">×</button>';
   document.body.append(toast);
   toast.querySelector('.pma-close').addEventListener('click',dismiss);
   toast.querySelector('.pma-open').addEventListener('click',()=>{if(eligible()&&wechsleZuModul('ausbildung-pma'))dismiss();});
   return toast;
 }
 function render(){
   if(!eligible()){hide();return;}
   const relevant=items.filter(h=>h.stufe!=='hinweis');
   const valid=new Set(relevant.map(key));for(const k of seen)if(!valid.has(k))seen.delete(k);
   const pending=relevant.filter(h=>!seen.has(key(h)));
   if(!pending.length){hide();return;}
   const overdue=pending.filter(h=>h.stufe==='dringend').length,ready=pending.filter(h=>h.nurStimmen).length;
   const box=ensure();box.dataset.urgent=overdue?'1':'0';
   box.querySelector('.pma-title').textContent=overdue?'PMA · 10-Tage-Ziel erreicht':ready?'PMA · Nur Stimmen fehlen':'PMA · Stimmenstand prüfen';
   box.querySelector('.pma-text').textContent=pending.length+' Anwärter mit offenen Stimmenpunkten'+(ready?' · '+ready+' warten nur auf Stimmen':'')+(overdue?' · '+overdue+' ab Tag 10':'')+'. '+pending.slice(0,3).map(h=>h.name).join(', ')+(pending.length>3?' und weitere':'')+'.';
   const own=pending.filter(h=>!h.eigeneStimme).length;
   box.querySelector('.pma-own').textContent=own?'Eigene Stimme offen bei '+own+' Anwärter(n). Bitte nach eigener Beurteilung abstimmen.':'Eigene Stimmen bereits abgegeben – Teamstand offen.';
   box.hidden=false;place();
 }
 function observe(rows,date){
   if(!eligible()){hide();return;}
   reset();items=Array.isArray(rows)?rows:[];
   if(date)day=date;else if(!day)day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   render();
 }
 async function refresh(){
   if(!eligible()){hide();return;}
   reset();if(inFlight)return;inFlight=true;const id=who();
   try{const d=await api('/ausbildung/pma-hinweise');if(eligible()&&who()===id){observe(d.hinweise,d.datum);last=Date.now();}}
   catch(e){if([401,403].includes(e.status))hide();else console.warn('PMA-Hinweise nicht abrufbar',e);}
   finally{inFlight=false;}
 }
 function start(){if(!eligible()){hide();return;}reset();if(!timer)timer=setInterval(()=>{if(!document.hidden)void refresh();},30000);if(Date.now()-last>1000)void refresh();}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)start();});
 window.addEventListener('resize',place);
 new MutationObserver(records=>{if(records.some(m=>m.target.id==='idvPorHinweis'||(m.target===document.body&&[...m.addedNodes,...m.removedNodes].some(n=>n.id==='idvPorHinweis'))))place();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 window.IDVPMA={start,refresh,observe};
})();
