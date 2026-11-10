<?php
declare(strict_types=1);
namespace IDV;

function rpString(mixed $value,int $max,string $field,bool $required=false): string {
    if(!is_string($value))fail(400,$field.' muss Text sein');
    $value=trim($value);
    if(strlen($value)>$max||($required&&$value===''))fail(400,$field.' fehlt oder ist zu lang');
    return $value;
}
function rpCalendarDate(mixed $value,string $field): ?string {
    if($value===null||$value==='')return null;
    if(!is_string($value)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$value))fail(400,$field.': ungültiges Datum');
    $date=\DateTimeImmutable::createFromFormat('!Y-m-d',$value,new \DateTimeZone('UTC'));
    if(!$date||$date->format('Y-m-d')!==$value)fail(400,$field.': ungültiges Datum');
    return $value;
}
function anniversaries(string $kind): array {
    $column=$kind==='geb'?'geburtsdatum':'eintrittsdatum';
    $people=sql('SELECT personalnummer,vorname,nachname,dienstgrad,'.$column.
        " AS ereignis FROM personal WHERE (status IS NULL OR status<>'Gekündigt') AND ".$column.
        ' IS NOT NULL ORDER BY personalnummer');
    $today=new \DateTimeImmutable('today',new \DateTimeZone('Europe/Berlin'));
    $year=(int)$today->format('Y');$out=[];
    foreach($people as $p){
        $raw=(string)$p['ereignis'];
        if(!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$raw,$m))continue;
        $first=\DateTimeImmutable::createFromFormat('!Y-m-d',$raw,new \DateTimeZone('Europe/Berlin'));
        if(!$first)continue;
        $next=new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $year,(int)$m[2],(int)$m[3]),new \DateTimeZone('Europe/Berlin'));
        if($next<$today)$next=$next->modify('+1 year');
        $days=(int)$today->diff($next)->days;
        $age=(int)$next->format('Y')-(int)$m[1];
        if($days>60||($kind==='jub'&&$age<1))continue;
        $out[]=['personalnummer'=>(int)$p['personalnummer'],
            'name'=>trim(($p['vorname']??'').' '.($p['nachname']??'')),
            'dienstgrad'=>$p['dienstgrad']??'','datum'=>$raw,'jahre'=>$age,'tage'=>$days];
    }
    usort($out,fn($a,$b)=>$a['tage']<=>$b['tage']?:strcmp($a['name'],$b['name']));
    return $out;
}
function dispatchReferenceLists(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/geburtstage'){needRight($u,'geb');respond(200,anniversaries('geb'));}
    if($method==='GET'&&$uri==='/api/dienstjubilaeen'){needRight($u,'jub');respond(200,anniversaries('jub'));}
    if($method==='GET'&&$uri==='/api/rechtesimulator'){
        needRight($u,'rechtesimulator');
        respond(200,sql('SELECT id,anzeigename,dienstnummer,rolle,gesperrt FROM users ORDER BY anzeigename'));
    }
    if($method==='GET'&&preg_match('#^/api/rechtesimulator/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'rechtesimulator');$rows=sql('SELECT id,anzeigename,dienstnummer,rolle,gesperrt FROM users WHERE id=?',[cleanId($m[1])]);
        if(!$rows)fail(404,'Konto nicht gefunden');
        respond(200,['user'=>$rows[0],'rechte'=>rights($rows[0])]);
    }
    if($method==='GET'&&$uri==='/api/personalentwicklung'){
        needRight($u,'pers');
        $entry=sql("SELECT DATE_FORMAT(eintrittsdatum,'%Y-%m') AS monat,COUNT(*) AS anzahl FROM personal
            WHERE eintrittsdatum IS NOT NULL AND eintrittsdatum<=UTC_DATE() GROUP BY 1 ORDER BY 1");
        $logs=sql("SELECT DATE_FORMAT(zeit,'%Y-%m') AS monat,COUNT(*) AS anzahl FROM log
            WHERE art='edit' AND LOWER(aktion) LIKE 'personal % gekündigt%' GROUP BY 1 ORDER BY 1");
        $terminations=sql("SELECT DATE_FORMAT(kuendigungsdatum,'%Y-%m') AS monat,COUNT(*) AS anzahl
            FROM kuendigungen WHERE kuendigungsdatum IS NOT NULL GROUP BY 1 ORDER BY 1");
        $unknown=sql('SELECT COUNT(*) AS anzahl FROM kuendigungen WHERE kuendigungsdatum IS NULL');
        respond(200,['eintritte'=>$entry,'austritteProtokoll'=>$logs,'kuendigungen'=>$terminations,
            'kuendigungenOhneDatum'=>(int)$unknown[0]['anzahl'],
            'hinweis'=>'Eintritte und datierte Kündigungen stammen aus gespeicherten Vorgängen. Ältere Kündigungen ohne belegtes Datum werden nicht einem Monat zugeordnet.']);
    }
    if($uri==='/api/sperrfristen'){
        if($method==='GET'){needRight($u,'sperr');respond(200,sql(
            'SELECT id,vorname,nachname,art,grund,von,bis,bemerkung FROM sperrfristen ORDER BY erstellt DESC,id DESC'));}
        if($method==='POST'){
            needRight($u,'sperr',2);$b=body();
            $first=rpString($b['vorname']??null,120,'Vorname');
            $last=rpString($b['nachname']??null,120,'Nachname',true);
            $type=rpString($b['art']??null,30,'Art',true);
            if(!in_array($type,['Bewerber','Praktikant'],true))fail(400,'Ungültige Sperrfrist-Art');
            $reason=rpString($b['grund']??null,1500,'Grund');
            $note=rpString($b['bemerkung']??null,2000,'Bemerkung');
            $start=rpCalendarDate($b['von']??null,'Gültig von');$end=rpCalendarDate($b['bis']??null,'Gültig bis');
            if($start&&$end&&$end<$start)fail(400,'Enddatum liegt vor dem Beginn');
            sql('INSERT INTO sperrfristen(vorname,nachname,art,grund,von,bis,bemerkung) VALUES(?,?,?,?,?,?,?)',
                [$first,$last,$type,$reason,$start,$end,$note]);
            $id=(int)db()->lastInsertId();auditAction($u,'Sperrfrist angelegt: '.$first.' '.$last,'add');
            respond(201,['ok'=>true,'id'=>$id]);
        }
    }
    if($method==='DELETE'&&preg_match('#^/api/sperrfristen/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'sperr',2);$id=cleanId($m[1]);
        db()->beginTransaction();
        try{
            $old=sql('SELECT vorname,nachname FROM sperrfristen WHERE id=? FOR UPDATE',[$id]);
            if(!$old)fail(404,'Sperrfrist nicht gefunden');
            sql('DELETE FROM sperrfristen WHERE id=?',[$id]);
            auditAction($u,'Sperrfrist gelöscht: '.$old[0]['vorname'].' '.$old[0]['nachname'],'del');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if($uri==='/api/blacklist'){
        if($method==='GET'){needRight($u,'bl');respond(200,sql(
            'SELECT id,personalnummer,vorname,nachname,datum,ablauf,handy,bemerkung FROM blacklist ORDER BY erstellt DESC,id DESC'));}
        if($method==='POST'){
            needRight($u,'bl',2);$b=body();
            $number=rpString($b['personalnummer']??null,30,'Personalnummer');
            $first=rpString($b['vorname']??null,120,'Vorname',true);
            $last=rpString($b['nachname']??null,120,'Nachname',true);
            $date=rpCalendarDate($b['datum']??null,'Datum');$expiry=rpCalendarDate($b['ablauf']??null,'Ablauf');
            if($date&&$expiry&&$expiry<$date)fail(400,'Ablauf liegt vor dem Eintragungsdatum');
            $mobile=rpString($b['handy']??null,150,'Handy');$note=rpString($b['bemerkung']??null,2000,'Bemerkung');
            sql('INSERT INTO blacklist(personalnummer,vorname,nachname,datum,ablauf,handy,bemerkung) VALUES(?,?,?,?,?,?,?)',
                [$number,$first,$last,$date,$expiry,$mobile,$note]);
            $id=(int)db()->lastInsertId();auditAction($u,'Blacklist-Eintrag angelegt: '.$first.' '.$last,'add');
            respond(201,['ok'=>true,'id'=>$id]);
        }
    }
    if($method==='DELETE'&&preg_match('#^/api/blacklist/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'bl',2);$id=cleanId($m[1]);
        db()->beginTransaction();
        try{
            $old=sql('SELECT vorname,nachname FROM blacklist WHERE id=? FOR UPDATE',[$id]);
            if(!$old)fail(404,'Blacklist-Eintrag nicht gefunden');
            sql('DELETE FROM blacklist WHERE id=?',[$id]);
            auditAction($u,'Blacklist-Eintrag gelöscht: '.$old[0]['vorname'].' '.$old[0]['nachname'],'del');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    return false;
}
