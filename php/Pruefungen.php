<?php
declare(strict_types=1);
namespace IDV;

const PRUEFUNG_ARTEN=['pm'=>'Polizeimeister – Theorieprüfung','pk'=>'Kommissarprüfung','dgl'=>'DGL – Theorieprüfung','praxis'=>'Polizeimeister – Praxisprüfung'];
function pruefungJson($v): string {return json_encode($v,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);}
function pruefungRead($v): array {return json_decode((string)$v,true,64,JSON_THROW_ON_ERROR);}
function pruefungSchema(): bool {
    $r=sql("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('ausbildung_pruefung_vorlagen','ausbildung_pruefungen')");
    return (int)$r[0]['n']===2;
}
function pruefungInstall(array $u): never {
    if(($u['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren');
    if((body()['bestaetigung']??null)!=='BACKUP_ERSTELLT_PRUEFUNGEN')fail(400,'Backup bestätigen');
    if(pruefungSchema())respond(200,['ok'=>true]);
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
    $file=dirname(__DIR__).'/scripts/mysql/2026-11-25-pruefungszentrum.sql';
    if(!is_readable($file))fail(503,'SQL-Migration fehlt auf dem Hoster');
    $lock=sql("SELECT GET_LOCK('idv_pruefung_schema_v1',10) AS ok");
    if((int)($lock[0]['ok']??0)!==1)fail(503,'Einrichtung läuft bereits');
    try{
        $content=preg_replace('/^--[^\\r\\n]*$/m','',file_get_contents($file));
        foreach(explode(';',$content) as $statement){
            $statement=trim($statement);if($statement==='')continue;
            if(!preg_match('/^CREATE TABLE IF NOT EXISTS ausbildung_pruefung(?:en|_vorlagen)\\s*\\(/D',$statement))throw new \\RuntimeException('Unzulässige Prüfungsmigration');
            db()->exec($statement);
        }
    }finally{sql("SELECT RELEASE_LOCK('idv_pruefung_schema_v1')");}
    if(!pruefungSchema())fail(503,'Migration nicht vollständig');
    respond(200,['ok'=>true]);
}
function pruefungText($s,int $max,bool $required=true): string {
    if(!is_string($s)||strlen($s)>$max||($required&&trim($s)===''))fail(400,'Ungültiger Prüfungstext');
    return trim($s);
}
function pruefungNum($v,float $min,float $max): float {
    if(!is_int($v)&&!is_float($v))fail(400,'Numerischer Wert erforderlich');
    if(!is_finite((float)$v)||$v<$min||$v>$max||round((float)$v,2)!=(float)$v)fail(400,'Wert außerhalb der zulässigen Grenzen');
    return (float)$v;
}
function pruefungVorlage(array $b): array {
    $art=$b['art']??'';if(!is_string($art)||!isset(PRUEFUNG_ARTEN[$art]))fail(400,'Unbekannte Prüfungsart');
    $titel=pruefungText($b['titel']??PRUEFUNG_ARTEN[$art],200);
    $minuten=(int)pruefungNum($b['minuten']??null,$art==='praxis'?0:1,$art==='praxis'?0:480);
    if($minuten!=($b['minuten']??null))fail(400,'Bearbeitungszeit muss eine ganze Minute sein');
    $grenze=pruefungNum($b['grenze']??null,1,100);
    if(($b['bestaetigt']??false)!==true)fail(400,'Vorlage und Bewertungsregeln zuerst fachlich prüfen und bestätigen');
    $fragen=$b['fragen']??null;
    if(!is_array($fragen)||!array_is_list($fragen)||!count($fragen)||count($fragen)>200)fail(400,'1 bis 200 Fragen erforderlich');
    $out=[];$sum=0;
    foreach($fragen as $f){
        if(!is_array($f))fail(400,'Ungültige Frage');
        $typ=$f['typ']??'';if(!in_array($typ,['single','multiple','text','praxis'],true)||($art==='praxis')!==($typ==='praxis'))fail(400,'Unzulässiger Fragetyp');
        $punkte=pruefungNum($f['punkte']??null,0.01,1000);$sum+=$punkte;
        $q=['typ'=>$typ,'titel'=>pruefungText($f['titel']??null,12000),'punkte'=>$punkte,'muster'=>pruefungText($f['muster']??'',16000,false),'optionen'=>[],'richtig'=>[]];
        if(in_array($typ,['single','multiple'],true)){
            $opt=$f['optionen']??null;$correct=$f['richtig']??null;
            if(!is_array($opt)||!array_is_list($opt)||count($opt)<2||count($opt)>50||!is_array($correct)||!array_is_list($correct)||!count($correct)||($typ==='single'&&count($correct)!==1))fail(400,'Antwortmöglichkeiten oder Lösung fehlen');
            foreach($opt as $o)$q['optionen'][]=pruefungText($o,3000);
            foreach($correct as $i){if(!is_int($i)||!isset($opt[$i])||in_array($i,$q['richtig'],true))fail(400,'Ungültiger Lösungsschlüssel');$q['richtig'][]=$i;}
            sort($q['richtig']);
        }elseif($q['muster']==='')fail(400,'Musterlösung bzw. Bewertungsmaßstab fehlt');
        $out[]=$q;
    }
    if($sum>99999)fail(400,'Gesamtpunktzahl zu hoch');
    return [$art,$titel,$minuten,$grenze,$out];
}
function pruefungAntworten(array $fragen,$answers): array {
    if(!is_array($answers)||!array_is_list($answers)||count($answers)!==count($fragen))fail(400,'Antwortliste passt nicht zur Prüfung');
    $out=[];
    foreach($fragen as $i=>$q){
        $a=$answers[$i];
        if($q['typ']==='text'){$out[]=pruefungText($a,16000,false);continue;}
        if(!is_array($a)||!array_is_list($a)||($q['typ']==='single'&&count($a)>1))fail(400,'Ungültige Auswahl');
        $seen=[];foreach($a as $v){if(!is_int($v)||!isset($q['optionen'][$v])||in_array($v,$seen,true))fail(400,'Ungültige Auswahl');$seen[]=$v;}sort($seen);$out[]=$seen;
    }
    return $out;
}
function pruefungAuto(array $q,$a): ?float {
    if(!in_array($q['typ'],['single','multiple'],true))return null;
    $a=is_array($a)?$a:[];sort($a);$r=$q['richtig'];sort($r);
    return $a===$r?(float)$q['punkte']:0.0;
}
function pruefungHistorie(array $p,string $aktion,?int $user=null,string $notiz=''): array {
    $h=pruefungRead($p['protokoll']);$h[]=['am'=>gmdate('c'),'aktion'=>$aktion,'user'=>$user,'notiz'=>$notiz];return $h;
}
function pruefungFinalizeExpired(): void {
    sql("UPDATE ausbildung_pruefungen SET status='abgegeben',abgabe_am=ende_am,revision=revision+1 WHERE status='laufend' AND ende_am<=UTC_TIMESTAMP(6)");
}
function pruefungRow(int $id,bool $lock=false): array {
    $r=sql("SELECT p.*,v.art,v.titel,v.minuten,v.grenze,v.fragen FROM ausbildung_pruefungen p JOIN ausbildung_pruefung_vorlagen v ON v.id=p.vorlage_id WHERE p.id=?".($lock?' FOR UPDATE':''),[$id]);
    if(!$r)fail(404,'Prüfung nicht gefunden');return $r[0];
}
function pruefungVerwaltung(array $u): bool {
    return ausbildungLeitung($u)&&(in_array($u['rolle']??'',['Administrator','Leitungsdienst','Ausbildungsleitung'],true)||ausbildungLeitungsprofil($u));
}
function pruefungBerichtigungStatus(string $status): bool {
    return in_array($status,['abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben'],true);
}
function pruefungBewertung(array $q,$scores): array {
    if(!is_array($scores)||!array_is_list($scores)||count($scores)!==count($q))fail(400,'Alle Fragen bewerten');
    $result=[];$total=0;
    foreach($q as $i=>$f){
        $s=$scores[$i];if(!is_array($s))fail(400,'Bewertung fehlt');
        $points=pruefungNum($s['punkte']??null,0,(float)$f['punkte']);
        $total+=$points;$result[]=['punkte'=>$points,'notiz'=>pruefungText($s['notiz']??'',4000,false)];
    }
    return [$result,round($total,2)];
}
function pruefungAccess(array $p,array $u): void {
    if(!ausbildungLeitung($u)&&!in_array((int)$u['id'],[(int)$p['erst'],(int)$p['zweit']],true))fail(403,'Nicht für diese Prüfung eingeteilt');
}
function pruefungReviewer(int $id): bool {
    $r=sql("SELECT id,rolle,dienstnummer,gesperrt,muss_passwort_aendern FROM users WHERE id=? AND gesperrt=0 AND muss_passwort_aendern=0",[$id]);
    if(!$r||!hasPanelLoginRole($r[0]['rolle']))return false;
    if($r[0]['rolle']==='Ausbilder'&&!sql('SELECT 1 FROM ausbildung_ausbilder WHERE user_id=? AND aktiv=1',[$id]))return false;
    return (int)(rights($r[0])['ausbildung']??0)>=1;
}
function pruefungGuest(string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/pruefung-gast/'))return false;
    if($method!=='POST'||!in_array($uri,['/api/pruefung-gast/status','/api/pruefung-gast/start','/api/pruefung-gast/speichern','/api/pruefung-gast/abgeben','/api/pruefung-gast/fokus'],true))fail(404,'Nicht gefunden');
    if(!pruefungSchema())fail(503,'Prüfungszentrum nicht eingerichtet');
    $b=body();$token=$b['token']??'';
    if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))fail(404,'Prüfungslink ungültig');
    pruefungFinalizeExpired();$pdo=db();$pdo->beginTransaction();
    try{
        $r=sql("SELECT p.*,v.art,v.titel,v.minuten,v.grenze,v.fragen FROM ausbildung_pruefungen p JOIN ausbildung_pruefung_vorlagen v ON v.id=p.vorlage_id WHERE p.token_hash=? FOR UPDATE",[hash('sha256',$token)]);
        if(!$r||$r[0]['art']==='praxis'||$r[0]['status']==='annulliert')fail(404,'Prüfungslink ungültig');
        $p=$r[0];$id=(int)$p['id'];$action=basename($uri);
        if($p['status']==='bereit'&&strtotime($p['token_ablauf'].' UTC')<=time())fail(410,'Prüfungslink abgelaufen');
        if($action==='start'){
            if($p['status']==='bereit'){
                if(($b['einverstanden']??false)!==true)fail(400,'Prüfungshinweise bestätigen');
                sql("UPDATE ausbildung_pruefungen SET status='laufend',start_am=UTC_TIMESTAMP(6),ende_am=TIMESTAMPADD(MINUTE,?,UTC_TIMESTAMP(6)),revision=revision+1 WHERE id=?",[(int)$p['minuten'],$id]);
            }elseif($p['status']!=='laufend')fail(409,'Prüfung wurde bereits abgegeben');
        }elseif(in_array($action,['speichern','abgeben','fokus'],true)){
            if($p['status']!=='laufend'||strtotime($p['ende_am'].' UTC')<=time())fail(409,'Bearbeitungszeit beendet');
            if($action==='fokus'){
                $event=$b['ereignis']??'';
                if(!in_array($event,['verlassen','zurueck','reload','vollbild_aus','paste'],true))fail(400,'Unbekanntes Ereignis');
                $f=pruefungRead($p['fokus']);$f['events']=$f['events']??[];
                if($event==='verlassen'&&($f['offen']??false)){$pdo->commit();respond(200,['ok'=>true]);}
                if($event==='zurueck'&&!($f['offen']??false)){$pdo->commit();respond(200,['ok'=>true]);}
                if($event==='verlassen'){$f['wechsel']=($f['wechsel']??0)+1;$f['offen']=true;}
                if($event==='zurueck')$f['offen']=false;
                if(count($f['events'])<1000)$f['events'][]=['am'=>gmdate('c'),'ereignis'=>$event];
                sql('UPDATE ausbildung_pruefungen SET fokus=? WHERE id=?',[pruefungJson($f),$id]);
                $pdo->commit();respond(200,['ok'=>true]);
            }
            if(($b['revision']??null)!==(int)$p['revision'])fail(409,'Antwortstand wurde geändert. Bitte neu laden.');
            $answers=pruefungAntworten(pruefungRead($p['fragen']),$b['antworten']??null);
            if($action==='abgeben')sql("UPDATE ausbildung_pruefungen SET antworten=?,status='abgegeben',abgabe_am=UTC_TIMESTAMP(6),revision=revision+1 WHERE id=? AND status='laufend' AND ende_am>UTC_TIMESTAMP(6)",[pruefungJson($answers),$id]);
            else sql("UPDATE ausbildung_pruefungen SET antworten=?,revision=revision+1 WHERE id=? AND status='laufend' AND ende_am>UTC_TIMESTAMP(6)",[pruefungJson($answers),$id]);
        }
        $p=pruefungRow($id);$pdo->commit();
        $out=['titel'=>$p['titel'],'status'=>$p['status'],'minuten'=>(int)$p['minuten'],'revision'=>(int)$p['revision'],'serverZeit'=>time(),'ende'=>$p['ende_am']?strtotime($p['ende_am'].' UTC'):null];
        if($p['status']==='laufend'){
            $out['fragen']=array_map(fn($q)=>array_intersect_key($q,array_flip(['typ','titel','punkte','optionen'])),pruefungRead($p['fragen']));
            $out['antworten']=pruefungRead($p['antworten']);
        }
        if($p['status']==='freigegeben'){$max=array_sum(array_column(pruefungRead($p['fragen']),'punkte'));$out['ergebnis']=(float)$p['ergebnis'];$out['max']=$max;$out['bestanden']=100*(float)$p['ergebnis']/$max>=(float)$p['grenze'];}
        respond(200,$out);
    }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
function dispatchPruefung(array $u,string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/ausbildung/pruefungen'))return false;
    ausbildungRecht($u);$lead=ausbildungLeitung($u);$verwaltung=pruefungVerwaltung($u);$uid=(int)$u['id'];
    $root='/api/ausbildung/pruefungen';
    if($method==='POST'&&$uri===$root.'/setup')pruefungInstall($u);
    if(!pruefungSchema()){
        if($method==='GET'&&$uri===$root)respond(200,['bereit'=>false,'leitung'=>$lead,'admin'=>$u['rolle']==='Administrator']);
        fail(503,'Prüfungsdatenbank noch nicht eingerichtet');
    }
    pruefungFinalizeExpired();
    if($method==='GET'&&$uri===$root){
        $where=$lead?'':' WHERE p.erst=? OR p.zweit=?';
        $rows=sql("SELECT p.id,p.kandidat,p.laufbahn,p.erst,p.zweit,p.status,p.start_am,p.ende_am,p.abgabe_am,p.ergebnis,p.fokus,p.antworten,v.titel,v.art FROM ausbildung_pruefungen p JOIN ausbildung_pruefung_vorlagen v ON v.id=p.vorlage_id".$where." ORDER BY p.id DESC LIMIT 300",$lead?[]:[$uid,$uid]);
        foreach($rows as &$r){$f=pruefungRead($r['fokus']);$r['tabwechsel']=$f['wechsel']??0;$a=pruefungRead($r['antworten']);$r['fragenGesamt']=count($a);$r['bearbeitet']=count(array_filter($a,fn($x)=>is_array($x)?count($x)>0:trim((string)$x)!==''));unset($r['fokus'],$r['antworten']);}unset($r);
        $reviewers=[];foreach(sql("SELECT id,anzeigename,dienstnummer FROM users WHERE gesperrt=0 AND muss_passwort_aendern=0 ORDER BY anzeigename") as $r)if(pruefungReviewer((int)$r['id']))$reviewers[]=$r;
        ausbildungSynchronisierePersonal();
        $trainees=array_map(fn($a)=>array_intersect_key($a,array_flip(['id','name','laufbahn','personalnummer'])),ausbildungAktuelleAnwaerter());
        respond(200,['bereit'=>true,'leitung'=>$lead,'verwaltung'=>$verwaltung,'user'=>$uid,'arten'=>PRUEFUNG_ARTEN,'vorlagen'=>sql('SELECT id,art,titel,minuten,grenze,erstellt_am FROM ausbildung_pruefung_vorlagen ORDER BY id DESC'),'pruefungen'=>$rows,'pruefer'=>$reviewers,'anwaerter'=>$trainees]);
    }
    if($method==='GET'&&preg_match('#^/api/ausbildung/pruefungen/vorlagen/([1-9][0-9]*)$#D',$uri,$vMatch)){
        if(!$verwaltung)fail(403,'Nur Ausbildungsleitung und Leitungsdienst');
        $rows=sql('SELECT id,art,titel,minuten,grenze,fragen FROM ausbildung_pruefung_vorlagen WHERE id=?',[(int)$vMatch[1]]);
        if(!$rows)fail(404,'Vorlage nicht gefunden');
        $v=$rows[0];$v['fragen']=pruefungRead($v['fragen']);respond(200,['vorlage'=>$v]);
    }
    if($method==='POST'&&$uri===$root.'/vorlagen'){
        if(!$verwaltung)fail(403,'Nur Ausbildungsleitung und Leitungsdienst');
        $b=body();[$art,$titel,$minuten,$grenze,$fragen]=pruefungVorlage($b);
        if(isset($b['basis'])){
            $basis=sql('SELECT art FROM ausbildung_pruefung_vorlagen WHERE id=?',[(int)$b['basis']]);
            if(!$basis||$basis[0]['art']!==$art)fail(400,'Bearbeitete Version muss dieselbe Prüfungsart behalten');
        }
        sql('INSERT INTO ausbildung_pruefung_vorlagen(art,titel,minuten,grenze,fragen,erstellt_von) VALUES(?,?,?,?,?,?)',[$art,$titel,$minuten,$grenze,pruefungJson($fragen),$uid]);
        respond(201,['id'=>(int)db()->lastInsertId()]);
    }
    if($method==='POST'&&$uri===$root){
        $b=body();$vid=(int)($b['vorlage']??0);$aid=(int)($b['anwaerter']??0);$first=(int)($b['erst']??0);$second=(int)($b['zweit']??0);
        if($first===$second||(!$lead&&$first!==$uid)||!pruefungReviewer($first)||!pruefungReviewer($second))fail(400,'Zwei verschiedene berechtigte Prüfer erforderlich');
        $v=sql('SELECT * FROM ausbildung_pruefung_vorlagen WHERE id=?',[$vid]);
        $a=sql('SELECT * FROM ausbildung_anwaerter WHERE id=?',[$aid]);
        if(!$v||!$a||!ausbildungPersonalQuelleGueltig($a[0]))fail(400,'Vorlage oder aktueller Anwärter fehlt');
        $v=$v[0];$a=$a[0];$track=$a['laufbahn'];
        if(in_array($v['art'],['pm','praxis'],true)?$track!=='PMA':!in_array($track,['PKA','KKA'],true))fail(400,'Prüfung passt nicht zur Laufbahn');
        $token=bin2hex(random_bytes(32));$practice=$v['art']==='praxis';
        $answers=array_map(fn($q)=>$q['typ']==='text'?'':[],pruefungRead($v['fragen']));
        sql("INSERT INTO ausbildung_pruefungen(vorlage_id,anwaerter_id,kandidat,laufbahn,erst,zweit,status,token_hash,token_ablauf,antworten,bewertung,protokoll,fokus) VALUES(?,?,?,?,?,?,?,?,TIMESTAMPADD(HOUR,24,UTC_TIMESTAMP(6)),?,?,?,?)",
            [$vid,$aid,$a['name'],$track,$first,$second,$practice?'abgegeben':'bereit',hash('sha256',$token),pruefungJson($answers),'[]',pruefungJson([['am'=>gmdate('c'),'aktion'=>'erstellt','user'=>$uid]]),'{"wechsel":0,"events":[]}']);
        respond(201,['id'=>(int)db()->lastInsertId(),'link'=>$practice?null:'/pruefung.html#'.$token]);
    }
    if(!preg_match('#^/api/ausbildung/pruefungen/([1-9][0-9]*)(?:/(korrektur|freigabe|annullieren|link|berichtigen|wiedereroeffnen))?$#D',$uri,$m))fail(404,'Nicht gefunden');
    $id=(int)$m[1];$action=$m[2]??'';
    if($method==='GET'&&$action===''){
        $p=pruefungRow($id);pruefungAccess($p,$u);
        unset($p['token_hash']);
        foreach(['fragen','antworten','bewertung','protokoll','fokus'] as $k)$p[$k]=pruefungRead($p[$k]);
        if(in_array($p['status'],['bereit','laufend'],true)){
            unset($p['fragen'],$p['antworten'],$p['bewertung']);
        }else $p['automatisch']=array_map(fn($q,$i)=>pruefungAuto($q,$p['antworten'][$i]??null),$p['fragen'],array_keys($p['fragen']));
        respond(200,['pruefung'=>$p,'user'=>$uid,'leitung'=>$lead,'verwaltung'=>$verwaltung]);
    }
    if($method!=='POST'||$action==='')fail(405,'Nicht erlaubt');
    $b=body();$pdo=db();$pdo->beginTransaction();
    try{
        $p=pruefungRow($id,true);pruefungAccess($p,$u);
        if(($b['revision']??null)!==(int)$p['revision'])fail(409,'Prüfung wurde zwischenzeitlich geändert. Neu laden.');
        $status=$p['status'];$note=pruefungText($b['notiz']??'',4000,false);$link=null;$history=pruefungHistorie($p,$action,$uid,$note);
        if($action==='link'){
            if($status!=='bereit'||$p['art']==='praxis')fail(409,'Link nur vor Prüfungsbeginn erneuerbar');
            $token=bin2hex(random_bytes(32));sql('UPDATE ausbildung_pruefungen SET token_hash=?,token_ablauf=TIMESTAMPADD(HOUR,24,UTC_TIMESTAMP(6)),revision=revision+1,protokoll=? WHERE id=?',[hash('sha256',$token),pruefungJson($history),$id]);$link='/pruefung.html#'.$token;
        }elseif($action==='annullieren'){
            if(!$lead||in_array($status,['freigegeben','annulliert'],true)||$note==='')fail(403,'Nur Ausbildungsleitung, mit Begründung, vor Freigabe');
            sql("UPDATE ausbildung_pruefungen SET status='annulliert',revision=revision+1,protokoll=? WHERE id=?",[pruefungJson($history),$id]);
        }elseif($action==='berichtigen'||$action==='wiedereroeffnen'){
            if(!$verwaltung)fail(403,'Nur Ausbildungsleitung und Leitungsdienst dürfen die Korrektursperre umgehen');
            if(!pruefungBerichtigungStatus($status))fail(409,'Nur abgegebene Prüfungen können korrigiert werden');
            if($note==='')fail(400,'Begründung für die Berichtigung ist erforderlich');
            $i=count($history)-1;
            $history[$i]['vorher']=['status'=>$status,'ergebnis'=>$p['ergebnis'],'bewertung'=>pruefungRead($p['bewertung'])];
            if($action==='wiedereroeffnen'){
                $history[$i]['nachher']=['status'=>'abgegeben','ergebnis'=>$p['ergebnis'],'bewertung'=>pruefungRead($p['bewertung'])];
                sql("UPDATE ausbildung_pruefungen SET status='abgegeben',revision=revision+1,protokoll=? WHERE id=?",[pruefungJson($history),$id]);
            }else{
                [$result,$total]=pruefungBewertung(pruefungRead($p['fragen']),$b['bewertung']??null);
                $history[$i]['nachher']=['status'=>$status,'ergebnis'=>$total,'bewertung'=>$result];
                sql('UPDATE ausbildung_pruefungen SET bewertung=?,ergebnis=?,revision=revision+1,protokoll=? WHERE id=?',[pruefungJson($result),$total,pruefungJson($history),$id]);
            }
        }elseif($action==='korrektur'){
            $first=$status==='abgegeben'&&$uid===(int)$p['erst'];$second=$status==='erstkorrigiert'&&$uid===(int)$p['zweit'];
            if(!$first&&!$second)fail(403,'Korrektur nicht für diesen Prüfer freigegeben');
            if($second&&($b['zurueck']??false)===true){
                if($note==='')fail(400,'Begründung erforderlich');
                sql("UPDATE ausbildung_pruefungen SET status='abgegeben',revision=revision+1,protokoll=? WHERE id=?",[pruefungJson($history),$id]);
            }else{
                [$result,$total]=pruefungBewertung(pruefungRead($p['fragen']),$b['bewertung']??null);
                $history[count($history)-1]['bewertung']=$result;
                if($second){
                    $old=pruefungRead($p['bewertung']);
                    foreach($result as $i=>$s)if((float)$s['punkte']!==(float)$old[$i]['punkte'])fail(400,'Abweichende Zweitbewertung bitte mit Begründung zurückgeben');
                }
                sql('UPDATE ausbildung_pruefungen SET status=?,bewertung=?,ergebnis=?,revision=revision+1,protokoll=? WHERE id=?',[$first?'erstkorrigiert':'zweitkorrigiert',pruefungJson($result),$total,pruefungJson($history),$id]);
            }
        }elseif($action==='freigabe'){
            if(!$lead||$status!=='zweitkorrigiert')fail(403,'Freigabe erst nach beiden Korrekturen durch Ausbildungsleitung');
            sql("UPDATE ausbildung_pruefungen SET status='freigegeben',revision=revision+1,protokoll=? WHERE id=?",[pruefungJson($history),$id]);
        }
        $pdo->commit();respond(200,['ok'=>true,'link'=>$link]);
    }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
