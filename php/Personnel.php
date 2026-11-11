<?php
declare(strict_types=1);
namespace IDV;

function dnEmployment(int $n): string { return $n>=50&&$n<=60?'Nebenberuf':'Hauptberuf'; }
function personnelStatusAllowed(mixed $value,bool $creating=false): bool {
    return is_string($value) &&
      in_array($value,['Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten'],true) &&
      (!$creating||$value!=='Gekündigt');
}

function dnOccupied(string $s): bool {
    return in_array(strtolower(trim($s)),['aktiv','abgemeldet','inaktiv','suspendiert','gekündigt'],true);
}
function sensitiveFields(array $u,array $fields): void {
    $confidential=['geburtsdatum','handy','arbeitsvertrag','ernennungsurkunde',
        'arbeitsvertrag_url','ernennungsurkunde_url','urlaub_von','urlaub_bis','urlaub_tage','bemerkung','rsa','waffenschein','spind'];
    if(!array_intersect(array_keys($fields),$confidential))return;
    $rows=sql('SELECT sensibel FROM roles WHERE name=?',[$u['rolle']]);
    if((int)($rows[0]['sensibel']??0)!==1)fail(403,'Kein Recht für vertrauliche Personalfelder');
}
function personnelLinks(array &$b): void {
    foreach(['arbeitsvertrag_url','ernennungsurkunde_url'] as $key) {
        if(!array_key_exists($key,$b))continue;
        if(!is_string($b[$key])||strlen($b[$key])>2048)fail(400,'Ungültiger Dokumentenlink');
        $url=trim($b[$key]);
        if($url!==''){
            $parts=parse_url($url);
            if(!is_array($parts)||($parts['scheme']??null)!=='https'||
                !str_contains((string)($parts['host']??''),'.')||isset($parts['user'])||
                isset($parts['pass'])||preg_match('/\s/',$url))
                fail(400,'Bitte einen gültigen HTTPS-Dokumentenlink eingeben');
        }
        $b[$key]=$url;
    }
}
function termMatches(array $p): array {
    $nr=(int)$p['personalnummer'];$entry=$p['eintrittsdatum']??null;
    return sql("SELECT k.id FROM kuendigungen k WHERE k.personalnummer=?
        AND LOWER(TRIM(COALESCE(k.vorname,'')))=LOWER(?)
        AND LOWER(TRIM(COALESCE(k.nachname,'')))=LOWER(?)
        AND (k.eintritt <=> ? OR (k.eintritt IS NULL AND ? IS NOT NULL AND k.erfasst_am>=?))
        AND (NOT EXISTS(SELECT 1 FROM personalnummer_neubelegungen a WHERE a.personalnummer=?)
          OR k.erfasst_am>=(SELECT MAX(a.zeit) FROM personalnummer_neubelegungen a WHERE a.personalnummer=?))
        ORDER BY k.id DESC",
        [$nr,trim((string)$p['vorname']),trim((string)$p['nachname']),$entry,$entry,$entry,$nr,$nr]);
}
function termDoc(string $title,?string $url): string {
    return $url?json_encode(['t'=>$title?:'Dokument','u'=>$url],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE):$title;
}
function addTermination(array $p,string $reason): int {
    // This is performed inside the same row-locked transaction as the status change.
    $nr=(int)$p['personalnummer'];
    $docs=sql('SELECT typ,titel,url,erstellt FROM generierte_dokumente WHERE personalnummer=? ORDER BY erstellt DESC',[$nr]);
    unset($p['row_revision']);
    $snapshot=json_encode([
        'quelle'=>'bei_erstellung','gesichert_am'=>gmdate('Y-m-d\TH:i:s\Z'),
        'personal'=>$p,'generierte_dokumente'=>$docs
    ],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    sql('INSERT INTO kuendigungen(personalnummer,vorname,nachname,rang,grund,handy,vertrag,eintritt,urkunde,personal_snapshot)
         VALUES(?,?,?,?,?,?,?,?,?,?)',[
        $nr,$p['vorname'],$p['nachname'],$p['dienstgrad'],$reason,$p['handy']??null,
        termDoc((string)($p['arbeitsvertrag']??''),$p['arbeitsvertrag_url']??null),
        $p['eintrittsdatum']??null,
        termDoc((string)($p['ernennungsurkunde']??''),$p['ernennungsurkunde_url']??null),$snapshot
    ]);
    return (int)db()->lastInsertId();
}
function archivePreviousNumber(int $nr,array $old,int $actor): void {
    $follow=[];
    foreach(['sonderfunktionen','disziplin','copnet_zugaenge','personal_fristen',
        'personal_rangantraege','generierte_dokumente','befoerderungen','personal_audit'] as $table)
        $follow[$table]=sql('SELECT * FROM '.$table.' WHERE personalnummer=? FOR UPDATE',[$nr]);
    $follow['routine']=[];
    foreach(sql('SELECT id,tage,personen FROM routine FOR UPDATE') as $r){
        $all=json_decode((string)$r['personen'],true,64,JSON_THROW_ON_ERROR);
        if(!is_array($all))continue;
        $prior=array_values(array_filter($all,fn($x)=>is_array($x)&&(int)($x['nr']??-1)===$nr));
        if(!$prior)continue;
        $follow['routine'][]=['id'=>$r['id'],'tage'=>json_decode((string)$r['tage'],true),'teilnehmer'=>$prior];
        $next=array_values(array_filter($all,fn($x)=>!is_array($x)||(int)($x['nr']??-1)!==$nr));
        sql('UPDATE routine SET personen=? WHERE id=?',[json_encode($next,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$r['id']]);
    }
    unset($old['row_revision']);
    sql('INSERT INTO personalnummer_neubelegungen(personalnummer,vergeben_von,vorher,folgedaten) VALUES(?,?,?,?)',[
        $nr,$actor,json_encode($old,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
        json_encode($follow,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)
    ]);
    foreach(['sonderfunktionen','disziplin','copnet_zugaenge','personal_fristen',
        'personal_rangantraege','personal_audit'] as $table)
        sql('DELETE FROM '.$table.' WHERE personalnummer=?',[$nr]);
    sql('UPDATE generierte_dokumente SET personalnummer=NULL WHERE personalnummer=?',[$nr]);
    sql('UPDATE befoerderungen SET personalnummer=NULL WHERE personalnummer=?',[$nr]);
}
function dispatchPersonnel(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/personal/freie-nummern'){
        needRight($u,'pers',2);
        $people=[];foreach(sql('SELECT personalnummer,status,administrativ_geloescht_am FROM personal WHERE personalnummer BETWEEN 1 AND 60') as $r)
            $people[(int)$r['personalnummer']]=$r;
        $logins=[];foreach(sql("SELECT CAST(dienstnummer AS UNSIGNED) AS nr FROM users WHERE dienstnummer REGEXP '^[0-9]{1,8}$' AND CAST(dienstnummer AS UNSIGNED) BETWEEN 1 AND 60") as $r)
            $logins[(int)$r['nr']]=true;
        $terminations=[];foreach(sql("SELECT DISTINCT k.personalnummer FROM kuendigungen k WHERE k.personalnummer BETWEEN 1 AND 60
          AND (NOT EXISTS(SELECT 1 FROM personalnummer_neubelegungen a WHERE a.personalnummer=k.personalnummer)
               OR k.erfasst_am>=(SELECT MAX(a.zeit) FROM personalnummer_neubelegungen a WHERE a.personalnummer=k.personalnummer))") as $r)
            $terminations[(int)$r['personalnummer']]=true;
        $main=[];$side=[];
        for($n=1;$n<=60;$n++){
            if(isset($logins[$n]))continue;
            $p=$people[$n]??null;
            $free=!$p||$p['administrativ_geloescht_am']!==null||
                !dnOccupied((string)$p['status']);
            if($free){if($n<50)$main[]=$n;else $side[]=$n;}
        }
        respond(200,['hauptberuf'=>$main,'nebenberuf'=>$side]);
    }
    if($method==='GET'&&$uri==='/api/personalstatistik'){
        needRight($u,'pers');
        $groups=sql("SELECT COALESCE(NULLIF(gruppe,''),'Nicht zugeordnet') AS gruppe,beschaeftigungsart,status,COUNT(*) AS anzahl FROM personal GROUP BY 1,2,3");
        $months=sql("SELECT DATE_FORMAT(eintrittsdatum,'%Y-%m') AS monat,COUNT(*) AS anzahl FROM personal
          WHERE eintrittsdatum>=DATE_SUB(UTC_DATE(),INTERVAL 12 MONTH) GROUP BY 1 ORDER BY 1");
        respond(200,['gruppen'=>$groups,'eintritte'=>$months]);
    }
    if($method==='POST'&&$uri==='/api/personal'){
        needRight($u,'pers',2);$b=body();sensitiveFields($u,$b);personnelLinks($b);
        $n=filter_var($b['personalnummer']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($n===false||$n===null)fail(400,'Ungültige Personalnummer');
        if(isset($b['beschaeftigungsart'])&&$b['beschaeftigungsart']!==dnEmployment($n))fail(400,'Beschäftigungsart passt nicht zur Dienstnummer');
        if(trim((string)($b['vorname']??''))===''||trim((string)($b['nachname']??''))==='')fail(400,'Vor- und Nachname nötig');
        if(array_key_exists('status',$b)&&!personnelStatusAllowed($b['status'],true))
            fail(400,'Ungültiger Personalstatus – Beschäftigungsart und Status sind verschiedene Felder');
        if(($b['status']??'')==='Gekündigt')fail(400,'Bitte zuerst die Personalakte anlegen und anschließend kündigen');
        db()->beginTransaction();
        try{
            $previous=sql('SELECT * FROM personal WHERE personalnummer=? FOR UPDATE',[$n]);
            if($previous){
                $p=$previous[0];
                if($p['administrativ_geloescht_am']===null&&dnOccupied((string)$p['status']))fail(409,'Diese Dienstnummer ist durch ihren Personalstatus belegt.');
                if($p['administrativ_geloescht_am']===null&&$p['status']==='Gekündigt'&&!termMatches($p))
                    fail(409,'Die Kündigung muss zuerst in die Kündigungsverwaltung übernommen werden.');
            }
            if(sql("SELECT 1 FROM users WHERE dienstnummer REGEXP '^[0-9]{1,8}$' AND CAST(dienstnummer AS UNSIGNED)=? LIMIT 1",[$n]))
                fail(409,'Zu dieser Dienstnummer existiert bereits ein Benutzerzugang.');
            if($previous)archivePreviousNumber($n,$previous[0],(int)$u['id']);
            $fields=['personalnummer','gruppe','beschaeftigungsart','status','vorname','nachname','geburtsdatum',
              'handy','waffenschein','spind','nebenjob','dienstgrad','eintrittsdatum','arbeitsvertrag',
              'ernennungsurkunde','urlaub_von','urlaub_bis','urlaub_tage','bemerkung','rsa',
              'arbeitsvertrag_url','ernennungsurkunde_url'];
            $values=[];
            foreach($fields as $key){
                $v=match($key){
                    'personalnummer'=>$n,
                    'gruppe'=>$b['gruppe']??'Nicht zugeordnet',
                    'beschaeftigungsart'=>dnEmployment($n),
                    'status'=>$b['status']??'Aktiv',
                    'waffenschein','spind'=>!empty($b[$key])?1:0,
                    'arbeitsvertrag_url','ernennungsurkunde_url'=>$b[$key]??'',
                    default=>$b[$key]??null
                };
                $values[]=($v===''&&!in_array($key,['arbeitsvertrag_url','ernennungsurkunde_url'],true))?null:$v;
            }
            if($previous){
                $assignments=implode(',',array_map(fn($col)=>$col.'=VALUES('.$col.')',$fields));
                sql('INSERT INTO personal('.implode(',',$fields).') VALUES('.implode(',',array_fill(0,count($fields),'?')).')
                  ON DUPLICATE KEY UPDATE '.$assignments.",letzte_befoerderung=NULL,naechste_befoerderung=NULL,
                  por_status='offen',por_notiz='',por_am=NULL,administrativ_geloescht_am=NULL,administrativ_geloescht_von=NULL",$values);
            }else sql('INSERT INTO personal('.implode(',',$fields).') VALUES('.implode(',',array_fill(0,count($fields),'?')).')',$values);
            auditAction($u,'Personal '.$n.' angelegt'.($previous?' (Dienstnummer neu belegt)':''),'add');
            db()->commit();
        }catch(\PDOException $e){
            if(db()->inTransaction())db()->rollBack();
            if($e->getCode()==='23000' && (int)($e->errorInfo[1]??0)===1062)
                fail(409,'Dienstnummer inzwischen belegt. Bitte freie Nummern neu laden.');
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        $result=sql('SELECT personalnummer,vorname,nachname,gruppe,status,dienstgrad FROM personal WHERE personalnummer=?',[$n]);
        respond(200,$result[0]);
    }
    if($method==='POST'&&preg_match('#^/api/personal/([1-9][0-9]*)/kuendigung$#D',$uri,$m)){
        needRight($u,'pers');needRight($u,'kue',2);$n=cleanId($m[1]);$b=body();
        $reason=trim((string)($b['grund']??''));if(strlen($reason)>1000)fail(400,'Kündigungsgrund zu lang');
        db()->beginTransaction();
        try{
            $p=sql('SELECT * FROM personal WHERE personalnummer=? FOR UPDATE',[$n]);
            if(!$p)fail(404,'Personalakte nicht gefunden');
            if($p[0]['status']!=='Gekündigt')fail(409,'Die Person muss zuerst den Status „Gekündigt“ erhalten');
            $old=termMatches($p[0]);
            if(!$old&&$reason==='')fail(400,'Bitte einen Kündigungsgrund eingeben');
            $id=$old?(int)$old[0]['id']:addTermination($p[0],$reason);
            if(!$old)auditAction($u,'Gekündigte Personalakte '.$n.' in Kündigungen übernommen','add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond($old?200:201,['ok'=>true,'angelegt'=>!$old,'id'=>$id,'anzahl'=>$old?count($old):1]);
    }
    if($method==='PATCH'&&preg_match('#^/api/personal/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'pers',2);$n=cleanId($m[1]);$revision=expectedRevision();$b=body();
        if(array_key_exists('status',$b)&&!personnelStatusAllowed($b['status']))
            fail(400,'Ungültiger Personalstatus – Beschäftigungsart und Status sind verschiedene Felder');
        if(array_key_exists('dienstgrad',$b))fail(409,'Dienstgrad ausschließlich über die Beförderungsverwaltung ändern');
        sensitiveFields($u,$b);personnelLinks($b);
        if(isset($b['beschaeftigungsart'])&&$b['beschaeftigungsart']!==dnEmployment($n))fail(400,'Beschäftigungsart passt nicht zur Dienstnummer');
        if(isset($b['kuendigungsgrund'])&&(!is_string($b['kuendigungsgrund'])||strlen(trim($b['kuendigungsgrund']))>1000))
            fail(400,'Ungültiger Kündigungsgrund');
        $allowed=['vorname','nachname','geburtsdatum','handy','waffenschein','spind','nebenjob',
            'eintrittsdatum','arbeitsvertrag','ernennungsurkunde','arbeitsvertrag_url','ernennungsurkunde_url',
            'urlaub_von','urlaub_bis','urlaub_tage','bemerkung','rsa','status','gruppe','beschaeftigungsart'];
        $changes=array_intersect_key($b,array_flip($allowed));
        if(!$changes)fail(400,'Keine Felder übergeben');
        $rank=trim((string)($b['beantragter_rang']??''));$rankReason=trim((string)($b['rang_begruendung']??''));
        $rankDate=$b['rang_datum']??null;
        if(strlen($rank)>150||strlen($rankReason)>1000||($rankDate!==null&&!preg_match('/^\d{4}-\d{2}-\d{2}$/D',(string)$rankDate)))
            fail(400,'Ungültiger Rangänderungsantrag');
        db()->beginTransaction();
        try{
            $found=sql('SELECT * FROM personal WHERE personalnummer=? FOR UPDATE',[$n]);
            if(!$found)fail(404,'Personalakte nicht gefunden');
            $before=$found[0];if((string)$before['row_revision']!==$revision)versionConflict();
            $termination=isset($changes['status'])&&$changes['status']==='Gekündigt'&&$before['status']!=='Gekündigt';
            if($termination){
                needRight($u,'kue',2);
                if(trim((string)($b['kuendigungsgrund']??''))==='')fail(400,'Bitte einen Kündigungsgrund angeben');
            }
            if($rank!==''){
                if(!sql('SELECT 1 FROM raenge WHERE name=?',[$rank]))fail(400,'Gewählter Dienstgrad ist unbekannt');
                if(sql("SELECT 1 FROM personal_rangantraege WHERE personalnummer=? AND status='beantragt'",[$n]))
                    fail(409,'Für diese Personalakte besteht bereits ein offener Rangantrag');
            }
            $updates=[];$params=[];
            foreach($changes as $key=>$value){
                $updates[]=$key.'=?';
                $params[]=($value===''&&!in_array($key,['arbeitsvertrag_url','ernennungsurkunde_url'],true))?null:$value;
            }
            $params[]=$n;$params[]=$revision;
            $stmt=db()->prepare('UPDATE personal SET '.implode(',',$updates).' WHERE personalnummer=? AND row_revision=?');
            $stmt->execute($params);
            if($stmt->rowCount()!==1)versionConflict();
            $applied=sql('SELECT * FROM personal WHERE personalnummer=?',[$n])[0];
            if($rank!=='')
                sql('INSERT INTO personal_rangantraege(personalnummer,alter_rang,beantragter_rang,begruendung,antragsteller_id,korrigiertes_befoerderungsdatum) VALUES(?,?,?,?,?,?)',
                    [$n,$before['dienstgrad']??'',$rank,$rankReason,$u['id'],$rankDate]);
            $added=false;$oldTerm=false;
            if($termination){
                $oldTerm=(bool)termMatches($applied);
                if(!$oldTerm){
                    addTermination($applied,trim((string)$b['kuendigungsgrund']));$added=true;
                    auditAction($u,'Kündigung automatisch angelegt: '.$n.' '.$applied['vorname'].' '.$applied['nachname'],'add');
                }
            }
            $delta=[];
            foreach(['vorname','nachname','status','gruppe','beschaeftigungsart','nebenjob','eintrittsdatum'] as $key)
                if(array_key_exists($key,$changes)&&(string)($before[$key]??'')!==(string)($changes[$key]??''))
                    $delta[$key]=['alt'=>$before[$key]??null,'neu'=>$changes[$key]??null];
            if($delta)sql('INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES(?,?,?)',
                [$n,$u['id'],json_encode($delta,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
            auditAction($u,'Personal '.$n.' geändert'.($termination?' (Status: Gekündigt)':''));
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'rangantrag_angelegt'=>$rank!=='','kuendigung_angelegt'=>$added,'kuendigung_vorhanden'=>$oldTerm]);
    }
    return false;
}
