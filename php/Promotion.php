<?php
declare(strict_types=1);
namespace IDV;

/** Promotions, rank requests and POR approvals: all permission checks server side. */
function canPromote(array $u): bool {
    $rights=rights($u);
    return ($rights['bef']??0)>=2||($u['rolle']==='Polizeirat'&&($rights['bef']??0)>=1);
}
function dispatchPromotion(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/rangantraege'){
        $rights=rights($u);
        if(($rights['pers']??0)<1&&($rights['bef']??0)<1&&($rights['por']??0)<2)
            fail(403,'Keine Berechtigung für Rangänderungsanträge');
        respond(200,sql("SELECT a.id,a.personalnummer,a.alter_rang,a.beantragter_rang,
           a.begruendung,a.status,a.erstellt,a.korrigiertes_befoerderungsdatum,
           p.vorname,p.nachname FROM personal_rangantraege a
           JOIN personal p ON p.personalnummer=a.personalnummer
           WHERE a.status='beantragt' ORDER BY a.erstellt ASC,a.id ASC LIMIT 200"));
    }
    if($method==='GET'&&$uri==='/api/rangantraege/historie'){
        needRight($u,'bef');
        $rights=rights($u);
        if(($rights['por']??0)<1&&($rights['ranghistorie']??0)<1)
            fail(403,'Kein Recht zur Einsicht in die Rangänderungs-Historie');
        $limit=(int)($_GET['limit']??40);$offset=(int)($_GET['offset']??0);
        if($limit<1||$limit>100||$offset<0||$offset>100000)
            fail(400,'Ungültige Historien-Seite');
        $stmt=db()->prepare("SELECT a.id,a.personalnummer,a.alter_rang,a.beantragter_rang,
            a.begruendung,a.status,a.erstellt,a.entschieden_am,a.korrigiertes_befoerderungsdatum,
            p.vorname,p.nachname,decider.anzeigename AS entschieden_von,
            applicant.anzeigename AS beantragt_von FROM personal_rangantraege a
            LEFT JOIN personal p ON p.personalnummer=a.personalnummer
            LEFT JOIN users decider ON decider.id=a.entscheider_id
            LEFT JOIN users applicant ON applicant.id=a.antragsteller_id
            WHERE a.status IN ('genehmigt','abgelehnt')
            ORDER BY (a.entschieden_am IS NULL) ASC,a.entschieden_am DESC,a.id DESC LIMIT ? OFFSET ?");
        $stmt->bindValue(1,$limit+1,\PDO::PARAM_INT);$stmt->bindValue(2,$offset,\PDO::PARAM_INT);
        $stmt->execute();$rows=$stmt->fetchAll();
        respond(200,['items'=>array_slice($rows,0,$limit),'weitere'=>count($rows)>$limit]);
    }
    if($method==='POST'&&$uri==='/api/rangantraege'){
        needRight($u,'pers',2);$b=body();
        $nr=filter_var($b['personalnummer']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        $rank=trim((string)($b['beantragter_rang']??''));$why=trim((string)($b['begruendung']??''));
        if(!$nr||!$rank||strlen($why)>1000)fail(400,'Ungültiger Rangantrag');
        db()->beginTransaction();
        try{
            if(!sql('SELECT 1 FROM raenge WHERE name=?',[$rank]))fail(400,'Unbekannter Dienstgrad');
            $p=sql('SELECT dienstgrad FROM personal WHERE personalnummer=? FOR UPDATE',[$nr]);
            if(!$p||($p[0]['dienstgrad']??'')===$rank)fail(409,'Personalakte fehlt oder Antrag unverändert');
            if(sql("SELECT 1 FROM personal_rangantraege WHERE personalnummer=? AND status='beantragt'",[$nr]))
                fail(409,'Für diese Person besteht bereits ein offener Rangantrag');
            sql('INSERT INTO personal_rangantraege(personalnummer,alter_rang,beantragter_rang,begruendung,antragsteller_id)
                VALUES(?,?,?,?,?)',[$nr,$p[0]['dienstgrad']??'',$rank,$why,$u['id']]);
            $id=(int)db()->lastInsertId();
            auditAction($u,'Rangantrag '.$id.' gestellt','add');
            db()->commit();
        }catch(\PDOException $e){
            if(db()->inTransaction())db()->rollBack();
            if((int)($e->errorInfo[1]??0)===1062)fail(409,'Für diese Person besteht bereits ein offener Rangantrag');
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'id'=>$id]);
    }
    if($method==='POST'&&preg_match('#^/api/rangantraege/([1-9][0-9]*)/entscheidung$#D',$uri,$m)){
        needRight($u,'por',2);$id=cleanId($m[1]);$b=body();
        if(!is_bool($b['genehmigt']??null))fail(400,'Ungültige Entscheidung');
        db()->beginTransaction();
        try{
            $request=sql('SELECT * FROM personal_rangantraege WHERE id=? FOR UPDATE',[$id]);
            if(!$request||$request[0]['status']!=='beantragt')fail(409,'Antrag nicht mehr offen');
            $a=$request[0];$approved=$b['genehmigt'];
            if($approved){
                $exam=examForRank((string)$a['alter_rang']);
                if($exam&&$a['beantragter_rang']===$exam['ziel']){
                    $flags=normalizedRows('SELECT werte FROM sonderfunktionen WHERE personalnummer=?',[$a['personalnummer']],['werte']);
                    if(($flags[0]['werte'][$exam['code']]??false)!==true)
                        fail(409,'Die '.$exam['code'].'-Prüfung muss vor der Rangänderung bestanden sein');
                }
                $stmt=db()->prepare("UPDATE personal SET dienstgrad=?,
                  letzte_befoerderung=COALESCE(?,letzte_befoerderung),
                  naechste_befoerderung=CASE WHEN ? IS NOT NULL THEN NULL ELSE naechste_befoerderung END
                  WHERE personalnummer=? AND COALESCE(dienstgrad,'')=?");
                $stmt->execute([$a['beantragter_rang'],$a['korrigiertes_befoerderungsdatum'],
                    $a['korrigiertes_befoerderungsdatum'],$a['personalnummer'],$a['alter_rang']]);
                if($stmt->rowCount()!==1)fail(409,'Dienstgrad hat sich inzwischen geändert; Antrag bitte neu stellen');
            }
            sql('UPDATE personal_rangantraege SET status=?,entscheider_id=?,entschieden_am=UTC_TIMESTAMP(6) WHERE id=?',
                [$approved?'genehmigt':'abgelehnt',$u['id'],$id]);
            auditAction($u,'Rangantrag '.$id.' '.($approved?'genehmigt':'abgelehnt'));
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if($method==='GET'&&$uri==='/api/por/offen'){
        needRight($u,'por',2);
        $rows=sql("SELECT p.personalnummer,
          COALESCE((SELECT CAST(MAX(l.id) AS CHAR) FROM log l
            WHERE l.aktion=CONCAT('POR-Freigabe bei ',p.personalnummer,': beantragt')),'bestand') AS revision
          FROM personal p WHERE p.por_status='beantragt' AND p.status<>'Gekündigt'
          AND p.administrativ_geloescht_am IS NULL ORDER BY p.personalnummer");
        respond(200,array_map(fn($r)=>['nr'=>(int)$r['personalnummer'],'revision'=>(string)$r['revision']],$rows));
    }
    if($method==='PATCH'&&preg_match('#^/api/por/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'bef');$nr=cleanId($m[1]);$b=body();
        $status=(string)($b['status']??'');$note=trim((string)($b['notiz']??''));
        if(!in_array($status,['offen','beantragt','genehmigt','abgelehnt'],true))fail(400,'Ungültiger POR-Status');
        if(strlen($note)>1000)fail(400,'Notiz zu lang');
        $rights=rights($u);$isPor=($rights['por']??0)>=2;
        $council=$u['rolle']==='Polizeirat'&&($rights['bef']??0)>=1;
        $canRequest=($rights['bef']??0)>=2||$council;
        if(!$isPor&&$council&&($rights['bef']??0)<2&&$status!=='beantragt')
            fail(403,'Mit Polizeirat-Leserecht kann nur eine Freigabe beantragt werden');
        if(!$isPor&&(!$canRequest||in_array($status,['genehmigt','abgelehnt'],true)))
            fail(403,'Nur ein POR-Berechtigter darf genehmigen oder ablehnen');
        $date=null;
        if($status==='genehmigt'){
            $date=(string)($b['datum']??gmdate('Y-m-d'));
            if(routineIso($date)!==$date)fail(400,'Ungültiges Datum');
        }
        db()->beginTransaction();
        try{
            $p=sql('SELECT por_status FROM personal WHERE personalnummer=? FOR UPDATE',[$nr]);
            if(!$p)fail(404,'Personalnummer nicht gefunden');
            if(!$isPor&&!in_array($p[0]['por_status'],['offen','beantragt'],true))
                fail(403,'Eine POR-Entscheidung darf nur von POR-Berechtigten geändert werden');
            sql('UPDATE personal SET por_status=?,por_notiz=?,por_am=? WHERE personalnummer=?',
                [$status,$note,$date,$nr]);
            auditAction($u,'POR-Freigabe bei '.$nr.': '.$status);
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'status'=>$status]);
    }
    if($method==='POST'&&$uri==='/api/befoerdern'){
        needRight($u,'bef');
        if(!canPromote($u))fail(403,'Kein Recht für diese Beförderungsaktion');
        $b=body();$nr=filter_var($b['nr']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if(!$nr)fail(400,'Ungültige Personalnummer');
        db()->beginTransaction();
        try {
            $person=sql('SELECT personalnummer,vorname,nachname,status,dienstgrad,por_status,por_am,
                letzte_befoerderung,naechste_befoerderung FROM personal WHERE personalnummer=? FOR UPDATE',[$nr]);
            if(!$person)fail(404,'Personalnummer nicht gefunden');
            $p=$person[0];
            if($p['status']==='Gekündigt')fail(409,'Gekündigtes Personal kann nicht befördert werden');
            if($p['por_status']!=='genehmigt')fail(403,'Beförderung nur mit gültiger POR-Freigabe möglich');
            $ranks=sql('SELECT name,tage,naechster_rang FROM raenge ORDER BY sortierung,name');
            $current=null;$next=null;
            foreach($ranks as $r)if($r['name']===$p['dienstgrad']){$current=$r;break;}
            if($current)foreach($ranks as $r)if($r['name']===$current['naechster_rang']){$next=$r;break;}
            $exam=examForRank((string)$p['dienstgrad']);
            if(!$current||!$next||(!$exam&&(int)$current['tage']<=0))
                fail(409,'Für diesen Dienstgrad ist keine weitere Beförderung vorgesehen');
            $nextRank=$next['name'];
            if(!empty($b['neuer_rang'])&&$b['neuer_rang']!==$nextRank)
                fail(409,'Der nächste Dienstgrad stimmt nicht mit der Dienstgradfolge überein');
            if($exam){
                if($nextRank!==$exam['ziel'])
                    fail(409,'Anwärter können nur in den vorgesehenen Prüfungsdienstgrad befördert werden');
                $flags=normalizedRows('SELECT werte FROM sonderfunktionen WHERE personalnummer=?',[$nr],['werte']);
                if(($flags[0]['werte'][$exam['code']]??false)!==true)
                    fail(409,'Die '.$exam['code'].'-Prüfung muss als bestanden markiert sein');
            }else {
                $due=$p['naechste_befoerderung'];
                if(!$due&&$p['letzte_befoerderung'])
                    $due=(new \DateTimeImmutable($p['letzte_befoerderung'],new \DateTimeZone('UTC')))
                        ->modify('+'.((int)$current['tage']).' days')->format('Y-m-d');
                if(!$due)fail(409,'Es fehlt ein gültiges Datum für die Beförderungsfrist');
                if($due>gmdate('Y-m-d'))fail(409,'Beförderungsfrist ist noch nicht abgelaufen');
            }
            $why=trim((string)($b['grund']??($exam?$exam['code'].'-Prüfung bestanden':'Beförderung nach Dienstzeit')));
            if(strlen($why)>1000)fail(400,'Beförderungsgrund zu lang');
            sql("UPDATE personal SET dienstgrad=?,letzte_befoerderung=UTC_DATE(),
                naechste_befoerderung=NULL,por_status='offen',por_notiz='',por_am=NULL WHERE personalnummer=?",
                [$nextRank,$nr]);
            sql("INSERT INTO befoerderungen(personalnummer,vorname,nachname,rang,neu_rang,grund,am,por)
                VALUES(?,?,?,?,?,?,UTC_DATE(),'POR genehmigt')",
                [$nr,$p['vorname'],$p['nachname'],$p['dienstgrad'],$nextRank,$why]);
            auditAction($u,'Befördert: '.$nr.' '.$p['dienstgrad'].' → '.$nextRank.' (POR genehmigt)','add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'neuer_rang'=>$nextRank]);
    }
    return false;
}
