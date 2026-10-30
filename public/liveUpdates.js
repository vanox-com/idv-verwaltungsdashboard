/* IDV Live-Updates: offene Eingabemasken werden nie automatisch verworfen. */
(()=>{
  let source=null,pending=false,busy=false,dirty=false,timer=0,banner=null,wasConnected=false;
  const filters=['persSuche','persGruppe','persArt','persStatus','disSuche'];
  const editorOpen=()=>!!document.querySelector('dialog[open]')||dirty;
  function hide(){if(banner)banner.hidden=true;}
  function show(){
    if(!banner){
      banner=document.createElement('div');
      banner.id='idvLiveBanner';
      banner.setAttribute('role','status');
      banner.style.cssText='position:fixed;bottom:20px;right:20px;z-index:9999;max-width:min(440px,calc(100vw - 32px));padding:14px 16px;border:1px solid #7695b7;border-radius:10px;background:#18293a;color:#f2f6fb;box-shadow:0 12px 35px #0009;font:14px system-ui,sans-serif;display:flex;align-items:center;gap:12px';
      const message=document.createElement('span');
      message.textContent='Neue Daten verfügbar. Geöffnete Eingaben bleiben erhalten.';
      const action=document.createElement('button');
      action.type='button';action.textContent='Aktualisieren';
      action.style.cssText='cursor:pointer;border:1px solid #819cba;border-radius:7px;padding:7px 9px;background:#294765;color:#fff';
      action.addEventListener('click',()=>{
        if(editorOpen()&&!confirm('Aktuelle Daten laden? Nicht gespeicherte Eingaben gehen verloren.'))return;
        document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        dirty=false;
        void refresh();
      });
      banner.append(message,action);
      document.body.append(banner);
    }
    banner.hidden=false;
  }
  async function refresh(){
    if(!pending||busy||!ME||!D)return;
    if(editorOpen()){show();return;}
    busy=true;
    try{
      const values=Object.fromEntries(filters.map(id=>[id,document.getElementById(id)?.value]));
      const response=await api('/bootstrap');
      if(!response?.user||!response?.daten)throw new Error('Unvollständiger Datenstand');
      if(editorOpen()){show();return;}
      ME=response.user;
      D=response.daten;
      const name=document.getElementById('meName');
      if(name)name.textContent=ME.anzeigename||'Dienstkonto';
      zeichneMenue();
      zeichne();
      for(const [id,value] of Object.entries(values)){
        const input=document.getElementById(id);
        if(input&&value!==undefined)input.value=value;
      }
      if(tab==='pers')personalFiltern();
      if(tab==='dis')disFiltern();
      pending=false;
      hide();
    }catch(err){
      console.warn('IDV Live-Aktualisierung fehlgeschlagen:',err);
      show();
    }finally{busy=false;}
  }
  function queue(){
    pending=true;
    clearTimeout(timer);
    timer=setTimeout(()=>void refresh(),650);
  }
  document.addEventListener('input',event=>{
    const el=event.target;
    if(!(el instanceof HTMLElement)||!el.closest('#inhalt')||filters.includes(el.id))return;
    if(el.closest('form')||el.isContentEditable)dirty=true;
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-t]')){
      dirty=false;
      setTimeout(()=>{if(pending)void refresh();},150);
    }
  },true);
  document.addEventListener('close',()=>{
    setTimeout(()=>{if(pending&&!dirty)void refresh();},50);
  },true);
  window.IDVLive={
    connect(){
      if(source||!window.EventSource)return;
      source=new EventSource('/api/changes');
      source.addEventListener('aktualisierung',queue);
      source.addEventListener('open',()=>{
        if(wasConnected)queue(); // nach Verbindungsunterbrechungen nachladen
        wasConnected=true;
      });
    },
    synced(){pending=false;dirty=false;hide();}
  };
})();