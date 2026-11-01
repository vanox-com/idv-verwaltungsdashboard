<?php
declare(strict_types=1);
namespace IDV;

use PDO;
use Throwable;

/* MySQL 8 implementation of POST /api/routine/:id/termin.
 * Uses InnoDB row locking and an explicit row_revision trigger.
 * There is no ability to bypass server-side permissions via the UI.
 */
function handleRoutineDate(array $user,int $id): never {
    $permissions=rights($user);
    $level=(int)($permissions['rout']??0);
    if($level<2 && !($user['rolle']==='Polizeirat'&&$level>=1))
        fail(403,'Keine Berechtigung zum Anlegen von Routineterminen');
    if($id<=0)fail(400,'Ungültige Routine');
    $body=body();
    $date=(string)($body['datum']??'');
    $dt=\DateTimeImmutable::createFromFormat('!Y-m-d',$date,new \DateTimeZone('UTC'));
    if(!$dt||$dt->format('Y-m-d')!==$date)fail(400,'Ungültiges Termindatum');
    $revision=(string)($_SERVER['HTTP_IF_MATCH']??'');
    if(!preg_match('/^[1-9][0-9]*$/D',$revision))fail(428,'Der Datensatz muss mit seiner Revision gespeichert werden');

    $pdo=db();
    $pdo->beginTransaction();
    try{
        $stmt=$pdo->prepare('SELECT id,tage,personen,row_revision FROM routine WHERE id=? FOR UPDATE');
        $stmt->execute([$id]);
        $r=$stmt->fetch(PDO::FETCH_ASSOC);
        if(!$r){
            $pdo->rollBack();
            fail(404,'Routine nicht gefunden');
        }
        if((string)$r['row_revision']!==$revision){
            $pdo->rollBack();
            fail(409,'Speicherkonflikt: Bitte den aktuellen Routineplan laden');
        }
        $tage=json_decode((string)$r['tage'],true);
        $personen=json_decode((string)$r['personen'],true);
        if(!is_array($tage)||!array_is_list($tage)||!is_array($personen)||!array_is_list($personen)){
            $pdo->rollBack();
            fail(409,'Routine enthält ungültige Anwesenheitsdaten');
        }
        if(count($tage)>=52){$pdo->rollBack();fail(409,'Maximal 52 Routinetermine');}
        $iso=function(string $s): ?string {
            if(preg_match('/^\d{4}-\d{2}-\d{2}$/D',$s))return $s;
            if(preg_match('/^(\d{2})\.(\d{2})\.(\d{4})$/D',$s,$m))return $m[3].'-'.$m[2].'-'.$m[1];
            return null;
        };
        $position=count($tage);
        foreach($tage as $idx=>$day){
            if(!is_string($day)||$iso($day)===null){$pdo->rollBack();fail(409,'Vorhandenes Termindatum ist ungültig');}
            if($iso($day)===$date){$pdo->rollBack();fail(409,'Termin existiert bereits');}
            if($iso($day)>$date){$position=$idx;break;}
        }
        $found=$pdo->prepare('SELECT id FROM routine_archiv WHERE routine_id=? AND datum=? LIMIT 1');
        $found->execute([$id,$date]);
        if($found->fetch()){
            $pdo->rollBack();
            fail(409,'Termin liegt bereits im Archiv. Bitte dort wiederherstellen.');
        }
        $oldSize=count($tage);
        foreach($personen as &$person){
            if(!is_array($person)||!isset($person['nr'])||
               !isset($person['anwesend'])||!is_array($person['anwesend'])||
               count($person['anwesend'])!==$oldSize){
                unset($person);$pdo->rollBack();
                fail(409,'Anwesenheitsliste ist nicht synchron mit den Terminen');
            }
            array_splice($person['anwesend'],$position,0,[false]);
        }
        unset($person);
        $german=substr($date,8,2).'.'.substr($date,5,2).'.'.substr($date,0,4);
        array_splice($tage,$position,0,[$german]);
        $stmt=$pdo->prepare('UPDATE routine SET tage=?,personen=? WHERE id=? AND row_revision=?');
        $stmt->execute([
            json_encode($tage,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),
            json_encode($personen,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),
            $id,$revision
        ]);
        if($stmt->rowCount()!==1){$pdo->rollBack();fail(409,'Speicherkonflikt: Plan erneut laden');}
        $newRevision=$pdo->prepare('SELECT row_revision FROM routine WHERE id=?');
        $newRevision->execute([$id]);
        $rev=(string)$newRevision->fetchColumn();
        $stmt=$pdo->prepare("INSERT INTO log (user_id,aktion,art) VALUES (?,?,'edit')");
        $stmt->execute([$user['id'],'Routine '.$id.': Termin '.$german.' angelegt']);
        $pdo->commit();
        respond(200,['ok'=>true,'_revision'=>$rev]);
    }catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack();
        throw $e;
    }
}
