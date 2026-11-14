/* Bot-Konfiguration des Polizei-Discord-Bots (Modul „botcfg“).
   Formular-Editor; Quelle der Wahrheit ist der Bot (data/config.json). Diese Routen
   sprechen serverseitig dessen authentifizierte API an (POLBOT_API_URL/SECRET).
   Gegenstück zu php/BotKonfiguration.php. */
import { botRequest } from './abmeldungenBot.js';

const FELD_RE=/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){0,4}$/;

export function registerBotKonfigurationRoutes(app,db,requireLogin,requireRight,effektiveRechte){
  app.get('/api/botcfg',requireLogin,requireRight('botcfg',1),async(req,res)=>{
    try{
      const r=await botRequest('GET','/config');
      if(r.code!==200)return res.status(502).json({error:r.data?.error||'Polizei-Bot meldet einen Fehler'});
      const rechte=await effektiveRechte(req.user);
      const {ok,...d}=r.data;
      res.json({...d,schreiben:Number(rechte.botcfg||0)>=2});
    }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Interner Fehler'});}
  });
  app.put('/api/botcfg',requireLogin,requireRight('botcfg',2),async(req,res)=>{
    try{
      const werte=req.body?.werte;
      if(!werte||typeof werte!=='object'||Array.isArray(werte))return res.status(400).json({error:'werte muss ein Objekt sein'});
      const keys=Object.keys(werte);
      if(keys.length>80||keys.some(k=>!FELD_RE.test(k)))return res.status(400).json({error:'Ungültige Feldnamen'});
      const rev=req.body?.rev??null;
      if(rev!==null&&!Number.isInteger(rev))return res.status(400).json({error:'rev muss eine Zahl sein'});
      const name=String(req.user.anzeigename||req.user.dienstnummer||'').slice(0,80);
      const r=await botRequest('PUT','/config',{werte,rev,bearbeiter:{name,dienstnummer:String(req.user.dienstnummer||'')}});
      if(r.code===200&&r.data?.ok===true){
        const geaendert=(r.data.geaendert||[]).filter(p=>typeof p==='string');
        if(geaendert.length){
          const labels=geaendert.map(p=>(r.data.felder||[]).find(f=>f.path===p)?.label||p).join(', ').slice(0,900);
          await db.query(`INSERT INTO log (user_id, aktion, art) VALUES ($1, $2, 'edit')`,
            [req.user.id,`Polizei-Bot-Konfiguration geändert (Version ${Number(r.data.rev)||0}): ${labels}`]);
        }
        const {ok,...d}=r.data;
        return res.json({...d,schreiben:true});
      }
      const code=[400,422].includes(r.code)?422:r.code===409?412:r.code===503?503:502;
      res.status(code).json({error:r.data?.error||'Polizei-Bot meldet einen Fehler',fehler:r.data?.fehler||{}});
    }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Interner Fehler'});}
  });
}
