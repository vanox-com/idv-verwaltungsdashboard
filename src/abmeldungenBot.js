/* Abmeldungen aus dem Polizei-Discord-Bot (Modul „abm“).
   Die Daten liegen beim Bot; diese Routen sprechen serverseitig dessen
   authentifizierte HTTP-API an (POLBOT_API_URL + POLBOT_API_SECRET, nur als
   Umgebungsvariablen). Annehmen/Ablehnen löst beim Bot denselben Ablauf aus
   wie die Discord-Buttons. Gegenstück zu php/Abmeldungen.php. */
const STATUS=['offen','angenommen','abgelehnt'];
const ID_RE=/^[a-z0-9_]{3,40}$/;

async function botRequest(method,pfad,payload){
  const base=process.env.POLBOT_API_URL||'',secret=process.env.POLBOT_API_SECRET||'';
  if(!base||secret.length<32){const e=new Error('Anbindung an den Polizei-Bot ist nicht konfiguriert');e.status=503;throw e;}
  let r;
  try{
    r=await fetch(base.replace(/\/+$/,'')+pfad,{method,redirect:'manual',
      headers:{Authorization:'Bearer '+secret,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
      body:payload?JSON.stringify(payload):undefined,
      signal:AbortSignal.timeout(method==='GET'?8000:45000)});
  }catch{const e=new Error('Polizei-Bot ist nicht erreichbar');e.status=502;throw e;}
  let data;
  try{data=await r.json();}catch{const e=new Error('Ungültige Antwort vom Polizei-Bot');e.status=502;throw e;}
  if(r.status===401||r.status===403){const e=new Error('Polizei-Bot lehnt den Zugriff des Panels ab');e.status=502;throw e;}
  return {code:r.status,data};
}

export function registerAbmeldungenRoutes(app,db,requireLogin,requireRight,effektiveRechte){
  app.get('/api/abmeldungen',requireLogin,requireRight('abm',1),async(req,res)=>{
    try{
      const s=String(req.query.status||'');
      const r=await botRequest('GET','/abmeldungen'+(STATUS.includes(s)?'?status='+s:''));
      if(r.code!==200)return res.status(502).json({error:r.data?.error||'Polizei-Bot meldet einen Fehler'});
      const rechte=await effektiveRechte(req.user);
      res.json({abmeldungen:r.data.abmeldungen||[],schreiben:Number(rechte.abm||0)>=2});
    }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Interner Fehler'});}
  });
  app.post('/api/abmeldungen/:id/entscheidung',requireLogin,requireRight('abm',2),async(req,res)=>{
    try{
      const id=String(req.params.id||'');
      if(!ID_RE.test(id))return res.status(400).json({error:'Ungültige Abmeldungs-ID'});
      const aktion=req.body?.aktion;
      if(!['annehmen','ablehnen'].includes(aktion))return res.status(400).json({error:'Aktion muss annehmen oder ablehnen sein'});
      const name=String(req.user.anzeigename||req.user.dienstnummer||'').slice(0,80);
      const r=await botRequest('POST','/abmeldungen/'+encodeURIComponent(id)+'/entscheidung',
        {aktion,bearbeiter:{name,dienstnummer:String(req.user.dienstnummer||'')}});
      const a=r.data?.abmeldung||null;
      if(r.code===200&&r.data?.ok===true){
        const info=a?` (DN ${String(a.dienstnummer||'').slice(0,20)}, ${String(a.von||'').slice(0,10)}–${String(a.bis||'').slice(0,10)})`:'';
        await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
          [req.user.id,'Abmeldung '+(aktion==='annehmen'?'angenommen':'abgelehnt')+': '+id+info]);
        return res.json({ok:true,abmeldung:a});
      }
      const code=[400,404,409,422,503].includes(r.code)?r.code:502;
      res.status(code).json({error:r.data?.error||'Polizei-Bot meldet einen Fehler',abmeldung:a});
    }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Interner Fehler'});}
  });
}
