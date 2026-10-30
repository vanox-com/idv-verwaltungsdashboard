/* IdentityValley: diskrete Mehrbenutzer-Synchronisierung ohne Seiten-Neuaufbau. */
(()=>{
  const clientId=globalThis.crypto?.randomUUID?.()||
    (Math.random().toString(16).slice(2).padEnd(32,'0'));
  let stream=null,timer=null,loading=false,banner=null,dirty=false,connected=false;
  let pending=0,conflictFlag=false;
  const filters=['persSuche','persGruppe','persArt','persStatus','disSuche','routineSuche'];
  const editorOpen=()=>Boolean(document.querySelector('dialog[open]'))||dirty;
  const node=(selector)=>document.querySelector(selector);

  /* Sichere DOM-Angleichung: unveränderte Elemente bleiben montiert.
     Dadurch bleiben Scrollposition, Fokus, Suchfelder und die Tabelle erhalten. */
  function patchNode(oldNode,newNode){
    if(!oldNode || !newNode)return;
    if(oldNode.nodeType!==newNode.nodeType||
      (oldNode.nodeType===1&&oldNode.nodeName!==newNode.nodeName)){
      oldNode.replaceWith(newNode.cloneNode(true));
      return;
    }
    if(oldNode.nodeType===3){
      if(oldNode.nodeValue!==newNode.nodeValue)oldNode.nodeValue=newNode.nodeValue;
      return;
    }
    if(oldNode.nodeType!==1)return;
    const attrs=oldNode.attributes,keep=new Set([...newNode.attributes].map(a=>a.name));
    for(const a of [...attrs])if(!keep.has(a.name))oldNode.removeAttribute(a.name);
    for(const a of [...newNode.attributes]){
      if(oldNode.getAttribute(a.name)!==a.value)oldNode.setAttribute(a.name,a.value);
    }
    if(oldNode instanceof HTMLInputElement){
      if(oldNode!==document.activeElement){
        if(oldNode.type==='checkbox'||oldNode.type==='radio')oldNode.checked=newNode.checked;
        else if(!filters.includes(oldNode.id))oldNode.value=newNode.value;
      }
    }else if(oldNode instanceof HTMLTextAreaElement){
      if(oldNode!==document.activeElement)oldNode.value=newNode.value;
    }else if(oldNode instanceof HTMLSelectElement){
      if(oldNode!==document.activeElement&&!filters.includes(oldNode.id))oldNode.value=newNode.value;
    }
    const desired=[...newNode.childNodes];
    for(let i=0;i<desired.length;i++){
      const current=oldNode.childNodes[i];
      if(current)patchNode(current,desired[i]);
      else oldNode.appendChild(desired[i].cloneNode(true));
    }
    while(oldNode.childNodes.length>desired.length)oldNode.lastChild.remove();
  }

  function updateView(){
    if(!ME||!D)return false;
    if(editorOpen())return true;
    const render={
      dash:()=>vDash(),pers:()=>vPers(),bef:()=>vBef(),
      sonder:()=>vSonder(),kue:()=>vKue(),dis:()=>vDis(),
      rout:()=>vRout(),chk:()=>vChk(),rl:()=>vRl(),users:()=>vUsers()
    }[tab];
    if(!render){
      // Asynchrone Spezialmodule besitzen eigene Laderoutinen.
      const scroll=window.scrollY;
      zeichne();
      window.scrollTo({top:scroll,behavior:'auto'});
      return true;
    }
    const area=node('#inhalt');
    if(!area)return false;
    const snapshot=document.createElement('div');
    snapshot.innerHTML=render();
    const previousScroll=window.scrollY;
    const scrollables=new Map();
    for(const e of area.querySelectorAll('.tw,.idv-history,.routine-archive-list')){
      if(e.id)scrollables.set(e.id,[e.scrollLeft,e.scrollTop]);
    }
    // Das Root-Element #inhalt selbst darf nicht angeglichen werden:
    // sonst würde seine ID entfernt und die nachfolgenden Views wären leer.
    const desired=[...snapshot.childNodes];
    for(let i=0;i<desired.length;i++){
      const current=area.childNodes[i];
      if(current)patchNode(current,desired[i]);
      else area.appendChild(desired[i].cloneNode(true));
    }
    while(area.childNodes.length>desired.length)area.lastChild.remove();
    window.scrollTo({top:previousScroll,behavior:'auto'});
    for(const [id,[left,top]] of scrollables){
      const e=document.getElementById(id);if(e){e.scrollLeft=left;e.scrollTop=top;}
    }
    if(tab==='pers'){personalFiltern();void ladePersonalRangantraege();}
    if(tab==='dis'&&typeof disFiltern==='function')disFiltern();
    if(tab==='rout'){
      if(typeof routineFiltern==='function')routineFiltern();
      if(routineBereich==='archiv')void routineArchivLaden();
    }
    if(tab==='bef'){
      void ladeRangantraege();
    }
    if(tab==='dash'&&can('mitteilungen'))void ladeDashboardMeldungen();
    if(tab==='users')void ladeBenutzer().catch(()=>{});
    return true;
  }

  function hide(){
    if(banner){banner.hidden=true;banner.style.display='none';}
  }
  function show(){
    if(!banner){
      banner=document.createElement('div');banner.id='idvLiveBanner';
      banner.setAttribute('role','status');
      banner.style.cssText='position:fixed;bottom:18px;right:18px;z-index:9999;max-width:min(400px,calc(100vw - 36px));padding:10px 13px;border:1px solid #607993;border-radius:9px;background:#162638;color:#e9f1fa;box-shadow:0 8px 24px #0007;font:13px system-ui,sans-serif;align-items:center;gap:10px';
      const msg=document.createElement('span');msg.id='idvLiveMessage';
      const action=document.createElement('button');action.type='button';
      action.textContent='Ansicht aktualisieren';
      action.style.cssText='cursor:pointer;border:1px solid #688aad;border-radius:6px;padding:6px 9px;background:#294867;color:white;font:12px system-ui,sans-serif;white-space:nowrap';
      action.addEventListener('click',()=>{
        if(editorOpen()&&!confirm('Ansicht neu abgleichen? Nicht gespeicherte Eingaben gehen verloren.'))return;
        document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        dirty=false;
        if(updateView()){pending=0;conflictFlag=false;hide();}
      });
      banner.append(msg,action);document.body.append(banner);
    }
    banner.querySelector('#idvLiveMessage').textContent=conflictFlag?
      'Speicherkonflikt – bitte aktuelle Daten prüfen.':
      'Änderungen von anderen verfügbar.';
    banner.hidden=false;banner.style.display='flex';
  }

  function tabSnapshot(data){
    if(!data)return '';
    const keys={
      dash:['dashboard','personal','kuendigungen','disziplin'],
      pers:['personal'],bef:['personal','befoerderungen','raenge'],
      sonder:['personal','funktionen'],kue:['kuendigungen'],
      dis:['disziplin','personal'],rout:['routine','sonderzahlungen'],
      chk:['checklisten','checklistenStatus'],rl:['richtlinie'],
      users:['users'],texte:['textbausteine']
    }[tab];
    if(!keys)return '';
    return JSON.stringify(keys.map(k=>data[k]??null));
  }
  async function backgroundSync(){
    if(loading||!ME||!D)return;
    loading=true;const marker=pending;
    try{
      const before=tabSnapshot(D);
      const previousRights=JSON.stringify(ME.rechte||{});
      const result=await api('/bootstrap');
      if(!result?.user||!result?.daten)throw Error('Unvollständige Verwaltungsdaten');
      ME=result.user;
      D=result.daten;
      const changed=tabSnapshot(D)!==before;
      if(JSON.stringify(ME.rechte||{})!==previousRights)zeichneMenue();
      const name=node('#meName'),role=node('#meRolle');
      if(name)name.textContent=ME.anzeigename||'Dienstkonto';
      if(role)role.textContent=ME.rolle+(ME.sensibel?' · Personaldaten':'');
      if(changed||conflictFlag)show();
      pending=Math.max(0,pending-marker);
    }catch(err){
      console.warn('IDV: Hintergrundabgleich fehlgeschlagen',err);
      if(conflictFlag)show();
    }finally{loading=false;if(pending>0)schedule();}
  }
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(()=>void backgroundSync(),400);
  }
  function changed(){
    pending++;
    schedule();
  }
  document.addEventListener('input',event=>{
    const el=event.target;
    if(!(el instanceof HTMLElement)||!el.closest('#inhalt')||filters.includes(el.id))return;
    if(el.closest('form')||el.isContentEditable)dirty=true;
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-t]')){
      dirty=false;pending=0;conflictFlag=false;hide();
    }
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&connected)changed();
  });
  window.IDVLive={
    clientId,
    connect(){
      if(stream||!window.EventSource)return;
      stream=new EventSource('/api/changes?client='+encodeURIComponent(clientId));
      stream.addEventListener('aktualisierung',event=>{
        changed();
        try{
          const bereich=JSON.parse(event.data||'{}').bereich;
          window.IDVPOR?.changed(bereich);
        }catch(err){console.warn('IDV: Unbekannte Live-Mitteilung',err);}
      });
      stream.addEventListener('open',()=>{
        if(connected){
          changed(); // Reconnect: nach verpassten Ereignissen nachladen.
          window.IDVPOR?.refresh();
        }
        connected=true;
      });
    },
    synced(){dirty=false;pending=0;conflictFlag=false;hide();},
    conflict(){conflictFlag=true;changed();show();},
    updateView,
    disconnect(){if(stream)stream.close();stream=null;connected=false;}
  };
})();
