<?php
declare(strict_types=1);
namespace IDV;

function routineMutation(array $u,int $id,string $revision,callable $edit): array {
    db()->beginTransaction();
    try{
        $found=sql('SELECT id,tage,personen,row_revision FROM routine WHERE id=? FOR UPDATE',[$id]);
        if(!$found)fail(404,'Routine nicht gefunden');
        $r=$found[0];
        if((string)$r['row_revision']!==$revision)versionConflict();
        $days=json_decode((string)$r['tage'],true,64,JSON_THROW_ON_ERROR);
        $people=json_decode((string)$r['personen'],true,64,JSON_THROW_ON_ERROR);
        if(!is_array($days)||!is_array($people)||!array_is_list($days)||!array_is_list($people))
            fail(409,'Routine-Daten sind nicht vollständig');
        $beforeDays=$days;$beforePeople=$people;
        $action=$edit($days,$people);
        $stmt=db()->prepare('UPDATE routine SET tage=?,personen=? WHERE id=? AND row_revision=?');
        $stmt->execute([
            json_encode($days,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            json_encode($people,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id,$revision
        ]);
        if($stmt->rowCount()!==1)versionConflict();
        $new=(string)sql('SELECT row_revision FROM routine WHERE id=?',[$id])[0]['row_revision'];
        auditAction($u,$action);
        $diff=['tage'=>['alt'=>$beforeDays,'neu'=>$days],
            'personen'=>['alt'=>$beforePeople,'neu'=>$people]];
        sql("INSERT INTO idv_aenderungen(bereich,schluessel,personalnummer,vorgang,felder,user_id)
              VALUES('routine',?,NULL,'Bearbeitet',?,?)",
            [(string)$id,json_encode($diff,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']]);
        db()->commit();
        return ['ok'=>true,'_revision'=>$new];
    }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function dispatchRoutineEditing(array $u,string $method,string $uri): bool {
    if($method==='POST'&&preg_match('#^/api/routine/([1-9][0-9]*)/(anwesenheit|teilnehmer)$#D',$uri,$m)||
       $method==='PATCH'&&preg_match('#^/api/routine/([1-9][0-9]*)/teilnehmer/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'rout',2);$id=cleanId($m[1]);$revision=expectedRevision();$b=body();
        $action=$m[2];$routeNr=$method==='PATCH'?cleanId($m[3]):null;
        $result=routineMutation($u,$id,$revision,function(array &$days,array &$people) use($id,$b,$action,$routeNr):string {
            $n=$routeNr??filter_var($b['nr']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
            if(!$n)fail(400,'Ungültige Personalnummer');
            $pos=null;
            foreach($people as $i=>$p)if((int)($p['nr']??0)===$n){$pos=$i;break;}
            if($action==='anwesenheit'){
                $day=$b['tagIndex']??null;$attendance=$b['anwesend']??null;
                if(!is_int($day)||$day<0||$day>=count($days)||!is_bool($attendance))
                    fail(400,'Ungültige Person, Termin oder Anwesenheit');
                $staff=sql('SELECT vorname,nachname,status,eintrittsdatum FROM personal
                    WHERE personalnummer=? AND administrativ_geloescht_am IS NULL',[$n]);
                if($staff&&in_array($staff[0]['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true)
                   &&$staff[0]['eintrittsdatum']&&routineIso($days[$day])<$staff[0]['eintrittsdatum'])
                    fail(409,'Anwesenheit vor Dienstantritt ist nicht zulässig');
                if($pos===null){
                    if(!$staff||!in_array($staff[0]['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true))
                        fail(404,'Person nicht mehr in der Personalverwaltung');
                    $people[]=['nr'=>$n,'vorname'=>$staff[0]['vorname']??'','nachname'=>$staff[0]['nachname']??'',
                        'abgemeldet'=>$staff[0]['status']==='Abgemeldet',
                        'anwesend'=>array_fill(0,count($days),null)];
                    $pos=count($people)-1;
                }
                if(!is_array($people[$pos]['anwesend']??null)||count($people[$pos]['anwesend'])!==count($days))
                    fail(409,'Anwesenheitsliste ist nicht synchron mit den Terminen');
                $people[$pos]['anwesend'][$day]=$attendance;
                return 'Routine '.$id.': Anwesenheit '.$n.' / '.$days[$day].' → '.($attendance?'ja':'nein');
            }
            if($action==='teilnehmer'&&$routeNr===null){
                if($pos!==null)fail(409,'Person ist bereits eingetragen');
                if(count($people)>=500)fail(409,'Maximal 500 Teilnehmende');
                $staff=sql('SELECT vorname,nachname,status FROM personal WHERE personalnummer=?',[$n]);
                if(!$staff)fail(404,'Personalakte nicht gefunden');
                $people[]=['nr'=>$n,'vorname'=>$staff[0]['vorname']??'','nachname'=>$staff[0]['nachname']??'',
                    'abgemeldet'=>$staff[0]['status']==='Abgemeldet',
                    'anwesend'=>array_fill(0,count($days),null)];
                return 'Routine '.$id.': Person '.$n.' aufgenommen';
            }
            $off=$b['abgemeldet']??null;
            if(!is_bool($off))fail(400,'Ungültiger Teilnehmerstatus');
            if($pos===null){
                $staff=sql("SELECT vorname,nachname,status FROM personal
                   WHERE personalnummer=? AND administrativ_geloescht_am IS NULL
                     AND status IN ('Aktiv','Abgemeldet','Inaktiv','Suspendiert')",[$n]);
                if(!$staff)fail(404,'Person nicht mehr in der Personalverwaltung');
                $people[]=['nr'=>$n,'vorname'=>$staff[0]['vorname']??'','nachname'=>$staff[0]['nachname']??'',
                    'abgemeldet'=>$staff[0]['status']==='Abgemeldet','anwesend'=>array_fill(0,count($days),null)];
                $pos=count($people)-1;
            }
            $people[$pos]['abgemeldet']=$off;
            return 'Routine '.$id.': Person '.$n.($off?' als abgemeldet markiert':' wieder aktiviert');
        });
        respond(200,$result);
    }
    if($method==='PATCH'&&preg_match('#^/api/sonderzahlung/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'rout',2);$id=cleanId($m[1]);$rev=expectedRevision();$b=body();
        if(!is_bool($b['erhalten']??null)||!is_string($b['betrag']??null)||
            !is_string($b['grund']??null)||!is_string($b['datum']??null)||
            strlen($b['betrag'])>80||strlen($b['grund'])>1000||
            ($b['datum']!==''&&routineIso($b['datum'])!==$b['datum']))
            fail(400,'Ungültiger Betrag, Grund oder Datum');
        db()->beginTransaction();
        try{
            $old=sql('SELECT * FROM sonderzahlungen WHERE id=? FOR UPDATE',[$id]);
            if(!$old||(string)$old[0]['row_revision']!==$rev)versionConflict();
            $stmt=db()->prepare('UPDATE sonderzahlungen
                    SET erhalten=?,datum=?,betrag=?,grund=? WHERE id=? AND row_revision=?');
            $stmt->execute([$b['erhalten']?1:0,$b['datum']?:null,trim($b['betrag']),trim($b['grund']),$id,$rev]);
            if($stmt->rowCount()!==1)versionConflict();
            $new=(string)sql('SELECT row_revision FROM sonderzahlungen WHERE id=?',[$id])[0]['row_revision'];
            auditAction($u,'Sonderzahlung '.$id.' aktualisiert');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'_revision'=>$new]);
    }
    return false;
}
