<?php
declare(strict_types=1);
namespace IDV;

require_once __DIR__.'/StatistikFilter.php';

function dnEmployment(int $n): string { return $n>=50&&$n<=60?'Nebenberuf':'Hauptberuf'; }
function personnelStatusAllowed(mixed $value,bool $creating=false): bool {
    return is_string($value) &&
      in_array($value,['Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten'],true) &&
      (!$creating||$value!=='Gekündigt');
}

function dnOccupied(string $s): bool {
    return in_array(strtolower(trim($s)),['aktiv','abgemeldet','inaktiv','suspendiert'],true);
}
/* Historische Beförderungen bleiben auch nach einer DN-Neubelegung der
   ursprünglichen Person zugeordnet (Snapshots statt aktueller Nummer). */
function personnelPromotionStats(): array {
    $staff=[];
    foreach(sql('SELECT personalnummer,vorname,nachname,eintrittsdatum FROM personal') as $p)
        $staff[(int)$p['personalnummer']]=$p;
    $archived=[];
    foreach(normalizedRows('SELECT id,vorher,folgedaten FROM personalnummer_neubelegungen',[],['vorher','folgedaten']) as $history){
        $old=$history['vorher']??[];
        foreach(($history['folgedaten']['befoerderungen']??[]) as $event)
            if(is_array($event)&&isset($event['id']))$archived[(int)$event['id']]=[
                'person'=>$old,'key'=>'archiv:'.$history['id']];
    }
    $valid=[];$total=0;$unassigned=0;$lastYear=0;
    $today=gmdate('Y-m-d');$yearAgo=gmdate('Y-m-d',strtotime('-12 months'));
    foreach(sql('SELECT id,personalnummer,vorname,nachname,rang,neu_rang,am FROM befoerderungen') as $event){
        if(statistikTestPerson($event))continue;
        $total++;
        $date=(string)($event['am']??'');
        $rank=trim((string)($event['rang']??''));$next=trim((string)($event['neu_rang']??''));
        $history=$archived[(int)$event['id']]??null;
        $p=$history['person']??($staff[(int)($event['personalnummer']??0)]??null);
        $key=$history['key']??('aktuell:'.(int)($event['personalnummer']??0));
        $matches=static fn($person)=>is_array($person)&&
            strtolower(trim((string)($person['vorname']??'')))===strtolower(trim((string)$event['vorname']))&&
            strtolower(trim((string)($person['nachname']??'')))===strtolower(trim((string)$event['nachname']));
        if(!$history&&(!$matches($p)||(string)($p['eintrittsdatum']??'')>$date)){$p=null;$key='';}
        $entered=(string)($p['eintrittsdatum']??'');
        if(!$matches($p)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)||
           !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$entered)||$date<$entered||$date>$today||
           $rank===''||$next===''||$rank===$next){$unassigned++;continue;}
        $days=(int)((strtotime($date.' UTC')-strtotime($entered.' UTC'))/86400);
        $valid[]=['person_key'=>$key,'rang'=>$rank,'neu_rang'=>$next,'tage'=>$days,'am'=>$date];
        if($date>=$yearAgo)$lastYear++;
    }
    usort($valid,fn($a,$b)=>strcmp($a['am'],$b['am']));
    return ['befoerderungen'=>$valid,'befoerderungen12m'=>$lastYear,
        'datenqualitaet'=>['gesamt'=>$total,'zugeordnet'=>count($valid),'nicht_zugeordnet'=>$unassigned]];
}
function personnelMovementStats(): array {
    $months=[];
    $start=new \DateTimeImmutable('first day of this month',new \DateTimeZone('UTC'));
    $start=$start->modify('-11 months');
    for($i=0;$i<12;$i++){
        $m=$start->modify('+'.$i.' months')->format('Y-m');
        $months[$m]=['monat'=>$m,'zugang'=>0,'abgang'=>0];
    }
    $today=gmdate('Y-m-d');$missingEntries=0;$missingExits=0;$withdrawn=0;$missingExitEntry=0;$durations=[];
    $people=sql('SELECT vorname,nachname,eintrittsdatum FROM personal');
    foreach(normalizedRows('SELECT vorher FROM personalnummer_neubelegungen',[],['vorher']) as $row)
        if(is_array($row['vorher']??null))$people[]=$row['vorher'];
    foreach($people as $p){
        if(statistikTestPerson($p))continue;
        $entry=(string)($p['eintrittsdatum']??'');
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$entry)||!checkdate((int)substr($entry,5,2),(int)substr($entry,8,2),(int)substr($entry,0,4))||$entry>$today){$missingEntries++;continue;}
        $m=substr($entry,0,7);if(isset($months[$m]))$months[$m]['zugang']++;
    }
    $used=[];
    foreach(normalizedRows('SELECT personalnummer,vorname,nachname,eintritt,kuendigungsdatum,personal_snapshot FROM kuendigungen',[],['personal_snapshot']) as $k){
        if(statistikTestPerson($k)||statistikTestPerson($k['personal_snapshot']['personal']??[]))continue;
        if(!empty($k['personal_snapshot']['ruecknahme'])){$withdrawn++;continue;}
        $date=(string)($k['kuendigungsdatum']??'');
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)||!checkdate((int)substr($date,5,2),(int)substr($date,8,2),(int)substr($date,0,4))||$date>$today){$missingExits++;continue;}
        $key=implode('|',[(string)($k['personalnummer']??''),strtolower(trim((string)($k['vorname']??''))),strtolower(trim((string)($k['nachname']??''))),(string)($k['eintritt']??''),$date]);
        if(isset($used[$key]))continue;$used[$key]=true;
        $m=substr($date,0,7);if(isset($months[$m]))$months[$m]['abgang']++;
        $joined=(string)($k['eintritt']??'');
        if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$joined)||
          !checkdate((int)substr($joined,5,2),(int)substr($joined,8,2),(int)substr($joined,0,4))||$joined>$date){$missingExitEntry++;continue;}
        $durations[]=(int)((strtotime($date.' UTC')-strtotime($joined.' UTC'))/86400);
    }
    $entries=array_sum(array_column($months,'zugang'));
    $exits=array_sum(array_column($months,'abgang'));
    sort($durations,SORT_NUMERIC);$count=count($durations);$mid=intdiv($count,2);
    $median=$count?($count%2?$durations[$mid]:($durations[$mid-1]+$durations[$mid])/2):null;
    $buckets=[];
    foreach([['Unter 30 Tagen',0,30],['30–89 Tage',30,90],['90–179 Tage',90,180],
      ['180–364 Tage',180,365],['1–2 Jahre',365,730],['Ab 2 Jahren',730,PHP_INT_MAX]] as [$label,$min,$max]){
        $buckets[]=['label'=>$label,'anzahl'=>count(array_filter($durations,fn($days)=>$days>=$min&&$days<$max))];
    }
    return ['personalbewegung'=>array_values($months),
      'bewegung12m'=>['zugang'=>$entries,'abgang'=>$exits,'saldo'=>$entries-$exits],
      'kuendigungsdienstzeit'=>['anzahl'=>$count,'durchschnitt_tage'=>$count?round(array_sum($durations)/$count,1):null,
        'median_tage'=>$median,'minimum_tage'=>$count?$durations[0]:null,'maximum_tage'=>$count?$durations[$count-1]:null,'verteilung'=>$buckets],
      'bewegung_datenqualitaet'=>['eintritte_ohne_datum'=>$missingEntries,'kuendigungen_ohne_datum'=>$missingExits,
        'kuendigungen_ohne_eintritt'=>$missingExitEntry,'zurueckgenommen'=>$withdrawn]];
}
function archiveTerminatedLogin(int $nr,array $u): void {
    $accounts=sql("SELECT id,rolle,dienstnummer FROM users WHERE dienstnummer REGEXP '^[0-9]{1,8}$'
        AND CAST(dienstnummer AS UNSIGNED)=? FOR UPDATE",[$nr]);
    foreach($accounts as $a){
        if($a['rolle']==='Administrator')fail(409,'Administratorzugang kann nicht automatisch archiviert werden');
        $id=(int)$a['id'];
        sql('UPDATE users SET dienstnummer=?,gesperrt=1 WHERE id=?',
            ['archiv-'.$nr.'-'.$id,$id]);
        sql('DELETE FROM sessions WHERE user_id=?',[$id]);
        auditAction($u,'Panel-Zugang der ausgeschiedenen DN '.$nr.' archiviert und gesperrt');
    }
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
        AND JSON_EXTRACT(k.personal_snapshot,'$.ruecknahme') IS NULL
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
        $logins=[];foreach(sql("SELECT CAST(dienstnummer AS UNSIGNED) AS nr,rolle FROM users WHERE dienstnummer REGEXP '^[0-9]{1,8}$' AND CAST(dienstnummer AS UNSIGNED) BETWEEN 1 AND 60") as $r)
            $logins[(int)$r['nr']]=$r['rolle'];
        $terminations=[];foreach(sql("SELECT DISTINCT k.personalnummer FROM kuendigungen k WHERE k.personalnummer BETWEEN 1 AND 60
          AND JSON_EXTRACT(k.personal_snapshot,'$.ruecknahme') IS NULL
          AND (NOT EXISTS(SELECT 1 FROM personalnummer_neubelegungen a WHERE a.personalnummer=k.personalnummer)
               OR k.erfasst_am>=(SELECT MAX(a.zeit) FROM personalnummer_neubelegungen a WHERE a.personalnummer=k.personalnummer))") as $r)
            $terminations[(int)$r['personalnummer']]=true;
        $main=[];$side=[];
        for($n=1;$n<=60;$n++){
            $p=$people[$n]??null;
            $terminated=$p&&strtolower(trim((string)$p['status']))==='gekündigt'&&isset($terminations[$n]);
            if(isset($logins[$n])&&(!$terminated||$logins[$n]==='Administrator'))continue;
            $free=!$p||$p['administrativ_geloescht_am']!==null||
                (!dnOccupied((string)$p['status'])&&
                 (strtolower(trim((string)$p['status']))!=='gekündigt'||isset($terminations[$n])));
            if($free){if($n<50)$main[]=$n;else $side[]=$n;}
        }
        respond(200,['hauptberuf'=>$main,'nebenberuf'=>$side]);
    }
    if($method==='GET'&&$uri==='/api/personalstatistik'){
        needRight($u,'pers');
        $groups=sql("SELECT COALESCE(NULLIF(gruppe,''),'Nicht zugeordnet') AS gruppe,beschaeftigungsart,status,COUNT(*) AS anzahl FROM personal WHERE administrativ_geloescht_am IS NULL AND status<>'Gekündigt' AND LOWER(CONCAT_WS(' ',vorname,nachname)) NOT LIKE '%test%' GROUP BY 1,2,3");
        $months=sql("SELECT DATE_FORMAT(eintrittsdatum,'%Y-%m') AS monat,COUNT(*) AS anzahl FROM personal
          WHERE eintrittsdatum>=DATE_SUB(UTC_DATE(),INTERVAL 12 MONTH) AND LOWER(CONCAT_WS(' ',vorname,nachname)) NOT LIKE '%test%' GROUP BY 1 ORDER BY 1");
        respond(200,['gruppen'=>$groups,'eintritte'=>$months]);
    }
    if($method==='GET'&&$uri==='/api/personalstatistik/erweitert'){
        needRight($u,'pers');
        db()->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        db()->beginTransaction();
        try{
        $ranks=sql("SELECT COALESCE(NULLIF(dienstgrad,''),'Nicht zugeordnet') AS rang,
            COUNT(*) AS anzahl FROM personal WHERE administrativ_geloescht_am IS NULL
            AND status<>'Gekündigt' AND LOWER(CONCAT_WS(' ',vorname,nachname)) NOT LIKE '%test%' GROUP BY 1 ORDER BY anzahl DESC,rang");
        // Service continues during absence, inactivity and suspension. Reserved DNs are not employees.
        $tenure=sql("SELECT status,CASE WHEN eintrittsdatum IS NOT NULL AND eintrittsdatum<=UTC_DATE()
              THEN DATEDIFF(UTC_DATE(),eintrittsdatum) ELSE NULL END AS tage FROM personal
            WHERE administrativ_geloescht_am IS NULL AND status IN ('Aktiv','Abgemeldet','Inaktiv','Suspendiert')
              AND LOWER(CONCAT_WS(' ',vorname,nachname)) NOT LIKE '%test%'");
        $tenureDays=[];$tenureCoverage=[];
        foreach(['Aktiv','Abgemeldet','Inaktiv','Suspendiert'] as $status)$tenureCoverage[$status]=['status'=>$status,'gesamt'=>0,'auswertbar'=>0];
        foreach($tenure as $row){
            $status=$row['status'];$tenureCoverage[$status]['gesamt']++;
            if($row['tage']!==null&&is_numeric($row['tage'])&&(int)$row['tage']>=0){
                $tenureDays[]=(int)$row['tage'];$tenureCoverage[$status]['auswertbar']++;
            }
        }
        $promotions=personnelPromotionStats();
        $result=['dienstgrade'=>$ranks,'dienstzeiten'=>$tenureDays,'dienstzeiten_abdeckung'=>array_values($tenureCoverage),'berechnet_am'=>gmdate('c'),
            ...$promotions,...personnelMovementStats()];
        db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,$result);
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
                if($p['administrativ_geloescht_am']===null&&strtolower(trim((string)$p['status']))==='gekündigt'&&!termMatches($p))
                    fail(409,'Die Kündigung muss zuerst in die Kündigungsverwaltung übernommen werden.');
            }
            if($previous&&strtolower(trim((string)$previous[0]['status']))==='gekündigt'&&termMatches($previous[0]))
                archiveTerminatedLogin($n,$u);
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
        $saveStep='P01'; // Personalakte sperren
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
                if(in_array($key,['waffenschein','spind'],true)){
                    // The browser sends booleans; PDO execute(array) can bind false
                    // as an empty string, which MySQL 8 rejects for TINYINT (1366).
                    // Match the existing CREATE route by storing integer 0/1.
                    if(!is_bool($value)&&!in_array($value,[0,1],true))
                        fail(400,'Ungültiger Wert für das Feld '.$key);
                    $params[]=$value?1:0;
                    continue;
                }
                $params[]=($value===''&&!in_array($key,['arbeitsvertrag_url','ernennungsurkunde_url'],true))?null:$value;
            }
            $params[]=$n;$params[]=$revision;
            $saveStep='P02'; // Personalstatus und sonstige Änderungen speichern
            $stmt=db()->prepare('UPDATE personal SET '.implode(',',$updates).' WHERE personalnummer=? AND row_revision=?');
            $stmt->execute($params);
            if($stmt->rowCount()!==1)versionConflict();
            $saveStep='P03'; // Gespeicherten Status einlesen
            $applied=sql('SELECT * FROM personal WHERE personalnummer=?',[$n])[0];
            if($rank!=='')
                sql('INSERT INTO personal_rangantraege(personalnummer,alter_rang,beantragter_rang,begruendung,antragsteller_id,korrigiertes_befoerderungsdatum) VALUES(?,?,?,?,?,?)',
                    [$n,$before['dienstgrad']??'',$rank,$rankReason,$u['id'],$rankDate]);
            $added=false;$oldTerm=false;
            if($termination){
                $saveStep='K01'; // Historische Kündigungen abgleichen
                $oldTerm=(bool)termMatches($applied);
                if(!$oldTerm){
                    $saveStep='K02'; // Kündigung und Personalsnapshot anlegen
                    addTermination($applied,trim((string)$b['kuendigungsgrund']));$added=true;
                    $saveStep='K03'; // Kündigung protokollieren
                    auditAction($u,'Kündigung automatisch angelegt: '.$n.' '.$applied['vorname'].' '.$applied['nachname'],'add');
                }
                $saveStep='K04'; // Ausgeschiedenen Panel-Zugang deaktivieren
                archiveTerminatedLogin($n,$u);
            }
            $delta=[];
            foreach(['vorname','nachname','status','gruppe','beschaeftigungsart','nebenjob','eintrittsdatum','rsa'] as $key)
                if(array_key_exists($key,$changes)&&(string)($before[$key]??'')!==(string)($changes[$key]??''))
                    $delta[$key]=['alt'=>$before[$key]??null,'neu'=>$changes[$key]??null];
            $saveStep='P04'; // Änderungen protokollieren
            if($delta)sql('INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES(?,?,?)',
                [$n,$u['id'],json_encode($delta,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
            $saveStep='P05'; // Auditprotokoll schreiben
            auditAction($u,'Personal '.$n.' geändert'.($termination?' (Status: Gekündigt)':''));
            $saveStep='P06'; // Transaktion bestätigen
            db()->commit();
        }catch(\PDOException $e){
            if(db()->inTransaction())db()->rollBack();
            if($termination??false){
                // No SQL query, personal names, reason or credentials in error response.
                $driverCode=(int)($e->errorInfo[1]??0);
                $errorCode='KUEND-'.$saveStep.'-'.($driverCode>0?$driverCode:'DB');
                error_log('[IDV PHP] Kündigung fehlgeschlagen: Schritt='.$saveStep.
                    ' SQLSTATE='.$e->getCode().' MySQL='.$driverCode);
                fail(500,'Kündigung konnte nicht gespeichert werden (Diagnose: '.$errorCode.').');
            }
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'rangantrag_angelegt'=>$rank!=='','kuendigung_angelegt'=>$added,'kuendigung_vorhanden'=>$oldTerm]);
    }
    return false;
}
