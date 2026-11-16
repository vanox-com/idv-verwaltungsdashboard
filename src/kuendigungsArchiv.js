/* Kündigungsarchiv: keine Datensätze verschieben oder löschen.
   "Aktuell" bedeutet: belegtes Kündigungs- oder Erfassungsdatum
   innerhalb der letzten 60 Kalendertage, heute eingeschlossen.
   Undatierte Altvorgänge liegen im Archiv, nicht fälschlich unter "neu". */
/* Bei Altvorgängen ohne Datum gilt der nachweisbare Statuswechsel auf
   "Gekündigt" als Erfassungsereignis für die 60-Tage-Ansicht.
   Die tatsächlichen historischen Kündigungsdaten bleiben unbekannt. */
/* Ein alter Statuswechsel darf NICHT auf Kündigungen anderer Kollegen mit
   später erneut vergebener Personalnummer übertragen werden. Die Zuordnung
   muss auch Vor-/Nachname und Eintrittsdatum bestätigen. */
const KUE_STATUSWECHSEL=
  "(SELECT MAX(a.zeit) FROM personal_audit a JOIN personal p ON p.personalnummer=a.personalnummer "+
  "WHERE a.personalnummer=kuendigungen.personalnummer AND p.status='Gekündigt' "+
  "AND lower(btrim(coalesce(p.vorname,'')))=lower(btrim(coalesce(kuendigungen.vorname,''))) "+
  "AND lower(btrim(coalesce(p.nachname,'')))=lower(btrim(coalesce(kuendigungen.nachname,''))) "+
  "AND p.eintrittsdatum IS NOT DISTINCT FROM kuendigungen.eintritt "+
  "AND a.aenderungen->'status'->>'neu'='Gekündigt')";
export const KUE_AKTUELL_BEDINGUNG=
  "(COALESCE(kuendigungsdatum,(erfasst_am AT TIME ZONE 'Europe/Berlin')::date,"+
  "("+KUE_STATUSWECHSEL+" AT TIME ZONE 'Europe/Berlin')::date) "+
  ">= (now() AT TIME ZONE 'Europe/Berlin')::date - 59)";
export const KUE_STATUSWECHSEL_SPALTE=KUE_STATUSWECHSEL+" AS statuswechsel_am";

export const KUE_LIST_COLUMNS=[
  'id','personalnummer','vorname','nachname','rang','grund','handy',
  'vertrag','eintritt','urkunde','zeugnis','kuendigung','waffe','copnet',
  'emd','ic','discord','dienstgegenstaende','anzeige','kuendigungsdatum',
  'erfasst_am'
].join(',')+",personal_snapshot->'ruecknahme'->>'am' AS rueckgenommen_am,"+KUE_STATUSWECHSEL_SPALTE+',xmin::text AS _revision';

