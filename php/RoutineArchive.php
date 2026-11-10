<?php
declare(strict_types=1);
namespace IDV;

function routineIso(mixed $value): ?string {
    if(!is_string($value))return null;
    if(preg_match('/^(\d{2})\.(\d{2})\.(\d{4})$/D',$value,$m))
        $value=$m[3].'-'.$m[2].'-'.$m[1];
    if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$value))return null;
    $d=\DateTimeImmutable::createFromFormat('!Y-m-d',$value,new \DateTimeZone('UTC'));
    return $d&&$d->format('Y-m-d')===$value?$value:null;
}
function routineGerman(string $day): string {return substr($day,8,2).'.'.substr($day,5,2).'.'.substr($day,0,4);}
function loadRoutineForArchive(int $id): array {
    $rows=sql('SELECT id,tage,personen,row_revision FROM routine WHERE id=? FOR UPDATE',[$id]);
    if(!$rows)fail(404,'Routineplan nicht gefunden');
    $r=$rows[0];
    $r['tage']=json_decode((string)$r['tage'],true,64,JSON_THROW_ON_ERROR);
    $r['personen']=json_decode((string)$r['personen'],true,64,JSON_THROW_ON_ERROR);
    if(!is_array($r['tage'])||!is_array($r['personen'])||
        !array_is_list($r['tage'])||!array_is_list($r['personen']))
        fail(409,'Routineplan enthält keine gültigen Termin- und Anwesenheitslisten');
    foreach($r['personen'] as $p){
        if(!is_array($p)||!isset($p['nr'])||!is_array($p['anwesend']??null)||
            count($p['anwesend'])!==count($r['tage']))
            fail(409,'Anwesenheitsliste ist nicht mit den Routineterminen synchron');
    }
    $rev=(string)($_SERVER['HTTP_IF_MATCH']??'');
    if($rev!==''&&$rev!==(string)$r['row_revision'])versionConflict();
    return $r;
}
function dispatchRoutineArchive(array $u,string $method,string $uri): bool {
    if($method==='GET'&&preg_match('#^/api/routine/([1-9][0-9]*)/archiv$#D',$uri,$m)){
        needRight($u,'rout');needRight($u,'routarchiv');
        $id=cleanId($m[1]);
        if(!sql('SELECT 1 FROM routine WHERE id=?',[$id]))fail(404,'Routineplan nicht gefunden');
        $list=normalizedRows("SELECT a.id,a.routine_id,a.datum,a.teilnehmer,a.archiviert_am,
            COALESCE(us.anzeigename,'Unbekannt') AS archiviert_von FROM routine_archiv a
            LEFT JOIN users us ON us.id=a.archiviert_von
            WHERE a.routine_id=? ORDER BY a.datum DESC,a.id DESC LIMIT 400",[$id],['teilnehmer']);
        respond(200,$list);
    }
    if($method==='POST'&&preg_match('#^/api/routine/([1-9][0-9]*)/archiv$#D',$uri,$m)){
        needRight($u,'rout');needRight($u,'routarchiv',2);
        $id=cleanId($m[1]);$b=body();$date=$b['datum']??null;
        if(!is_string($date)||routineIso($date)!==$date)fail(400,'Ungültiges Termindatum');
        db()->beginTransaction();
        try {
            $plan=loadRoutineForArchive($id);
            $idx=-1;
            foreach($plan['tage'] as $i=>$day)if(routineIso($day)===$date){$idx=$i;break;}
            if($idx<0)fail(404,'Termin ist nicht mehr aktiv');
            if(sql('SELECT 1 FROM routine_archiv WHERE routine_id=? AND datum=?',[$id,$date]))
                fail(409,'Termin befindet sich bereits im Archiv');
            $staff=sql("SELECT personalnummer,vorname,nachname,status,eintrittsdatum FROM personal
                    WHERE administrativ_geloescht_am IS NULL
                    AND status IN ('Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt')");
            $byId=[];foreach($staff as $p)$byId[(int)$p['personalnummer']]=$p;
            $included=[];$snapshot=[];
            foreach($plan['personen'] as $p) {
                $n=(int)$p['nr'];$now=$byId[$n]??null;$included[$n]=true;
                $hasOldName=trim((string)($p['vorname']??''))!==''&&trim((string)($p['vorname']??''))!=='-'||
                    trim((string)($p['nachname']??''))!==''&&trim((string)($p['nachname']??''))!=='-';
                $dateMatches=$now&&(!$now['eintrittsdatum']||$now['eintrittsdatum']<=$date);
                $attendance=$p['anwesend'][$idx]===null?null:($p['anwesend'][$idx]===true);
                if(!$hasOldName&&!$dateMatches&&$attendance!==true)continue;
                $snapshot[]=[
                    'nr'=>$n,
                    'vorname'=>$hasOldName?(string)($p['vorname']??''):(string)($dateMatches?$now['vorname']:''),
                    'nachname'=>$hasOldName?(string)($p['nachname']??''):(string)($dateMatches?$now['nachname']:''),
                    'abgemeldet'=>($p['abgemeldet']??false)===true,
                    'anwesend'=>$attendance
                ];
            }
            foreach($staff as $p) {
                $n=(int)$p['personalnummer'];
                if(isset($included[$n])||$p['status']==='Gekündigt'||($p['eintrittsdatum']&&$p['eintrittsdatum']>$date))continue;
                $snapshot[]=['nr'=>$n,'vorname'=>$p['vorname']??'','nachname'=>$p['nachname']??'',
                    'abgemeldet'=>$p['status']==='Abgemeldet','anwesend'=>null];
            }
            usort($snapshot,fn($a,$b)=>$a['nr']<=>$b['nr']);
            sql('INSERT INTO routine_archiv(routine_id,datum,teilnehmer,archiviert_von) VALUES(?,?,?,?)',
                [$id,$date,json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']]);
            array_splice($plan['tage'],$idx,1);
            foreach($plan['personen'] as &$p)array_splice($p['anwesend'],$idx,1);unset($p);
            $stmt=db()->prepare('UPDATE routine SET tage=?,personen=? WHERE id=? AND row_revision=?');
            $stmt->execute([
                json_encode($plan['tage'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                json_encode($plan['personen'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                $id,$plan['row_revision']
            ]);
            if($stmt->rowCount()!==1)versionConflict();
            auditAction($u,'Routine '.$id.': Termin '.routineGerman($date).' archiviert');
            db()->commit();
        } catch(\PDOException $e) {
            if(db()->inTransaction())db()->rollBack();
            if((int)($e->errorInfo[1]??0)===1062)fail(409,'Dieser Termin liegt bereits im Archiv');
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'datum'=>$date,'anzahl'=>count($snapshot)]);
    }
    if($method==='POST'&&preg_match('#^/api/routine/([1-9][0-9]*)/archiv/([1-9][0-9]*)/wiederherstellen$#D',$uri,$m)){
        needRight($u,'rout');needRight($u,'routarchiv',2);
        $id=cleanId($m[1]);$archiveId=cleanId($m[2]);$b=body();
        db()->beginTransaction();
        try {
            $plan=loadRoutineForArchive($id);
            $rows=normalizedRows('SELECT datum,teilnehmer FROM routine_archiv WHERE id=? AND routine_id=? FOR UPDATE',
                [$archiveId,$id],['teilnehmer']);
            if(!$rows)fail(404,'Archivtermin nicht gefunden');
            $r=$rows[0];$date=$r['datum'];
            if(routineIso($date)!==$date||!is_array($r['teilnehmer']))fail(409,'Archiv enthält ungültige Termindaten');
            foreach($plan['tage'] as $day)if(routineIso($day)===$date)fail(409,'Der Termin ist bereits wieder aktiv');
            if(count($plan['tage'])>=52)fail(409,'Maximal 52 aktive Routinetermine');
            $position=count($plan['tage']);
            foreach($plan['tage'] as $i=>$day)if(routineIso($day)>$date){$position=$i;break;}
            $byNumber=[];
            foreach($r['teilnehmer'] as $p)if(isset($p['nr']))
                $byNumber[(int)$p['nr']]=$p['anwesend']===null?null:($p['anwesend']===true);
            array_splice($plan['tage'],$position,0,[routineGerman($date)]);
            foreach($plan['personen'] as &$p){
                $n=(int)$p['nr'];
                array_splice($p['anwesend'],$position,0,[array_key_exists($n,$byNumber)?$byNumber[$n]:null]);
            }unset($p);
            $stmt=db()->prepare('UPDATE routine SET tage=?,personen=? WHERE id=? AND row_revision=?');
            $stmt->execute([
                json_encode($plan['tage'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                json_encode($plan['personen'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
                $id,$plan['row_revision']
            ]);
            if($stmt->rowCount()!==1)versionConflict();
            sql('DELETE FROM routine_archiv WHERE id=? AND routine_id=?',[$archiveId,$id]);
            auditAction($u,'Routine '.$id.': Archivtermin '.routineGerman($date).' wiederhergestellt');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'datum'=>$date]);
    }
    return false;
}
