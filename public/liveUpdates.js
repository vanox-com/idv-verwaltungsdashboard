/* IdentityValley: Live-Aktualisierung mit sicherem Umgang offener Editoren. */
(()=>{
  let stream=null,loading=false,dirty=false,timer=null,banner=null;
  let seen=0,applied=0,conflictFlag=false;
  const filters=['persSuche','persGruppe','persArt','persStatus','disSuche'];
  const editorOpen=()=>!!document.querySelector('dialog[open]')||dirty;
  function hide(){
    if(banner){banner.hidden=true;banner.style.display='none';}
  }
  function show(){
    if(!banner){
      banner=document.createElement('div');
      banner.id='idvLiveBanner';
      banner.setAttribute('role','status');
      banner.style.cssText='position:fixed;bottom:20px;right:20px;z-index:9999;max-width:min(450px,calc(100vw - 32px));padding:14px 16px;border:1px solid #7695b7;border-radius:10px;background:#18293a;color:#f2f6fb;box-shadow:0 12px 35px #0009;font:14px system-ui,sans-serif;align-items:center;gap:12px';
      const message=document.createElement('span');
      message.id='idvLiveMessage';
      const action=document.createElement('button');
      action.type='button';
      action.textContent='Aktualisieren';
      action.style.cssText='cursor:pointer;border:1px solid #819cba;border-radius:7px;padding:7px 9px;background:#294765;color:#fff;flex-shrink:0';
      action.addEventListener('click',()=>{
        if(editorOpen()&&!confirm('Aktuelle Daten laden? Nicht gespeicherte Eingaben gehen verloren.'))return;
        document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        dirty=false;
        void refresh();
      });
      banner.append(message,action);
      document.body.append(banner);
    }
    banner.querySelector('#idvLiveMessage').textContent=conflictFlag?
      'Speicherkonflikt: Es liegt ein neuerer Datenstand vor. Deine Eingaben wurden nicht überschrieben.':
      'Neue Daten verfügbar. Geöffnete Eingaben bleiben erhalten.';
    banner.hidden=false;
    banner.style.display='flex';
  }
  async function refresh(){
    if(loading||seen===applied||!ME||!D)return;
    if(editorOpen()){show();return;}
    const requested=seen;
    let successful=false;
    loading=true;
    try{
      const values=Object.fromEntries(filters.map(id=>[id,document.getElementById(id)?.value]));
      const response=await api('/bootstrap');
      if(!response?.user||!response?.daten)throw Error('Unvollständiger Datenstand');
      if(editorOpen()){show();return;}
      ME=response.user;
      D=response.daten;
      const label=document.getElementById('meName');
      const rolle=document.getElementById('meRolle');
      if(label)label.textContent=ME.anzeigename||'Dienstkonto';
      if(rolle)rolle.textContent=ME.rolle+(ME.sensibel?' · Personaldaten':'');
      zeichneMenue();
      zeichne();
      for(const [id,value] of Object.entries(values)){
        const el=document.getElementById(id);
        if(el&&value!==undefined)el.value=value;
      }
      if(tab==='pers')personalFiltern();
      if(tab==='dis')disFiltern();
      applied=requested;
      successful=true;
      conflictFlag=false;
      if(applied===seen)hide();
    }catch(err){
      console.warn('IDV: Live-Aktualisierung fehlgeschlagen',err);
      show();
    }finally{
      loading=false;
      if(successful&&seen>applied&&!editorOpen())schedule();
    }
  }
  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(()=>void refresh(),650);
  }
  function changed(){
    seen++;
    if(editorOpen())show();
    else schedule();
  }
  document.addEventListener('input',event=>{
    const el=event.target;
    if(!(el instanceof HTMLElement)||!el.closest('#inhalt')||filters.includes(el.id))return;
    if(el.closest('form')||el.isContentEditable)dirty=true;
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-t]')){
      dirty=false;
      if(seen>applied)schedule();
    }
  },true);
  document.addEventListener('close',()=>{
    setTimeout(()=>{if(seen>applied&&!dirty)schedule();},60);
  },true);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&stream&&stream.readyState===EventSource.OPEN)changed();
  });
  window.IDVLive={
    connect(){
      if(stream||!window.EventSource)return;
      stream=new EventSource('/api/changes');
      stream.addEventListener('aktualisierung',changed);
      // Beim initialen Verbinden und nach jedem Reconnect versäumte Änderungen nachholen.
      stream.addEventListener('open',changed);
    },
    synced(){
      applied=seen;
      dirty=false;
      conflictFlag=false;
      hide();
    },
    conflict(){
      conflictFlag=true;
      changed();
    },
    disconnect(){
      if(stream)stream.close();
      stream=null;
    }
  };
})();