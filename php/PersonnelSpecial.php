<?php
declare(strict_types=1);
namespace IDV;

function lockedJsonRecord(string $table,int $nr,string $revision): ?array {
    if(!in_array($table,['sonderfunktionen','disziplin'],true))
        throw new \LogicException('Invalid record type');
    $rows=sql('SELECT * FROM '.$table.' WHERE personalnummer=? FOR UPDATE',[$nr]);
    $current=(string)($rows[0]['row_revision']??'0');
    if($current!==$revision)versionConflict();
    return $rows[0]??null;
}
function dispatchPersonnelSpecial(array $u,string $method,string $uri): bool {
    if($method==='POST'&&$uri==='/api/funktion'){
        needRight($u,'sonder',2);$revision=expectedRevision();$b=body();
        $nr=filter_var($b['nr']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if(!$nr||!is_string($b['funktion']??null)||!is_bool($b['wert']??null))
            fail(400,'Ungültige Sonderfunktion');
        $function=$b['funktion'];
        if(!in_array($function,array_column(sql('SELECT name FROM sonderfunktionsspalten'),'name'),true))
            fail(400,'Unbekannte Sonderfunktion');
        db()->beginTransaction();
        try {
            $old=lockedJsonRecord('sonderfunktionen',$nr,$revision);
            if(!$old)versionConflict();
            $flags=json_decode((string)$old['werte'],true,64,JSON_THROW_ON_ERROR);
            if(!is_array($flags))fail(409,'Ungültige Sonderfunktionszuordnung');
            $flags[$function]=$b['wert'];
            $stmt=db()->prepare('UPDATE sonderfunktionen SET werte=?,aktualisiert=UTC_TIMESTAMP(6)
                WHERE personalnummer=? AND row_revision=?');
            $stmt->execute([json_encode($flags,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$nr,$revision]);
            if($stmt->rowCount()!==1)versionConflict();
            $new=(string)sql('SELECT row_revision FROM sonderfunktionen WHERE personalnummer=?',[$nr])[0]['row_revision'];
            auditAction($u,($b['wert']?'Zugewiesen':'Entzogen').': '.$function.' bei '.$nr,'add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'werte'=>$flags,'_revision'=>$new]);
    }
    if($method==='PATCH'&&preg_match('#^/api/sonder/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'sonder',2);$nr=cleanId($m[1]);$revision=expectedRevision();$b=body();
        $flags=$b['werte']??null;
        if(!is_array($flags)||array_is_list($flags)&&$flags!==[])fail(400,'Ungültige Zuordnung');
        $allowed=array_column(sql('SELECT name FROM sonderfunktionsspalten'),'name');
        foreach($flags as $k=>$v)if(!in_array($k,$allowed,true)||!is_bool($v))fail(400,'Ungültige Fortbildung');
        $lead=trim((string)($b['leitung']??''));$extra=trim((string)($b['sonstige']??''));
        if(strlen($lead)>500||strlen($extra)>500)fail(400,'Text zu lang');
        db()->beginTransaction();
        try{
            $old=lockedJsonRecord('sonderfunktionen',$nr,$revision);
            if(!sql('SELECT 1 FROM personal WHERE personalnummer=?',[$nr]))
                fail(404,'Personalakte nicht gefunden');
            $json=json_encode($flags,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
            if($old) {
                $stmt=db()->prepare('UPDATE sonderfunktionen SET leitung=?,sonstige=?,werte=?,aktualisiert=UTC_TIMESTAMP(6)
                    WHERE personalnummer=? AND row_revision=?');
                $stmt->execute([$lead,$extra,$json,$nr,$revision]);
                if($stmt->rowCount()!==1)versionConflict();
            } else sql('INSERT INTO sonderfunktionen(personalnummer,leitung,sonstige,werte) VALUES(?,?,?,?)',
                     [$nr,$lead,$extra,$json]);
            $new=(string)sql('SELECT row_revision FROM sonderfunktionen WHERE personalnummer=?',[$nr])[0]['row_revision'];
            auditAction($u,'Fortbildungen/Funktionen von '.$nr.' geändert');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'personalnummer'=>$nr,'_revision'=>$new]);
    }
    if($method==='PATCH'&&preg_match('#^/api/disziplin/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'dis',2);$nr=cleanId($m[1]);$revision=expectedRevision();$b=body();
        $slots=$b['slots']??null;$note=$b['bemerkung']??null;
        if(!is_array($slots)||count($slots)!==6||!array_is_list($slots))
            fail(400,'Genau sechs Maßnahmenslots erforderlich');
        if(!is_string($note)||strlen($note)>4000)fail(400,'Bemerkung zu lang');
        $clean=[];
        foreach($slots as $slot){
            if($slot===null){$clean[]=null;continue;}
            if(!is_array($slot)||array_is_list($slot)&&$slot!==[]||
               array_diff(array_keys($slot),['done','t','u','d'])||
               !is_bool($slot['done']??null)||!is_string($slot['t']??null)||
               !is_string($slot['u']??null)||!is_string($slot['d']??null))
               fail(400,'Ungültiges Maßnahmenformat');
            if(strlen($slot['t'])>1500||strlen($slot['u'])>2000||strlen($slot['d'])>10)
                fail(400,'Maßnahmendaten zu lang');
            if($slot['u']!==''&&!preg_match('#^https://\S+$#iD',$slot['u']))
                fail(400,'Dokumentenlink muss mit https:// beginnen');
            if($slot['d']!==''&&!rpCalendarDate($slot['d'],'Maßnahmendatum'))
                fail(400,'Ungültiges Maßnahmendatum');
            $clean[]=['done'=>$slot['done'],'t'=>$slot['t'],'u'=>$slot['u'],'d'=>$slot['d']];
        }
        db()->beginTransaction();
        try{
            $old=lockedJsonRecord('disziplin',$nr,$revision);
            if(!sql('SELECT 1 FROM personal WHERE personalnummer=?',[$nr]))
                fail(404,'Personalakte nicht gefunden');
            $json=json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
            if($old){
                $stmt=db()->prepare('UPDATE disziplin SET slots=?,bemerkung=?,aktualisiert=UTC_TIMESTAMP(6)
                     WHERE personalnummer=? AND row_revision=?');
                $stmt->execute([$json,$note,$nr,$revision]);
                if($stmt->rowCount()!==1)versionConflict();
            }else sql('INSERT INTO disziplin(personalnummer,slots,bemerkung) VALUES(?,?,?)',[$nr,$json,$note]);
            $next=(string)sql('SELECT row_revision FROM disziplin WHERE personalnummer=?',[$nr])[0]['row_revision'];
            auditAction($u,'Disziplinarakte bei Personalnummer '.$nr.' geändert');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'_revision'=>$next]);
    }
    return false;
}
