/* POR-Freigaben: diskrete orange Echtzeit-Hinweise nur für berechtigte Entscheider.
   Bekannte IDs werden pro Konto und Browser-Tab gemerkt, damit es kein
   erneutes Aufpoppen bei jedem Rendern oder Seitenwechsel gibt. */
(()=>{
  let inFlight=false,again=false,account='',seen=null,toast=null,lastChecked=0,regularIds=[],rankIds=[];
  const eligible=()=>Boolean(typeof can==='function'&&can('por',2));
  const key=()=> 'idv-por-bekannt-'+String(ME?.dienstnummer||'unbekannt');
  function loadSeen(){
    const id=key();
    if(account===id&&seen)return seen;
    account=id;
    try{
      const raw=JSON.parse(sessionStorage.getItem(id)||'[]');
      seen=new Set(Array.isArray(raw)?raw.map(x=>typeof x==='number'?'r:'+x:String(x)).filter(Boolean):[]);
    }catch{seen=new Set();}
    return seen;
  }
  function persist(){
    const latest=[...seen].slice(-250);
    try{sessionStorage.setItem(account,JSON.stringify(latest));}catch{}
  }
  function close(){if(toast)toast.hidden=true;}
  function ensureToast(){
    if(toast?.isConnected)return toast;
    toast=document.createElement('aside');
    toast.id='idvPorHinweis';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    toast.innerHTML='<div class="idv-por-notify-icon" aria-hidden="true">!</div>'+
      '<div class="idv-por-notify-body"><strong id="idvPorHinweisTitel"></strong>'+
      '<span id="idvPorHinweisText"></span>'+
      '<button type="button" id="idvPorHinweisOeffnen">Anträge ansehen</button></div>'+
      '<button type="button" id="idvPorHinweisSchliessen" aria-label="POR-Hinweis schließen">×</button>';
    document.body.append(toast);
    toast.querySelector('#idvPorHinweisSchliessen').addEventListener('click',close);
    toast.querySelector('#idvPorHinweisOeffnen').addEventListener('click',()=>{
      if(can('bef'))wechsleZuModul('bef');
      else if(can('pers'))wechsleZuModul('pers');
      else return;
      close();
      const ziel=document.querySelector('#inhalt>.idv-warnung')||document.getElementById(can('bef')?'rangantraegeBereich':'personalRangantraege');
      ziel?.scrollIntoView({block:'start',behavior:'smooth'});
    });
    return toast;
  }
  function notify(neu,gesamt){
    const box=ensureToast();
    box.querySelector('#idvPorHinweisTitel').textContent=
      neu===1?'Neue POR-Freigabeanfrage':'Neue POR-Freigabeanfragen';
    box.querySelector('#idvPorHinweisText').textContent=
      neu===1?'1 neue POR-Freigabeanfrage wartet auf Entscheidung.':
      neu+' neue POR-Freigabeanfragen warten auf Entscheidung.';
    if(gesamt>neu)box.querySelector('#idvPorHinweisText').textContent+=' Insgesamt '+gesamt+' offen.';
    const open=box.querySelector('#idvPorHinweisOeffnen');
    open.hidden=!(can('bef')||can('pers'));
    box.hidden=false;
  }
  function observe(items){
    if(!eligible()){close();return;}
    const known=loadSeen();
    const offen=Array.isArray(items)?items.filter(a=>a?.status==='beantragt'):[];
    rankIds=[...new Set(offen.map(x=>Number(x.id)).filter(x=>Number.isSafeInteger(x)&&x>0).map(id=>'r:'+id))];
    const newer=rankIds.filter(id=>!known.has(id));
    rankIds.forEach(id=>known.add(id));
    if(newer.length){persist();notify(newer.length,rankIds.length+regularIds.length);}
    if(!rankIds.length&&!regularIds.length)close();
    lastChecked=Date.now();
  }
  function observeRegular(items){
    if(!eligible()){close();return;}
    const known=loadSeen();
    regularIds=[...new Set((Array.isArray(items)?items:[]).filter(x=>Number.isSafeInteger(x?.nr)&&x.nr>0)
       .map(x=>'p:'+x.nr+':'+String(x.revision||'')))];
    const newer=regularIds.filter(id=>!known.has(id));
    regularIds.forEach(id=>known.add(id));
    if(newer.length){persist();notify(newer.length,rankIds.length+regularIds.length);}
    if(!rankIds.length&&!regularIds.length)close();
  }
  async function refresh(){
    if(!eligible()){close();return;}
    if(inFlight){again=true;return;}
    inFlight=true;again=false;
    try{
      const [list,regular]=await Promise.all([api('/rangantraege'),api('/por/offen')]);
      if(!eligible())return;
      observe(list);observeRegular(regular);
      // Nur den jeweiligen POR-Bereich auffrischen, nie die ganze Seite.
      if(tab==='pers'&&document.getElementById('personalRangantraege'))
        await ladePersonalRangantraege(list);
      else if(tab==='bef'&&document.getElementById('rangantraegeBereich'))
        await ladeRangantraege(list);
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
  window.IDVPOR={observe,refresh,changed,start};
})();