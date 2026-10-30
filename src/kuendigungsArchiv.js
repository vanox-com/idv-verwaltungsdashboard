/* Kündigungsarchiv: keine Datensätze verschieben oder löschen.
   "Aktuell" bedeutet: belegtes Kündigungs- oder Erfassungsdatum
   innerhalb der letzten 60 Kalendertage, heute eingeschlossen.
   Undatierte Altvorgänge liegen im Archiv, nicht fälschlich unter "neu". */
/* Bei Altvorgängen ohne Datum gilt der nachweisbare Statuswechsel auf
   "Gekündigt" als Erfassungsereignis für die 60-Tage-Ansicht.
   Die tatsächlichen historischen Kündigungsdaten bleiben unbekannt. */
const KUE_STATUSWECHSEL=
  "(SELECT MAX(a.zeit) FROM personal_audit a JOIN personal p ON p.personalnummer=a.personalnummer "+
  "WHERE a.personalnummer=kuendigungen.personalnummer AND p.status='Gekündigt' "+
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
].join(',')+','+KUE_STATUSWECHSEL_SPALTE+',xmin::text AS _revision';

export function registerKueArchivRoutes(app,db,requireLogin,requireRight,effektiveRechte){
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
          erfasst_am:k.erfasst_am,aktuell:k.aktuell
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
