/* Erweiterte Verwaltung: Personallaufbahn, revisionssicherer Feldvergleich,
   Papierkorb mit transaktionaler Wiederherstellung. */
export function registerAktenFeatures(app,db,requireLogin,requireRight,effektiveRechte){
  const rechtZuBereich={
    personal:'pers',kuendigungen:'kue',disziplin:'dis',
    sonderfunktionen:'sonder',checklisten:'chk',
    textbausteine:'texte',routine:'rout',sonderzahlungen:'rout'
  };
  const idVal=raw=>{
    const n=Number(raw);
    return Number.isSafeInteger(n)&&n>0?n:null;
  };
  function erlaubteBereiche(rechte){
    return Object.entries(rechtZuBereich)
      .filter(([,modul])=>Number(rechte[modul]||0)>=1)
      .map(([bereich])=>bereich);
  }
  function zusammenfassung(felder){
    return Object.entries(felder||{}).map(([name,werte])=>({
      feld:name,alt:werte?.alt??null,neu:werte?.neu??null
    }));
  }

  app.get('/api/akten/:nr/laufbahn',requireLogin,requireRight('pers',1),requireRight('persverlauf',1),async(req,res,next)=>{
    try{
      const nr=idVal(req.params.nr);
      if(!nr)return res.status(400).json({error:'Ungültige Personalnummer'});
      const person=(await db.query('SELECT personalnummer,vorname,nachname,status,dienstgrad,eintrittsdatum,letzte_befoerderung FROM personal WHERE personalnummer=$1',[nr])).rows[0];
      if(!person)return res.status(404).json({error:'Personalakte nicht gefunden'});
      const rechte=await effektiveRechte(req.user);
      const bereiche=erlaubteBereiche(rechte);
      const [journal,alt,bef,antraege,dokumente]=await Promise.all([
        db.query("SELECT a.zeit,a.bereich,a.vorgang,a.felder,u.anzeigename AS benutzer FROM idv_aenderungen a LEFT JOIN users u ON u.id=a.user_id WHERE a.personalnummer=$1 AND a.bereich=ANY($2::text[]) ORDER BY a.zeit DESC,a.id DESC LIMIT 150",[nr,bereiche]),
        db.query("SELECT zeit,aenderungen,u.anzeigename AS benutzer FROM personal_audit a LEFT JOIN users u ON u.id=a.user_id WHERE personalnummer=$1 AND zeit < COALESCE((SELECT MIN(zeit) FROM idv_aenderungen WHERE bereich='personal' AND personalnummer=$1),'infinity'::timestamptz) ORDER BY zeit DESC LIMIT 75",[nr]),
        Number(rechte.bef||0)>=1?db.query("SELECT am,rang,neu_rang,grund,erstellt FROM befoerderungen WHERE personalnummer=$1 ORDER BY erstellt DESC LIMIT 60",[nr]):Promise.resolve({rows:[]}),
        Number(rechte.ranghistorie||0)>=1?db.query("SELECT erstellt,entschieden_am,alter_rang,beantragter_rang,status FROM personal_rangantraege WHERE personalnummer=$1 ORDER BY erstellt DESC LIMIT 60",[nr]):Promise.resolve({rows:[]}),
        Number(rechte.pers||0)>=2?db.query("SELECT erstellt,typ,titel FROM generierte_dokumente WHERE personalnummer=$1 ORDER BY erstellt DESC LIMIT 60",[nr]):Promise.resolve({rows:[]})
      ]);
      const events=[];
      if(person.eintrittsdatum)events.push({zeit:person.eintrittsdatum,titel:'Dienstantritt',bereich:'personal',typ:'eintritt',details:[],benutzer:null});
      if(person.letzte_befoerderung && Number(rechte.bef||0)>=1 && !bef.rows.some(b=>String(b.am||'').slice(0,10)===String(person.letzte_befoerderung).slice(0,10)))
        events.push({zeit:person.letzte_befoerderung,titel:'Letzte bekannte Beförderung',bereich:'bef',typ:'bef',details:[{feld:'Dienstgrad',alt:null,neu:person.dienstgrad}],benutzer:null});
      for(const j of journal.rows)events.push({zeit:j.zeit,titel:j.vorgang+' · '+j.bereich,bereich:j.bereich,typ:'journal',details:zusammenfassung(j.felder),benutzer:j.benutzer||null});
      for(const a of alt.rows)events.push({zeit:a.zeit,titel:'Historische Personaländerung',bereich:'personal',typ:'journal',details:zusammenfassung(a.aenderungen),benutzer:a.benutzer||null});
      for(const b of bef.rows)events.push({zeit:b.am||b.erstellt,titel:'Beförderung: '+(b.rang||'–')+' → '+(b.neu_rang||'–'),bereich:'bef',typ:'bef',details:b.grund?[{feld:'Grund',alt:null,neu:b.grund}]:[],benutzer:null});
      for(const a of antraege.rows)events.push({zeit:a.entschieden_am||a.erstellt,titel:'Rangantrag '+a.status+': '+a.alter_rang+' → '+a.beantragter_rang,bereich:'bef',typ:'antrag',details:[],benutzer:null});
      for(const d of dokumente.rows)events.push({zeit:d.erstellt,titel:'Dokument erstellt: '+d.titel,bereich:'personal',typ:'dokument',details:[{feld:'Dokumenttyp',alt:null,neu:d.typ}],benutzer:null});
      if(Number(rechte.dis||0)>=1){
        const ds=(await db.query('SELECT slots FROM disziplin WHERE personalnummer=$1',[nr])).rows[0];
        const labels=['Ermahnung','Verwarnung','Abmahnung','Suspendierung','Degradierung','Entlassung'];
        (Array.isArray(ds?.slots)?ds.slots:[]).forEach((x,i)=>{
          if(x?.done&&x.d)events.push({zeit:x.d,titel:'Disziplinarmaßnahme: '+labels[i],bereich:'disziplin',typ:'dis',details:[{feld:'Bezeichnung',alt:null,neu:x.t||''}],benutzer:null});
        });
      }
      events.sort((a,b)=>String(b.zeit||'').localeCompare(String(a.zeit||'')));
      res.json({person:{personalnummer:person.personalnummer,name:[person.vorname,person.nachname].filter(Boolean).join(' '),dienstgrad:person.dienstgrad,status:person.status},ereignisse:events.slice(0,250)});
    }catch(err){next(err);}
  });

  app.get('/api/aenderungsvergleich',requireLogin,requireRight('log',1),async(req,res,next)=>{
    try{
      const rechte=await effektiveRechte(req.user),bereiche=erlaubteBereiche(rechte);
      if(!bereiche.length)return res.json([]);
      const gefiltert=String(req.query.bereich||'');
      if(gefiltert&&!bereiche.includes(gefiltert))return res.status(403).json({error:'Kein Zugriff auf diesen Bereich'});
      const limit=Math.min(150,Math.max(1,Number(req.query.limit)||80));
      const {rows}=await db.query(
        "SELECT a.id,a.zeit,a.bereich,a.schluessel,a.personalnummer,a.vorgang,a.felder,u.anzeigename AS benutzer FROM idv_aenderungen a LEFT JOIN users u ON u.id=a.user_id WHERE a.bereich=ANY($1::text[]) ORDER BY a.id DESC LIMIT $2",
        [gefiltert?[gefiltert]:bereiche,limit]);
      res.json(rows.map(({felder,...x})=>({...x,details:zusammenfassung(felder)})));
    }catch(err){next(err);}
  });

  app.get('/api/papierkorb',requireLogin,requireRight('papierkorb',1),async(req,res,next)=>{
    try{
      const rechte=await effektiveRechte(req.user);
      const bereiche=['kuendigungen','checklisten','textbausteine'].filter(x=>Number(rechte[{kuendigungen:'kue',checklisten:'chk',textbausteine:'texte'}[x]]||0)>=1);
      if(req.user.rolle==='Administrator')bereiche.push('personal');
      if(!bereiche.length)return res.json([]);
      const {rows}=await db.query(
        "SELECT p.id,p.bereich,p.schluessel,p.titel,p.geloescht_am,u.anzeigename AS geloescht_von FROM idv_papierkorb p LEFT JOIN users u ON u.id=p.geloescht_von WHERE p.wiederhergestellt_am IS NULL AND p.bereich=ANY($1::text[]) ORDER BY p.id DESC LIMIT 150",
        [bereiche]);
      res.json(rows);
    }catch(err){next(err);}
  });

  app.post('/api/papierkorb/:id/wiederherstellen',requireLogin,requireRight('papierkorb',2),async(req,res,next)=>{
    const id=idVal(req.params.id);
    if(!id)return res.status(400).json({error:'Ungültiger Papierkorb-Eintrag'});
    const client=await db.connect().catch(next);
    if(!client)return;
    try{
      await client.query('BEGIN');
      await client.query("SELECT set_config('idv.benutzer',$1,true)",[String(req.user.id)]);
      const {rows}=await client.query('SELECT * FROM idv_papierkorb WHERE id=$1 AND wiederhergestellt_am IS NULL FOR UPDATE',[id]);
      if(!rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Papierkorb-Eintrag nicht mehr vorhanden'});}
      const p=rows[0];
      const passendeRechte={kuendigungen:'kue',checklisten:'chk',textbausteine:'texte'};
      const rechte=await effektiveRechte(req.user);
      if(p.bereich==='personal'&&req.user.rolle!=='Administrator'){
        await client.query('ROLLBACK');
        return res.status(403).json({error:'Nur Administratoren können Personaldatensätze wiederherstellen'});
      }
      if(p.bereich!=='personal'&&Number(rechte[passendeRechte[p.bereich]]||0)<2){
        await client.query('ROLLBACK');
        return res.status(403).json({error:'Für die Wiederherstellung fehlt das Bearbeitungsrecht im ursprünglichen Bereich'});
      }
      if(p.bereich==='kuendigungen'){
        await client.query('INSERT INTO kuendigungen SELECT (jsonb_populate_record(NULL::kuendigungen,$1::jsonb)).*',[JSON.stringify(p.datensatz)]);
      }else if(p.bereich==='checklisten'){
        await client.query('INSERT INTO checklisten SELECT (jsonb_populate_record(NULL::checklisten,$1::jsonb)).*',[JSON.stringify(p.datensatz)]);
        const extra=Array.isArray(p.zusatz)?p.zusatz:[];
        if(extra.length)await client.query('INSERT INTO checklisten_status SELECT (jsonb_populate_recordset(NULL::checklisten_status,$1::jsonb)).*',[JSON.stringify(extra)]);
      }else if(p.bereich==='personal'){
        const nr=Number(p.datensatz?.personalnummer);
        if(!Number.isSafeInteger(nr)||nr<1||String(nr)!==p.schluessel)
          throw Object.assign(new Error('Ungültiger Personaldatensatz'),{status:409});
        const restored=await client.query(
          'UPDATE personal SET administrativ_geloescht_am=NULL,administrativ_geloescht_von=NULL '+
          'WHERE personalnummer=$1 AND administrativ_geloescht_am IS NOT NULL RETURNING personalnummer',[nr]);
        if(restored.rowCount!==1)
          throw Object.assign(new Error('Personaldatensatz ist nicht mehr im Papierkorb'),{status:409});
      }else if(p.bereich==='textbausteine'){
        const d=p.datensatz;
        const result=await client.query(
          'UPDATE textbausteine SET geloescht=false WHERE schluessel=$1 AND geloescht=true AND titel=$2 AND inhalt=$3 AND kategorie=$4',
          [p.schluessel,d.titel,d.inhalt,d.kategorie]);
        if(result.rowCount!==1)throw Object.assign(new Error('Textbaustein wurde seit dem Löschen geändert oder bereits wiederhergestellt'),{status:409});
      }else{
        throw Object.assign(new Error('Unbekannter Datensatztyp'),{status:400});
      }
      await client.query('UPDATE idv_papierkorb SET wiederhergestellt_am=now(),wiederhergestellt_von=$2 WHERE id=$1',[id,req.user.id]);
      await client.query("INSERT INTO log(user_id,aktion,art) VALUES($1,$2,'edit')",[req.user.id,'Aus Papierkorb wiederhergestellt: '+p.bereich+' / '+p.schluessel]);
      await client.query('COMMIT');
      res.json({ok:true,bereich:p.bereich,schluessel:p.schluessel});
    }catch(err){
      await client.query('ROLLBACK').catch(()=>{});
      if(err.code==='23505'||err.code==='23503'||err.code==='23514'||err.status===409)
        return res.status(409).json({error:'Wiederherstellung nicht möglich: Der ursprüngliche Eintrag oder seine Zuordnung kollidiert mit aktuellen Daten.'});
      next(err);
    }finally{client.release();}
  });
}