export function registerKueArchivRoutes(app,db,requireLogin,requireRight,effektiveRechte){
  app.post('/api/kuendigungen/:id/ruecknahme',requireLogin,requireRight('kue',2),requireRight('pers',2),async(req,res,next)=>{
    const id=Number(req.params.id),grund=String(req.body?.grund||'').trim(),revision=String(req.headers['if-match']||'');
    if(!Number.isSafeInteger(id)||id<1||grund.length<5||grund.length>1000)
      return res.status(400).json({error:'Gültige Kündigungs-ID und Rücknahmegrund (5–1000 Zeichen) erforderlich'});
    if(!revision)return res.status(428).json({error:'Bitte Kündigungsübersicht neu laden'});
    const client=await db.connect().catch(next);if(!client)return;
    try{
      await client.query('BEGIN');
      const {rows:initial}=await client.query('SELECT personalnummer FROM kuendigungen WHERE id=$1',[id]);
      if(!initial.length){await client.query('ROLLBACK');return res.status(404).json({error:'Kündigung nicht gefunden'});}
      const nr=Number(initial[0].personalnummer);
      const {rows:people}=await client.query('SELECT * FROM personal WHERE personalnummer=$1 FOR UPDATE',[nr]);
      const {rows:records}=await client.query('SELECT *,xmin::text AS _revision FROM kuendigungen WHERE id=$1 FOR UPDATE',[id]);
      const k=records[0],p=people[0];
      if(!k||k._revision!==revision){await client.query('ROLLBACK');return res.status(409).json({error:'Kündigung zwischenzeitlich geändert. Bitte neu laden'});}
      const {rows:current}=await client.query('SELECT '+KUE_AKTUELL_BEDINGUNG+' AS aktuell FROM kuendigungen WHERE id=$1',[id]);
      if(current[0]?.aktuell!==true){
        const rights=await effektiveRechte(req.user);
        if(Number(rights.kuearchiv||0)<2){await client.query('ROLLBACK');return res.status(403).json({error:'Zum Zurücknehmen archivierter Kündigungen fehlt die Archivberechtigung'});}
      }
      if(k.personal_snapshot?.ruecknahme){await client.query('ROLLBACK');return res.status(409).json({error:'Kündigung bereits zurückgenommen'});}
      const iso=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
      if(!p||p.status!=='Gekündigt'||p.administrativ_geloescht_am||
        String(p.vorname||'').trim().toLowerCase()!==String(k.vorname||'').trim().toLowerCase()||
        String(p.nachname||'').trim().toLowerCase()!==String(k.nachname||'').trim().toLowerCase()||
        iso(p.eintrittsdatum)!==iso(k.eintritt)){
        await client.query('ROLLBACK');return res.status(409).json({error:'Die Dienstnummer wurde neu vergeben oder die Personalakte ist nicht mehr gekündigt'});
      }
      const matches=await client.query(`SELECT id FROM kuendigungen WHERE personalnummer=$1 AND personal_snapshot->'ruecknahme' IS NULL
        AND lower(trim(coalesce(vorname,'')))=lower($2) AND lower(trim(coalesce(nachname,'')))=lower($3)
        AND eintritt IS NOT DISTINCT FROM $4::date
        AND (NOT EXISTS(SELECT 1 FROM personalnummer_neubelegungen WHERE personalnummer=$1)
          OR erfasst_am >= (SELECT MAX(zeit) FROM personalnummer_neubelegungen WHERE personalnummer=$1))`,
        [nr,String(p.vorname||'').trim(),String(p.nachname||'').trim(),p.eintrittsdatum]);
      if(!matches.rows.some(m=>Number(m.id)===id)){
        await client.query('ROLLBACK');return res.status(409).json({error:'Kündigung gehört nicht zur aktuellen Personalakte'});
      }
      await client.query("UPDATE kuendigungen SET personal_snapshot=jsonb_set(COALESCE(personal_snapshot,'{}'::jsonb),'{ruecknahme}',$1::jsonb,true) WHERE id=$2",
        [JSON.stringify({am:new Date().toISOString(),grund,von:req.user.id}),id]);
      await client.query("UPDATE personal SET status='Aktiv' WHERE personalnummer=$1 AND status='Gekündigt'",[nr]);
      await client.query('INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES($1,$2,$3::jsonb)',
        [nr,req.user.id,JSON.stringify({status:{alt:'Gekündigt',neu:'Aktiv'},kuendigung_ruecknahme:id})]);
      await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",[req.user.id,'Kündigung #'+id+' für DN '+nr+' zurückgenommen: '+grund]);
      await client.query('COMMIT');res.json({ok:true,personalnummer:nr,status:'Aktiv'});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
  });
  app.get('/api/kuendigungen/archiv',
    requireLogin,requireRight('kue',1),requireRight('kuearchiv',1),
    async(req,res,next)=>{
      try{
        const {rows}=await db.query(
          'SELECT '+KUE_LIST_COLUMNS+' FROM kuendigungen WHERE NOT ('+
          KUE_AKTUELL_BEDINGUNG+
          ') IS TRUE ORDER BY COALESCE(kuendigungsdatum,(erfasst_am AT TIME ZONE \'Europe/Berlin\')::date) DESC NULLS LAST,id DESC LIMIT 2000');
        res.json(rows);
      }catch(e){next(e);}
    });

  app.get('/api/kuendigungen/:id/akte',requireLogin,requireRight('kue',1),async(req,res,next)=>{
    try{
      const id=Number(req.params.id);
      if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Ungültiger Kündigungsvorgang'});
      const {rows}=await db.query(
        'SELECT id,personalnummer,vorname,nachname,rang,grund,eintritt,kuendigungsdatum,erfasst_am,'+
        'vertrag,urkunde,zeugnis,kuendigung,personal_snapshot,'+
        KUE_AKTUELL_BEDINGUNG+' AS aktuell '+
        'FROM kuendigungen WHERE id=$1',[id]);
      if(!rows.length)return res.status(404).json({error:'Kündigung nicht gefunden'});
      const k=rows[0],rechte=await effektiveRechte(req.user);
      if(k.aktuell!==true&&Number(rechte.kuearchiv||0)<1)
        return res.status(403).json({error:'Kein Zugriff auf das Kündigungsarchiv'});
      const snapshot=k.personal_snapshot||{};
      // Nach der Kündigung erzeugte Dokumente bleiben zusätzlich dauerhaft verlinkt.
      const {rows:neueDokumente}=await db.query(
        "SELECT typ,titel,url,erstellt FROM generierte_dokumente "+
        "WHERE kontext_id=$1 AND typ IN ('fristgerecht','fristlos') ORDER BY erstellt DESC,id DESC",
        [id]);
      const persRecht=Number(rechte.pers||0)>=1;
      const {rows:roles}=await db.query('SELECT sensibel FROM roles WHERE name=$1',[req.user.rolle]);
      const sensibel=persRecht&&roles[0]?.sensibel===true;
      let personal=null;
      if(persRecht&&snapshot.personal&&typeof snapshot.personal==='object'){
        if(sensibel)personal=snapshot.personal;
        else {
          const sichtbare=['personalnummer','vorname','nachname','dienstgrad','status',
            'gruppe','beschaeftigungsart','eintrittsdatum','nebenjob','waffenschein',
            'spind','rsa','letzte_befoerderung','naechste_befoerderung','por_status'];
          personal=Object.fromEntries(sichtbare.map(key=>[key,snapshot.personal[key]]));
        }
      }
      res.json({
        vorgang:{
          id:k.id,personalnummer:k.personalnummer,vorname:k.vorname,nachname:k.nachname,
          rang:k.rang,grund:k.grund,eintritt:k.eintritt,kuendigungsdatum:k.kuendigungsdatum,
          erfasst_am:k.erfasst_am,aktuell:k.aktuell,ruecknahme:snapshot.ruecknahme||null
        },
        dokumente:[
          {name:'Arbeitsvertrag',wert:k.vertrag},
          {name:'Ernennungsurkunde',wert:k.urkunde},
          {name:'Arbeitszeugnis',wert:k.zeugnis},
          {name:'Kündigung',wert:k.kuendigung}
        ],
        momentaufnahme:{
          quelle:snapshot.quelle||'unbekannt',
          gesichert_am:snapshot.gesichert_am||null,
          personal,
          generierte_dokumente:sensibel&&Array.isArray(snapshot.generierte_dokumente)?
            snapshot.generierte_dokumente:[],
          kuendigungsdokumente_nachtraeglich:neueDokumente
        }
      });
    }catch(e){next(e);}
  });
}
