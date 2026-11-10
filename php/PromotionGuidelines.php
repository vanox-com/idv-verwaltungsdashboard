<?php
declare(strict_types=1);
namespace IDV;

/** Three training examinations have strict promotion prerequisites. */
function examForRank(string $rank): ?array {
    return match($rank) {
        'Polizeimeisteranwärter'=>['code'=>'PM','ziel'=>'Polizeimeister'],
        'Polizeikommissaranwärter'=>['code'=>'PK','ziel'=>'Polizeikommissar'],
        'Kriminalkommissaranwärter'=>['code'=>'KK','ziel'=>'Kriminalkommissar'],
        default=>null
    };
}
function dispatchPromotionGuidelines(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/befricht'){
        needRight($u,'befricht');
        respond(200,sql('SELECT name,abk,tage,bemerkung,grund,sortierung,naechster_rang
                         FROM raenge ORDER BY sortierung,name'));
    }
    if($method==='PATCH'&&preg_match('#^/api/bef/pruefung/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'bef',2);$nr=cleanId($m[1]);$b=body();
        if(!is_bool($b['bestanden']??null))fail(400,'Ungültiger Prüfungsstatus');
        db()->beginTransaction();
        try {
            $p=sql('SELECT dienstgrad FROM personal WHERE personalnummer=? FOR UPDATE',[$nr]);
            if(!$p)fail(404,'Personalakte nicht gefunden');
            $exam=examForRank((string)$p[0]['dienstgrad']);
            if(!$exam)fail(409,'Prüfungsstatus nur für PM-, PK- und KK-Anwärter änderbar');
            $before=normalizedRows('SELECT werte FROM sonderfunktionen WHERE personalnummer=? FOR UPDATE',[$nr],['werte']);
            $flags=$before[0]['werte']??[];
            $flags[$exam['code']]=$b['bestanden'];
            sql("INSERT INTO sonderfunktionen(personalnummer,leitung,sonstige,werte)
                 VALUES(?,'','',?)
                 ON DUPLICATE KEY UPDATE werte=VALUES(werte),aktualisiert=UTC_TIMESTAMP(6)",
                [$nr,json_encode($flags,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
            auditAction($u,$exam['code'].'-Prüfung bei Nr. '.$nr.': '.($b['bestanden']?'bestanden':'notwendig'));
            db()->commit();
        } catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'personalnummer'=>$nr,'bestanden'=>$b['bestanden'],'pruefung'=>$exam['code']]);
    }
    if($method==='PATCH'&&preg_match('#^/api/befricht/([^/]+)$#D',$uri,$m)){
        needRight($u,'befricht',2);
        $rank=rawurldecode($m[1]);$b=body();$days=$b['tage']??null;
        if($rank===''||strlen($rank)>120)fail(400,'Ungültiger Dienstgrad');
        if($days!==null&&(!is_int($days)||$days<1||$days>3650))
            fail(400,'Wartezeit muss eine ganze Zahl zwischen 1 und 3650 Tagen sein oder leer bleiben');
        if(!is_string($b['bemerkung']??null)||!is_string($b['grund']??null)||
            strlen($b['bemerkung'])>1500||strlen($b['grund'])>500)
            fail(400,'Ungültige Bemerkung oder Begründung');
        db()->beginTransaction();
        try{
            $existing=sql('SELECT name,naechster_rang FROM raenge WHERE name=? FOR UPDATE',[$rank]);
            if(!$existing)fail(404,'Dienstgrad nicht gefunden');
            if(examForRank($rank)!==null&&$days!==null)
                fail(400,'Anwärter haben keine Mindestwartezeit; entscheidend ist die bestandene Prüfung');
            if(empty($existing[0]['naechster_rang'])&&$days!==null)
                fail(400,'Ein Enddienstgrad ohne Folgerang kann keine Beförderungsfrist haben');
            sql('UPDATE raenge SET tage=?,bemerkung=?,grund=? WHERE name=?',
                [$days,trim($b['bemerkung']),trim($b['grund']),$rank]);
            $row=sql('SELECT name,tage,bemerkung,grund,naechster_rang FROM raenge WHERE name=?',[$rank])[0];
            auditAction($u,'Beförderungsrichtlinie geändert: '.$rank.' ('.($days===null?'keine Frist':$days.' Tage').')');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'regel'=>$row]);
    }
    return false;
}
