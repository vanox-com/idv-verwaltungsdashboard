/* POR-Freigaben: diskrete orange Echtzeit-Hinweise nur für berechtigte Entscheider.
   Offene Anträge werden bei einem neuen Seitenaufruf erneut angezeigt.
   Innerhalb der Seite bleibt eine explizit geschlossene Meldung geschlossen. */
(()=>{
  let inFlight=false,again=false,account='',seen=null,toast=null,lastChecked=0,regularIds=[],rankIds=[];
  const eligible=()=>Boolean(typeof can==='function'&&can('por',2));
  const key=()=> String(ME?.dienstnummer||'unbekannt');
  function loadSeen(){
    const id=key();
    if(account===id&&seen)return seen;
    account=id;seen=new Set();regularIds=[];rankIds=[];
    close();
    return seen;
  }
  function close(){if(toast)toast.hidden=true;}
  function dismiss(){
    const known=loadSeen();
    [...regularIds,...rankIds].forEach(id=>known.add(id));
    close();
  }
  function ensureToast(){
    if(toast?.isConnected)return toast;
    toast=document.createElement('div');
    toast.id='idvPorHinweis';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.innerHTML='<div class="idv-por-notify-icon" aria-hidden="true">!</div>'+
      '<div class="idv-por-notify-body"><strong id="idvPorHinweisTitel"></strong>'+
      '<span id="idvPorHinweisText"></span>'+
      '<button type="button" id="idvPorHinweisOeffnen">Anträge ansehen</button></div>'+
      '<button type="button" id="idvPorHinweisSchliessen" aria-label="POR-Hinweis schließen">×</button>';
    document.body.append(toast);
    toast.querySelector('#idvPorHinweisSchliessen').addEventListener('click',dismiss);
    toast.querySelector('#idvPorHinweisOeffnen').addEventListener('click',()=>{
      const regular=regularIds.length>0;
      if(can('bef'))wechsleZuModul('bef');
      else if(can('pers')&&rankIds.length)wechsleZuModul('pers');
      else return;
      dismiss();
      const ziel=document.getElementById(can('bef')?(regular?'befPorOffen':'rangantraegeBereich'):'personalRangantraege');
      ziel?.scrollIntoView({block:'start',behavior:'smooth'});
    });
    return toast;
  }
  function updateToast(){
    const known=loadSeen();
    const ids=[...rankIds,...regularIds];
    for(const id of known)if(!ids.includes(id))known.delete(id);
    const newer=ids.filter(id=>!known.has(id));
    if(!newer.length){close();return;}
    const box=ensureToast();
    box.querySelector('#idvPorHinweisTitel').textContent=ids.length===1?'Offene POR-Freigabeanfrage':'Offene POR-Freigabeanfragen';
    box.querySelector('#idvPorHinweisText').textContent=
      [regularIds.length?regularIds.length+' Beförderungsfreigabe(n)':null,rankIds.length?rankIds.length+' Rangänderungsantrag/-anträge':null].filter(Boolean).join(' · ')+' warten auf Entscheidung.';
    box.querySelector('#idvPorHinweisOeffnen').hidden=!(can('bef')||(can('pers')&&rankIds.length));
    box.hidden=false;
  }
  function observe(items){
    if(!eligible()){close();return;}
    loadSeen();
    const offen=Array.isArray(items)?items.filter(a=>a?.status==='beantragt'):[];
    rankIds=[...new Set(offen.map(x=>Number(x.id)).filter(x=>Number.isSafeInteger(x)&&x>0).map(id=>'r:'+id))];
    updateToast();
  }
  function observeRegular(items){
    if(!eligible()){close();return;}
    loadSeen();
    regularIds=[...new Set((Array.isArray(items)?items:[]).filter(x=>Number.isSafeInteger(Number(x?.nr))&&Number(x.nr)>0)
       .map(x=>'p:'+Number(x.nr)+':'+String(x.revision||'')))];
    updateToast();
  }
  async function refresh(){
    if(!eligible()){close();return;}
    if(inFlight){again=true;return;}
    inFlight=true;again=false;
    try{
      const [list,regular]=await Promise.all([api('/rangantraege'),api('/por/offen')]);
      if(!eligible())return;
      observe(list);observeRegular(regular);lastChecked=Date.now();
      // Nur den jeweiligen POR-Bereich auffrischen, nie die ganze Seite.
      if(tab==='pers'&&document.getElementById('personalRangantraege'))
        await ladePersonalRangantraege(list);
      else if(tab==='bef'&&document.getElementById('rangantraegeBereich')){
        await ladeRangantraege(list);
        await ladeBefPorOffen(regular);
      }
    }catch(err){
      console.warn('IDV: POR-Benachrichtigung konnte nicht geprüft werden',err);
    }finally{
      inFlight=false;
      if(again){again=false;void refresh();}
    }
  }
  function changed(bereich){
    if(!eligible()||!['rangantraege','personal'].includes(bereich))return;
    void refresh();
  }
  function start(){
    if(!eligible()){close();return;}
    if(Date.now()-lastChecked<1500)return;
    void refresh();
  }
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&eligible()&&Date.now()-lastChecked>10000)void refresh();
  });
  window.IDVPOR={observe,observeRegular,refresh,changed,start};
})();