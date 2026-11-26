<?php
declare(strict_types=1);
namespace IDV;

const ASSESSMENT_ARTEN=['einstellung_leicht'=>'Einstellungstest – leicht','einstellung_schwer'=>'Einstellungstest – schwer','wiedereinstieg'=>'Wiedereinstiegsprüfung'];
function assessmentJson($v): string {return json_encode($v,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);}
function assessmentRead($v): array {return json_decode((string)$v,true,64,JSON_THROW_ON_ERROR);}
function assessmentSchema(): bool {
    $r=sql("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('assessment_pruefung_vorlagen','assessment_pruefungen')");
    return (int)$r[0]['n']===2;
}
function assessmentInstall(array $u): never {
    if(($u['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren');
    if((body()['bestaetigung']??null)!=='BACKUP_ERSTELLT_ASSESSMENT')fail(400,'Backup bestätigen');
    if(assessmentSchema())respond(200,['ok'=>true]);
    require_once __DIR__.'/DatabaseBackup.php';
    $dbName=(string)db()->query('SELECT DATABASE()')->fetchColumn();$safe=false;
    foreach(backupList() as $entry){
        if(($entry['type']??'')!=='idv'||($entry['database']??'')!==$dbName||!($entry['encrypted']??false))continue;
        $created=strtotime((string)($entry['created']??''));
        if($created===false||time()-$created>86400||$created>time()+300)continue;
        $path=backupFile((string)$entry['id']);
        if(is_file($path)&&hash_equals((string)($entry['sha256']??''),hash_file('sha256',$path))){$safe=true;break;}
    }
    if(!$safe)fail(428,'Zuerst eine aktuelle verschlüsselte Datenbanksicherung unter Administration → Backup-Übersicht erstellen und herunterladen.');
    $file=dirname(__DIR__).'/scripts/mysql/2026-11-25-assessment.sql';
    if(!is_readable($file))fail(503,'SQL-Migration fehlt auf dem Hoster');
    $lock=sql("SELECT GET_LOCK('idv_assessment_schema_v1',10) AS ok");
    if((int)($lock[0]['ok']??0)!==1)fail(503,'Einrichtung läuft bereits');
    try{
        $content=preg_replace('/^--[^\\r\\n]*$/m','',file_get_contents($file));
        foreach(explode(';',$content) as $statement){
            $statement=trim($statement);if($statement==='')continue;
            if(!preg_match('/^CREATE TABLE IF NOT EXISTS assessment_pruefung(?:en|_vorlagen)\\s*\\(/D',$statement))throw new \RuntimeException('Unzulässige Prüfungsmigration');
            db()->exec($statement);
        }
    }finally{sql("SELECT RELEASE_LOCK('idv_assessment_schema_v1')");}
    if(!assessmentSchema())fail(503,'Migration nicht vollständig');
    respond(200,['ok'=>true]);
}
function assessmentText($s,int $max,bool $required=true): string {
    if(!is_string($s)||strlen($s)>$max||($required&&trim($s)===''))fail(400,'Ungültiger Prüfungstext');
    return trim($s);
}
function assessmentNum($v,float $min,float $max): float {
    if(!is_int($v)&&!is_float($v))fail(400,'Numerischer Wert erforderlich');
    if(!is_finite((float)$v)||$v<$min||$v>$max||round((float)$v,2)!=(float)$v)fail(400,'Wert außerhalb der zulässigen Grenzen');
    return (float)$v;
}
function assessmentBild($value,int &$budget): ?string {
    if($value===null||$value==='')return null;
    if(!is_string($value)||strlen($value)>610000||!preg_match('#^data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$#D',$value,$m))fail(400,'Ungültige Bilddatei');
    $bytes=base64_decode($m[2],true);$info=$bytes===false?false:@getimagesizefromstring($bytes);
    if(!$info||$info['mime']!==$m[1]||$info[0]>6000||$info[1]>6000||strlen($bytes)>450000)fail(400,'Bildformat oder Größe nicht zulässig');
    $budget-=strlen($bytes);if($budget<0)fail(400,'Gesamtbildgröße überschreitet 1 MB');
    return 'data:'.$m[1].';base64,'.base64_encode($bytes);
}
function assessmentVorlage(array $b): array {
    $art=$b['art']??'';if(!is_string($art)||!isset(ASSESSMENT_ARTEN[$art]))fail(400,'Unbekannte Prüfungsart');
    $titel=assessmentText($b['titel']??ASSESSMENT_ARTEN[$art],200);
    $minuten=(int)assessmentNum($b['minuten']??null,$art==='praxis'?0:1,$art==='praxis'?0:480);
    if($minuten!=($b['minuten']??null))fail(400,'Bearbeitungszeit muss eine ganze Minute sein');
    $grenze=assessmentNum($b['grenze']??null,1,100);
    if(($b['bestaetigt']??false)!==true)fail(400,'Vorlage und Bewertungsregeln zuerst fachlich prüfen und bestätigen');
    $fragen=$b['fragen']??null;
    if(!is_array($fragen)||!array_is_list($fragen)||!count($fragen)||count($fragen)>200)fail(400,'1 bis 200 Fragen erforderlich');
    $out=[];$sum=0;$bildBudget=1000000;
    foreach($fragen as $index=>$f){
        $prefix='Frage '.($index+1).': ';
        if(!is_array($f))fail(400,$prefix.'Ungültige Frage');
        $typ=$f['typ']??'';if(!in_array($typ,['single','multiple','text','praxis'],true)||($art==='praxis')!==($typ==='praxis'))fail(400,'Unzulässiger Fragetyp');
        $punkte=assessmentNum($f['punkte']??null,0,1000);$sum+=$punkte;
        $q=['typ'=>$typ,'titel'=>assessmentText($f['titel']??null,12000),'punkte'=>$punkte,'muster'=>assessmentText($f['muster']??'',16000,false),'optionen'=>[],'richtig'=>[]];
        $q['kontext']=assessmentText($f['kontext']??'',16000,false);
        $q['feedback']=assessmentText($f['feedback']??'',16000,false);
        $q['bilder']=[];$q['optionBilder']=[];
        $images=$f['bilder']??[];
        if(!is_array($images)||!array_is_list($images)||count($images)>10)fail(400,'Ungültige Fragenbilder');
        foreach($images as $img){$valid=assessmentBild($img,$bildBudget);if($valid!==null)$q['bilder'][]=$valid;}
        if(in_array($typ,['single','multiple'],true)){
            $opt=$f['optionen']??null;$correct=$f['richtig']??null;
            if(!is_array($opt)||!array_is_list($opt)||count($opt)<2||count($opt)>50||!is_array($correct)||!array_is_list($correct)||($punkte>0&&!count($correct))||($typ==='single'&&count($correct)>1))fail(400,$prefix.'Antwortmöglichkeiten oder Lösung fehlen');
            foreach($opt as $o)$q['optionen'][]=assessmentText($o,3000);
            $ob=$f['optionBilder']??[];
            if(!is_array($ob)||!array_is_list($ob)||($ob&&count($ob)!==count($opt)))fail(400,$prefix.'Antwortbilder passen nicht zu Optionen');
            foreach($opt as $i=>$o)$q['optionBilder'][]=assessmentBild($ob[$i]??null,$bildBudget);
            foreach($correct as $i){if(!is_int($i)||!isset($opt[$i])||in_array($i,$q['richtig'],true))fail(400,$prefix.'Ungültiger Lösungsschlüssel');$q['richtig'][]=$i;}
            sort($q['richtig']);
        }elseif($punkte>0&&$q['muster']==='')fail(400,$prefix.'Musterlösung bzw. Bewertungsmaßstab fehlt');
        $out[]=$q;
    }
    if($sum<=0||$sum>99999)fail(400,'Gesamtpunktzahl muss größer als 0 und höchstens 99999 sein');
    return [$art,$titel,$minuten,$grenze,$out];
}
function assessmentAntworten(array $fragen,$answers): array {
    if(!is_array($answers)||!array_is_list($answers)||count($answers)!==count($fragen))fail(400,'Antwortliste passt nicht zur Prüfung');
    $out=[];
    foreach($fragen as $i=>$q){
        $a=$answers[$i];
        if($q['typ']==='text'){$out[]=assessmentText($a,16000,false);continue;}
        if(!is_array($a)||!array_is_list($a)||($q['typ']==='single'&&count($a)>1))fail(400,'Ungültige Auswahl');
        $seen=[];foreach($a as $v){if(!is_int($v)||!isset($q['optionen'][$v])||in_array($v,$seen,true))fail(400,'Ungültige Auswahl');$seen[]=$v;}sort($seen);$out[]=$seen;
    }
    return $out;
}
function assessmentAuto(array $q,$a): ?float {
    if(!in_array($q['typ'],['single','multiple'],true))return null;
    $a=is_array($a)?$a:[];sort($a);$r=$q['richtig'];sort($r);
    return $a===$r?(float)$q['punkte']:0.0;
}
function assessmentHistorie(array $p,string $aktion,?int $user=null,string $notiz=''): array {
    $h=assessmentRead($p['protokoll']);$h[]=['am'=>gmdate('c'),'aktion'=>$aktion,'user'=>$user,'notiz'=>$notiz];return $h;
}
function assessmentFinalizeExpired(): void {
    sql("UPDATE assessment_pruefungen SET status='abgegeben',abgabe_am=ende_am,revision=revision+1 WHERE status='laufend' AND ende_am<=UTC_TIMESTAMP(6)");
}
function assessmentRow(int $id,bool $lock=false): array {
    $r=sql("SELECT p.*,v.art,v.titel,v.minuten,v.grenze,v.fragen FROM assessment_pruefungen p JOIN assessment_pruefung_vorlagen v ON v.id=p.vorlage_id WHERE p.id=?".($lock?' FOR UPDATE':''),[$id]);
    if(!$r)fail(404,'Prüfung nicht gefunden');return $r[0];
}
// Role-bound: training rights never grant recruiting access.
function assessmentVerwaltung(array $u): bool {
    return in_array($u['rolle']??'', ['Polizeirat','Leitungsdienst','Administrator'],true);
}
function assessmentRecht(array $u): void {
    if(!assessmentVerwaltung($u))fail(403,'Assessment Center nur für Polizeirat, Leitungsdienst und Administratoren.');
}
function assessmentImportAdmin(array $u): bool {return assessmentVerwaltung($u);}
function assessmentBerichtigungStatus(string $status): bool {
    return in_array($status,['abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben'],true);
}
function assessmentBewertung(array $q,$scores): array {
    if(!is_array($scores)||!array_is_list($scores)||count($scores)!==count($q))fail(400,'Alle Fragen bewerten');
    $result=[];$total=0;
    foreach($q as $i=>$f){
        $s=$scores[$i];if(!is_array($s))fail(400,'Bewertung fehlt');
        $points=assessmentNum($s['punkte']??null,0,(float)$f['punkte']);
        $total+=$points;$result[]=['punkte'=>$points,'notiz'=>assessmentText($s['notiz']??'',4000,false)];
    }
    return [$result,round($total,2)];
}
function assessmentPraxisErsteller(array $p): int {
    $history=is_array($p['protokoll']??null)?$p['protokoll']:assessmentRead($p['protokoll']??'[]');
    $first=$history[0]??[];
    return in_array($first['aktion']??'',['Praxisprüfung angelegt','erstellt'],true)?(int)($first['user']??0):0;
}
// Archive is independent of release: theory transfers continue using status=freigegeben.
function assessmentArchivInfo(array $p,?int $now=null): array {
    $status=$p['status'];$now=$now??time();
    $out=['archiviert'=>$status==='annulliert','archivAb'=>null,'archiviertAm'=>null];
    if($status!=='freigegeben')return $out;
    $history=is_array($p['protokoll']??null)?$p['protokoll']:assessmentRead($p['protokoll']??'[]');
    foreach(array_reverse($history) as $entry){
        $action=$entry['aktion']??'';
        if(!in_array($action,['archivieren','freigabe','abschliessen'],true))continue;
        $stamp=is_string($entry['am']??null)?strtotime($entry['am']):false;
        if($action==='archivieren'){
            $out['archiviert']=true;$out['archiviertAm']=$stamp===false?null:gmdate('c',$stamp);return $out;
        }
        if($stamp!==false&&$stamp<=$now){
            $deadline=$stamp+86400;$out['archivAb']=gmdate('c',$deadline);
            $out['archiviert']=$now>=$deadline;
            if($out['archiviert'])$out['archiviertAm']=$out['archivAb'];
            return $out;
        }
        break;
    }
    // Legacy records without a trustworthy release timestamp remain archived.
    $out['archiviert']=true;return $out;
}
function assessmentVorlageLoeschenDarf(array $u,int $verwendungen): bool {
    return ($u['rolle']??'')==='Administrator'&&$verwendungen===0;
}
function assessmentLoeschenDarf(array $u,array $p,?int $now=null): bool {
    return ($u['rolle']??'')==='Administrator'
        &&in_array($p['status']??'', ['freigegeben','annulliert'],true)
        &&assessmentArchivInfo($p,$now)['archiviert'];
}
function assessmentSichtbar(array $p,int $uid,bool $leitung): bool {
    return $uid>0&&$leitung; // Every authorised council member sees every attempt, including archives.
}
function assessmentKorrekturOffen(string $status): bool {
    // Older two-stage attempts remain correctable, without any second reviewer.
    return in_array($status,['abgegeben','erstkorrigiert','zweitkorrigiert'],true);
}
function assessmentErstBearbeiter(array $p): int {
    $history=is_array($p['protokoll']??null)?$p['protokoll']:assessmentRead($p['protokoll']??'[]');
    foreach(array_reverse($history) as $entry){
        if(in_array($entry['aktion']??'',['korrektur','abschliessen'],true)&&isset($entry['bewertung'])&&(int)($entry['user']??0)>0)return (int)$entry['user'];
    }
    return 0;
}
function assessmentKorrekturRechte(array $p,int $uid,bool $leitung): array {
    return ['erst'=>$leitung&&$uid>0&&assessmentKorrekturOffen($p['status']),'zweit'=>false,'eigeneErstkorrektur'=>false];
}
function assessmentAccess(array $p,array $u): void {
    if(!assessmentSichtbar($p,(int)$u['id'],assessmentVerwaltung($u)))fail(403,'Kein Zugriff auf diese Prüfung.');
}
function assessmentReviewer(int $id): bool {
    if($id<1)return false;
    $r=sql("SELECT id,rolle FROM users WHERE id=? AND gesperrt=0 AND muss_passwort_aendern=0",[$id]);
    return $r&&assessmentVerwaltung($r[0]);
}
function assessmentPublicFragen(array $fragen): array {
    return array_map(fn($q)=>array_intersect_key($q,array_flip(['typ','titel','punkte','optionen','kontext','bilder','optionBilder'])),$fragen);
}
function assessmentFokusMerge(array $f,array $events,int $questionCount): array {
    $f['events']=$f['events']??[];$f['wechsel']=(int)($f['wechsel']??0);
    $seen=[];foreach($f['events'] as $entry)if(isset($entry['id']))$seen[$entry['id']]=true;
    foreach($events as $entry){
        if(!is_array($entry))continue;
        $kind=$entry['ereignis']??'';$id=$entry['id']??null;
        if(!in_array($kind,['verlassen','zurueck','reload','vollbild_aus','paste','paste_versuch','copy','cut','frage_geoeffnet'],true))continue;
        if($id!==null&&(!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{8,80}$/D',$id)))continue;
        if($id!==null&&isset($seen[$id]))continue;
        if(count($f['events'])>=1000){$f['limit']=true;break;}
        if($kind==='verlassen'&&($f['offen']??false))continue;
        if($kind==='zurueck'&&!($f['offen']??false))continue;
        if($kind==='verlassen'){$f['wechsel']++;$f['offen']=true;}
        if($kind==='zurueck')$f['offen']=false;
        $item=['am'=>gmdate('c'),'ereignis'=>$kind];
        if($id!==null){$item['id']=$id;$seen[$id]=true;}
        $q=$entry['frage']??null;if(is_int($q)&&$q>=1&&$q<=$questionCount)$item['frage']=$q;
        if($kind==='frage_geoeffnet'&&!isset($item['frage']))continue;
        if(isset($item['frage']))$f['aktuelleFrage']=$item['frage'];
        $f['events'][]=$item;
    }
    return $f;
}
function assessmentGuest(string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/assessment-gast/'))return false;
    if($method!=='POST'||!in_array($uri,['/api/assessment-gast/status','/api/assessment-gast/start','/api/assessment-gast/speichern','/api/assessment-gast/abgeben','/api/assessment-gast/fokus'],true))fail(404,'Nicht gefunden');
    if(!assessmentSchema())fail(503,'Assessment Center nicht eingerichtet');
    $b=body();$token=$b['token']??'';
    if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))fail(404,'Prüfungslink ungültig');
    assessmentFinalizeExpired();$pdo=db();$pdo->beginTransaction();
    try{
        $r=sql("SELECT p.*,v.art,v.titel,v.minuten,v.grenze,v.fragen FROM assessment_pruefungen p JOIN assessment_pruefung_vorlagen v ON v.id=p.vorlage_id WHERE p.token_hash=? FOR UPDATE",[hash('sha256',$token)]);
        if(!$r||$r[0]['art']==='praxis'||$r[0]['status']==='annulliert')fail(404,'Prüfungslink ungültig');
        $p=$r[0];$id=(int)$p['id'];$action=basename($uri);
        if($p['status']==='bereit'&&strtotime($p['token_ablauf'].' UTC')<=time())fail(410,'Prüfungslink abgelaufen');
        if($action==='start'){
            if($p['status']==='bereit'){
                if(($b['einverstanden']??false)!==true)fail(400,'Prüfungshinweise bestätigen');
                sql("UPDATE assessment_pruefungen SET status='laufend',start_am=UTC_TIMESTAMP(6),ende_am=TIMESTAMPADD(MINUTE,?,UTC_TIMESTAMP(6)),revision=revision+1 WHERE id=?",[(int)$p['minuten'],$id]);
            }elseif($p['status']!=='laufend')fail(409,'Prüfung wurde bereits abgegeben');
        }elseif(in_array($action,['speichern','abgeben','fokus'],true)){
            if($p['status']!=='laufend'||strtotime($p['ende_am'].' UTC')<=time())fail(409,'Bearbeitungszeit beendet');
            $events=$b['ereignisse']??[];
            if(!is_array($events)||!array_is_list($events)||count($events)>100)fail(400,'Ungültige Ereignisliste');
            if($action==='fokus'&&isset($b['ereignis']))$events[]=['ereignis'=>$b['ereignis']];
            if($events){
                $f=assessmentFokusMerge(assessmentRead($p['fokus']),$events,count(assessmentRead($p['fragen'])));
                sql('UPDATE assessment_pruefungen SET fokus=? WHERE id=?',[assessmentJson($f),$id]);
            }
            if($action==='fokus'){$pdo->commit();respond(200,['ok'=>true]);}
            if(($b['revision']??null)!==(int)$p['revision'])fail(409,'Antwortstand wurde geändert. Bitte neu laden.');
            $answers=assessmentAntworten(assessmentRead($p['fragen']),$b['antworten']??null);
            if($action==='abgeben')sql("UPDATE assessment_pruefungen SET antworten=?,status='abgegeben',abgabe_am=UTC_TIMESTAMP(6),revision=revision+1 WHERE id=? AND status='laufend' AND ende_am>UTC_TIMESTAMP(6)",[assessmentJson($answers),$id]);
            else sql("UPDATE assessment_pruefungen SET antworten=?,revision=revision+1 WHERE id=? AND status='laufend' AND ende_am>UTC_TIMESTAMP(6)",[assessmentJson($answers),$id]);
        }
        $p=assessmentRow($id);$pdo->commit();
        $out=['titel'=>$p['titel'],'status'=>$p['status'],'minuten'=>(int)$p['minuten'],'revision'=>(int)$p['revision'],'serverZeit'=>time(),'ende'=>$p['ende_am']?strtotime($p['ende_am'].' UTC'):null];
        if($p['status']==='laufend'){
            if($action!=='speichern')$out['fragen']=assessmentPublicFragen(assessmentRead($p['fragen']));
            $out['antworten']=assessmentRead($p['antworten']);
        }
        if($p['status']==='freigegeben'){$max=array_sum(array_column(assessmentRead($p['fragen']),'punkte'));$out['ergebnis']=(float)$p['ergebnis'];$out['max']=$max;$out['bestanden']=100*(float)$p['ergebnis']/$max>=(float)$p['grenze'];}
        respond(200,$out);
    }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
function assessmentListenZeilen(int $uid,bool $lead): array {
        if(!$lead||$uid<1)return [];
        $rows=sql("SELECT p.id,p.revision,p.kandidat,p.erst,p.status,p.start_am,p.ende_am,p.abgabe_am,p.ergebnis,p.fokus,p.antworten,p.protokoll,v.titel,v.art FROM assessment_pruefungen p JOIN assessment_pruefung_vorlagen v ON v.id=p.vorlage_id ORDER BY p.id DESC");
        foreach($rows as &$r){$r+=assessmentArchivInfo($r);unset($r['protokoll']);$f=assessmentRead($r['fokus']);$r['tabwechsel']=$f['wechsel']??0;$r['ereignisse']=count($f['events']??[]);$r['aktuelleFrage']=$f['aktuelleFrage']??null;$a=assessmentRead($r['antworten']);$r['fragenGesamt']=count($a);$r['bearbeitet']=count(array_filter($a,fn($x)=>is_array($x)?count($x)>0:trim((string)$x)!==''));unset($r['fokus'],$r['antworten']);}unset($r);
    return $rows;
}
function dispatchAssessment(array $u,string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/assessment'))return false;
    assessmentRecht($u);$verwaltung=assessmentVerwaltung($u);$lead=$verwaltung;$importAdmin=assessmentImportAdmin($u);$uid=(int)$u['id'];
    $root='/api/assessment';
    if($uri===$root.'/ki-einstellungen'){
        if(($u['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren verwalten die gemeinsame KI-Verbindung.');
        require_once __DIR__.'/Pruefungen.php';
        require_once __DIR__.'/PruefungenKIConfig.php';
        examAiConfigEndpoint($u,$method);
    }
    if(($uri===$root.'/vorlagen'||str_starts_with($uri,$root.'/vorlagen/'))&&!$verwaltung)
        fail(403,'Assessment-Vorlagen sind nur für Polizeirat, Leitungsdienst und Administratoren zugänglich');
    if(str_starts_with($uri,$root.'/google/')&&!$importAdmin)
        fail(403,'Nur Polizeirat, Leitungsdienst und Administratoren dürfen Assessment-Vorlagen importieren');
    if(str_starts_with($uri,$root.'/google/')){
        require_once __DIR__.'/AssessmentGoogle.php';
        if(dispatchAssessmentGoogle($u,$method,$uri))return true;
        fail(404,'Google-Import-Endpunkt unbekannt');
    }
    if($method==='POST'&&$uri===$root.'/setup')assessmentInstall($u);
    if(!assessmentSchema()){
        if($method==='GET'&&$uri===$root)respond(200,['bereit'=>false,'leitung'=>$lead,'admin'=>$u['rolle']==='Administrator']);
        fail(503,'Assessment-Datenbank noch nicht eingerichtet');
    }
    assessmentFinalizeExpired();
    if($method==='GET'&&$uri===$root.'/live')respond(200,['pruefungen'=>assessmentListenZeilen($uid,$lead)]);
    if($method==='GET'&&$uri===$root){
        $rows=assessmentListenZeilen($uid,$lead);
        $reviewers=[];foreach(sql("SELECT id,anzeigename,dienstnummer FROM users WHERE gesperrt=0 AND muss_passwort_aendern=0 ORDER BY anzeigename") as $r)if(assessmentReviewer((int)$r['id']))$reviewers[]=$r;
        respond(200,['bereit'=>true,'leitung'=>$lead,'verwaltung'=>$verwaltung,'loeschenAdmin'=>($u['rolle']==='Administrator'),'vorlagenBearbeiten'=>$verwaltung,'importAdmin'=>$importAdmin,'user'=>$uid,'arten'=>ASSESSMENT_ARTEN,'vorlagen'=>($verwaltung?sql('SELECT v.id,v.art,v.titel,v.minuten,v.grenze,v.erstellt_am,(SELECT COUNT(*) FROM assessment_pruefungen p WHERE p.vorlage_id=v.id) AS verwendungen FROM assessment_pruefung_vorlagen v WHERE JSON_TYPE(v.fragen)=\'ARRAY\' ORDER BY v.id DESC'):[]),'pruefungsauswahl'=>($verwaltung?sql('SELECT id,art,titel FROM assessment_pruefung_vorlagen WHERE art<>\'praxis\' ORDER BY id DESC'):[]),'pruefungen'=>$rows,'pruefer'=>$reviewers,'kiAdmin'=>($u['rolle']==='Administrator')]);
    }
    if($method==='POST'&&preg_match('#^/api/assessment/vorlagen/([1-9][0-9]*)/loeschen$#D',$uri,$vMatch)){
        if(($u['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren dürfen Vorlagen löschen.');
        $b=body();if(($b['bestaetigen']??false)!==true)fail(400,'Endgültiges Löschen ausdrücklich bestätigen.');
        $vid=(int)$vMatch[1];
        // An atomic conditional delete plus the existing foreign key protects concurrent exam creation.
        $stmt=db()->prepare("DELETE FROM assessment_pruefung_vorlagen WHERE id=? AND JSON_TYPE(fragen)='ARRAY' AND NOT EXISTS (SELECT 1 FROM assessment_pruefungen p WHERE p.vorlage_id=assessment_pruefung_vorlagen.id)");
        try{$stmt->execute([$vid]);}
        catch(\PDOException $e){if(($e->errorInfo[1]??null)==1451)fail(409,'Vorlage wird noch von Prüfungen verwendet.');throw $e;}
        if($stmt->rowCount()!==1){
            $rows=sql("SELECT JSON_TYPE(fragen) AS typ,(SELECT COUNT(*) FROM assessment_pruefungen p WHERE p.vorlage_id=v.id) AS verwendungen FROM assessment_pruefung_vorlagen v WHERE v.id=?",[$vid]);
            if(!$rows)fail(404,'Vorlage nicht gefunden.');
            if($rows[0]['typ']!=='ARRAY')fail(409,'Fest eingebauter Bewertungsbogen kann nicht gelöscht werden.');
            if(!assessmentVorlageLoeschenDarf($u,(int)$rows[0]['verwendungen']))fail(409,'Vorlage wird noch von '.(int)$rows[0]['verwendungen'].' Prüfung(en) verwendet. Bestehende Prüfungen bleiben geschützt.');
            fail(409,'Vorlage wurde zwischenzeitlich geändert. Bitte neu laden.');
        }
        error_log('IDV assessment_pruefung_vorlagen: Vorlage #'.$vid.' endgültig gelöscht durch Administrator #'.$uid);
        respond(200,['ok'=>true,'geloescht'=>true]);
    }
    if($method==='GET'&&preg_match('#^/api/assessment/vorlagen/([1-9][0-9]*)$#D',$uri,$vMatch)){
        if(!$verwaltung)fail(403,'Nur berechtigte Leitung und Administratoren dürfen Prüfungsvorlagen einsehen und bearbeiten');
        $rows=sql('SELECT id,art,titel,minuten,grenze,fragen FROM assessment_pruefung_vorlagen WHERE id=?',[(int)$vMatch[1]]);
        if(!$rows)fail(404,'Vorlage nicht gefunden');
        $v=$rows[0];if($v['art']==='praxis'&&!array_is_list(assessmentRead($v['fragen'])))fail(403,'Fester Praxisbogen');$v['fragen']=assessmentRead($v['fragen']);respond(200,['vorlage'=>$v]);
    }
    if($method==='POST'&&$uri===$root.'/vorlagen'){
        if(!$verwaltung)fail(403,'Nur berechtigte Leitung und Administratoren dürfen Prüfungsvorlagen einsehen und bearbeiten');
        $b=body();[$art,$titel,$minuten,$grenze,$fragen]=assessmentVorlage($b);
        if(isset($b['basis'])){
            $basis=sql('SELECT art FROM assessment_pruefung_vorlagen WHERE id=?',[(int)$b['basis']]);
            if(!$basis||$basis[0]['art']!==$art)fail(400,'Bearbeitete Version muss dieselbe Prüfungsart behalten');
        }
        sql('INSERT INTO assessment_pruefung_vorlagen(art,titel,minuten,grenze,fragen,erstellt_von) VALUES(?,?,?,?,?,?)',[$art,$titel,$minuten,$grenze,assessmentJson($fragen),$uid]);
        respond(201,['id'=>(int)db()->lastInsertId()]);
    }
    if($method==='POST'&&$uri===$root){
        if(!$verwaltung)fail(403,'Nur Polizeirat, Leitungsdienst und Administratoren dürfen Prüfungen anlegen');
        $b=body();$vid=(int)($b['vorlage']??0);$candidate=assessmentText($b['bewerber']??null,200);
        // Existing schema columns are retained for non-destructive compatibility; no reviewer assignment.
        $first=$uid;$second=0;
        $v=sql('SELECT * FROM assessment_pruefung_vorlagen WHERE id=?',[$vid]);
        if(!$v||!isset(ASSESSMENT_ARTEN[$v[0]['art']]))fail(400,'Gültige Assessment-Vorlage fehlt');
        $v=$v[0];$token=bin2hex(random_bytes(32));
        $answers=array_map(fn($q)=>$q['typ']==='text'?'':[],assessmentRead($v['fragen']));
        sql("INSERT INTO assessment_pruefungen(vorlage_id,kandidat,erst,zweit,status,token_hash,token_ablauf,antworten,bewertung,protokoll,fokus) VALUES(?,?,?,?,?,?,TIMESTAMPADD(HOUR,24,UTC_TIMESTAMP(6)),?,?,?,?)",
            [$vid,$candidate,$first,$second,'bereit',hash('sha256',$token),assessmentJson($answers),'[]',assessmentJson([['am'=>gmdate('c'),'aktion'=>'erstellt','user'=>$uid]]),'{"wechsel":0,"events":[]}']);
        respond(201,['id'=>(int)db()->lastInsertId(),'link'=>'/assessment.html#'.$token]);
    }
    if(preg_match('#^/api/assessment/([1-9][0-9]*)/ki$#D',$uri,$aiMatch)){
        require_once __DIR__.'/AssessmentKI.php';
        assessmentKiEndpoint($u,$method,(int)$aiMatch[1]);
    }
    if(!preg_match('#^/api/assessment/([1-9][0-9]*)(?:/(korrektur|annullieren|link|berichtigen|wiedereroeffnen|archivieren|loeschen))?$#D',$uri,$m))fail(404,'Nicht gefunden');
    $id=(int)$m[1];$action=$m[2]??'';
    if($method==='GET'&&$action===''){
        $p=assessmentRow($id);assessmentAccess($p,$u);
        unset($p['token_hash'],$p['zweit']);$p+=assessmentArchivInfo($p);
        foreach(['fragen','antworten','bewertung','protokoll','fokus'] as $k)$p[$k]=assessmentRead($p[$k]);
        if(in_array($p['status'],['bereit','laufend'],true)){
            unset($p['fragen'],$p['antworten'],$p['bewertung']);
        }else $p['automatisch']=array_map(fn($q,$i)=>assessmentAuto($q,$p['antworten'][$i]??null),$p['fragen'],array_keys($p['fragen']));
        require_once __DIR__.'/PruefungenKIConfig.php';
        respond(200,['pruefung'=>$p,'user'=>$uid,'leitung'=>$lead,'verwaltung'=>$verwaltung,'korrekturRechte'=>assessmentKorrekturRechte($p,$uid,$verwaltung),'erstBearbeiter'=>in_array($p['status'],['erstkorrigiert','zweitkorrigiert','freigegeben'],true)?assessmentErstBearbeiter($p):null,'kiBereit'=>examAiStatus()['bereit']]);
    }
    if($method!=='POST'||$action==='')fail(405,'Nicht erlaubt');
    if($action==='loeschen'&&($u['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren dürfen Prüfungen löschen.');
    $b=body();$pdo=db();$pdo->beginTransaction();
    try{
        $p=assessmentRow($id,true);assessmentAccess($p,$u);
        if(($b['revision']??null)!==(int)$p['revision'])fail(409,'Prüfung wurde zwischenzeitlich geändert. Neu laden.');
        $status=$p['status'];$note=assessmentText($b['notiz']??'',4000,false);$link=null;$history=assessmentHistorie($p,$action,$uid,$note);
        if($action==='loeschen'){
            if(!assessmentLoeschenDarf($u,$p))fail(409,'Nur archivierte oder annullierte Prüfungen dürfen gelöscht werden.');
            if(($b['bestaetigen']??false)!==true)fail(400,'Endgültiges Löschen ausdrücklich bestätigen.');
            sql('DELETE FROM assessment_pruefungen WHERE id=? AND revision=?',[$id,(int)$p['revision']]);
            $pdo->commit();
            error_log('IDV assessment_pruefungen: Prüfung #'.$id.' endgültig gelöscht durch Administrator #'.$uid);
            respond(200,['ok'=>true,'geloescht'=>true]);
        }elseif($action==='archivieren'){
            if($status!=='freigegeben'||assessmentArchivInfo($p)['archiviert'])fail(409,'Nur abgeschlossene, noch nicht archivierte Prüfungen können archiviert werden.');
            if(($b['bestaetigen']??false)!==true)fail(400,'Archivierung ausdrücklich bestätigen.');
            sql('UPDATE assessment_pruefungen SET revision=revision+1,protokoll=? WHERE id=?',[assessmentJson($history),$id]);
        }elseif($action==='link'){
            if(!$verwaltung)fail(403,'Nur die Leitung darf Prüfungslinks erneuern');
            if($status!=='bereit'||$p['art']==='praxis')fail(409,'Link nur vor Prüfungsbeginn erneuerbar');
            $token=bin2hex(random_bytes(32));sql('UPDATE assessment_pruefungen SET token_hash=?,token_ablauf=TIMESTAMPADD(HOUR,24,UTC_TIMESTAMP(6)),revision=revision+1,protokoll=? WHERE id=?',[hash('sha256',$token),assessmentJson($history),$id]);$link='/assessment.html#'.$token;
        }elseif($action==='annullieren'){
            if(!$lead||$status==='annulliert'||$note==='')fail(403,'Nur die Leitung, mit Begründung');
            sql("UPDATE assessment_pruefungen SET status='annulliert',revision=revision+1,protokoll=? WHERE id=?",[assessmentJson($history),$id]);
        }elseif($action==='berichtigen'||$action==='wiedereroeffnen'){
            if(!$verwaltung)fail(403,'Nur Polizeirat, Leitungsdienst und Administratoren dürfen die Korrektursperre umgehen');
            if(!assessmentBerichtigungStatus($status))fail(409,'Nur abgegebene Prüfungen können korrigiert werden');
            if($note==='')fail(400,'Begründung für die Berichtigung ist erforderlich');
            $i=count($history)-1;
            $history[$i]['vorher']=['status'=>$status,'ergebnis'=>$p['ergebnis'],'bewertung'=>assessmentRead($p['bewertung'])];
            if($action==='wiedereroeffnen'){
                $history[$i]['nachher']=['status'=>'abgegeben','ergebnis'=>$p['ergebnis'],'bewertung'=>assessmentRead($p['bewertung'])];
                sql("UPDATE assessment_pruefungen SET status='abgegeben',revision=revision+1,protokoll=? WHERE id=?",[assessmentJson($history),$id]);
            }else{
                [$result,$total]=assessmentBewertung(assessmentRead($p['fragen']),$b['bewertung']??null);
                $history[$i]['nachher']=['status'=>$status,'ergebnis'=>$total,'bewertung'=>$result];
                sql('UPDATE assessment_pruefungen SET bewertung=?,ergebnis=?,revision=revision+1,protokoll=? WHERE id=?',[assessmentJson($result),$total,assessmentJson($history),$id]);
            }
        }elseif($action==='korrektur'){
            if(!assessmentKorrekturRechte($p,$uid,$verwaltung)['erst'])fail(403,'Korrektur nur für abgegebene Prüfungen.');
            if(($b['bestaetigen']??false)!==true)fail(400,'Abschluss und Ergebnisfreigabe ausdrücklich bestätigen.');
            [$result,$total]=assessmentBewertung(assessmentRead($p['fragen']),$b['bewertung']??null);
            $i=count($history)-1;
            $history[$i]['aktion']='abschliessen';$history[$i]['bewertung']=$result;
            sql("UPDATE assessment_pruefungen SET status='freigegeben',bewertung=?,ergebnis=?,revision=revision+1,protokoll=? WHERE id=?",[assessmentJson($result),$total,assessmentJson($history),$id]);
        }
        $pdo->commit();respond(200,['ok'=>true,'link'=>$link]);
    }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
