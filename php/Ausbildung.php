<?php
declare(strict_types=1);
namespace IDV;

/**
 * Ausbildung – eigenständiger API-Bereich (PHP 8.2/MySQL8).
 * Ausbilder-Rollen erhalten niemals Zugriff auf Polizeirat-/Personal-APIs.
 * Alle personenbezogenen Werte bleiben ausschließlich in MySQL beim Hoster.
 */
function ausbildungLeitung(array $u): bool {
    return ($u['rolle']??'')==='Ausbildungsleitung' ||
        ($u['rolle']??'')==='Administrator' ||
        (int)(rights($u)['ausbildung']??0)>=2;
}
function ausbildungRecht(array $u,int $level=1): void {
    if((int)(rights($u)['ausbildung']??0)<$level)
        fail(403,'Kein Ausbildungsrecht');
}
function ausbildungString($value,int $limit,string $label,bool $required=false): string {
    if(!is_string($value)||strlen($value)>$limit||($required&&trim($value)===''))
        fail(400,'Ungültiges Feld: '.$label);
    return trim($value);
}
function ausbildungDatum($value): ?string {
    if($value===null||$value==='')return null;
    if(!is_string($value)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$value))
        fail(400,'Ungültiges Datum');
    $d=\DateTimeImmutable::createFromFormat('!Y-m-d',$value);
    if(!$d||$d->format('Y-m-d')!==$value)fail(400,'Ungültiges Datum');
    return $value;
}
function ausbildungStufe(string $funktion): float {
    return match($funktion) {
        'Ausbildungsleitung','stv. Ausbildungsleitung'=>2.0,
        'Leitungsdienst'=>1.5,
        'Ausbilder gehobener Dienst'=>1.0,
        default=>0.5
    };
}
function ausbildungModule(string $laufbahn): array {
    $track=$laufbahn==='PMA'?'PMA':'PKA';
    return sql('SELECT code,titel,laufbahn FROM ausbildung_module WHERE laufbahn=? AND aktiv=1 ORDER BY sortierung,code',[$track]);
}
/** Pure status rules sourced from the uploaded spreadsheets. */
function ausbildungStatus(string $laufbahn,array $required,array $completed,array $votes): array {
    $required=array_values(array_unique($required));
    $done=count(array_intersect($required,array_values(array_unique($completed))));
    $all=count($required)>0&&$done===count($required);
    $score=0.0;$yes=0;$no=0;
    foreach($votes as $v){
        $weight=(float)($v['gewicht']??0);
        if(($v['stimme']??'')==='Ja'){$score+=$weight;$yes++;}
        elseif(($v['stimme']??'')==='Nein'){$score-=$weight;$no++;}
    }
    $ready=$all&&($laufbahn!=='PMA'||$score>=2.5);
    return ['status'=>!$all?'Module unvollständig':($ready?'Zugelassen':'Nicht bereit'),
        'bereit'=>$ready,'moduleGesamt'=>count($required),'moduleFertig'=>$done,
        'stimmenJa'=>$yes,'stimmenNein'=>$no,'stimmenSaldo'=>round($score,2),
        'schwelle'=>$laufbahn==='PMA'?2.5:null];
}
function ausbildungFortschritt(array $a,bool $details=false): array {
    $id=(int)$a['id'];
    $modules=ausbildungModule((string)$a['laufbahn']);
    $doneRows=sql('SELECT modul_code,abgeschlossen,ausbilder_user_id,aktualisiert FROM ausbildung_abschluesse WHERE anwaerter_id=?',[$id]);
    $done=array_values(array_map(fn($x)=>(string)$x['modul_code'],array_filter($doneRows,fn($x)=>(int)$x['abgeschlossen']===1)));
    $votes=sql('SELECT s.stimme,s.gewicht,s.ausbilder_user_id,s.aktualisiert,u.anzeigename FROM ausbildung_stimmen s JOIN users u ON u.id=s.ausbilder_user_id WHERE s.anwaerter_id=? ORDER BY s.aktualisiert DESC',[$id]);
    $s=ausbildungStatus((string)$a['laufbahn'],array_column($modules,'code'),$done,$votes);
    if($details){
        $s['module']=array_map(static function($m)use($doneRows){
            $record=null;foreach($doneRows as $row)if($row['modul_code']===$m['code']){$record=$row;break;}
            return ['code'=>$m['code'],'titel'=>$m['titel'],
                'abgeschlossen'=>(int)($record['abgeschlossen']??0)===1,
                'bearbeitetVon'=>$record['ausbilder_user_id']??null,
                'aktualisiert'=>$record['aktualisiert']??null];
        },$modules);
        $s['stimmen']=$votes;
    }
    return $s;
}
function ausbildungAnwaerter(int $id,bool $lock=false): array {
    $rows=sql('SELECT * FROM ausbildung_anwaerter WHERE id=?'.($lock?' FOR UPDATE':''),[$id]);
    if(!$rows)fail(404,'Anwärter nicht gefunden');
    return $rows[0];
}
function ausbildungPruefeRevision(array $a,$version): void {
    if(!is_int($version)||$version!==(int)$a['revision'])
        fail(409,'Datensatz wurde zwischenzeitlich geändert. Bitte neu laden.');
}
function ausbildungTrainer(array $u): ?array {
    $rows=sql('SELECT * FROM ausbildung_ausbilder WHERE user_id=? AND aktiv=1 LIMIT 1',[(int)$u['id']]);
    return $rows[0]??null;
}
function ausbildungDarfModul(array $u,string $code): void {
    if(ausbildungLeitung($u))return;
    $trainer=ausbildungTrainer($u);
    $allowed=json_decode((string)($trainer['kompetenzen']??'[]'),true);
    if(!$trainer||!is_array($allowed)||!in_array($code,$allowed,true))
        fail(403,'Dieses Modul ist nicht für dich freigegeben');
}
function ausbildungKompetenzen($value): array {
    if(!is_array($value)||count($value)>30||!array_is_list($value))fail(400,'Ungültige Modulberechtigungen');
    $allowed=array_column(sql('SELECT code FROM ausbildung_module WHERE aktiv=1'),'code');
    $result=[];
    foreach($value as $x){
        if(!is_string($x)||!in_array($x,$allowed,true))fail(400,'Unbekannte Modulkompetenz');
        $result[$x]=true;
    }
    return array_keys($result);
}
function ausbildungTrainerInput(array $b): array {
    $nr=ausbildungString($b['dienstnummer']??null,32,'Dienstnummer',true);
    $name=ausbildungString($b['name']??null,180,'Name',true);
    $kuerzel=ausbildungString($b['kuerzel']??null,16,'Kürzel',true);
    $rang=ausbildungString($b['rang']??'',120,'Rang');
    $funktion=ausbildungString($b['funktion']??'',100,'Funktion');
    $allowed=['Ausbildungsleitung','stv. Ausbildungsleitung','Leitungsdienst',
        'Ausbilder gehobener Dienst','Ausbilder mittlerer Dienst','Ausbilder auf Probe'];
    if(!in_array($funktion,$allowed,true))fail(400,'Unbekannte Ausbilderfunktion');
    $email=ausbildungString($b['email']??'',254,'E-Mail');
    if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail(400,'Ungültige E-Mail-Adresse');
    $notiz=ausbildungString($b['notiz']??'',2000,'Notiz');
    $beginn=ausbildungDatum($b['eintritt']??null);
    $kompetenzen=ausbildungKompetenzen($b['kompetenzen']??[]);
    return compact('nr','name','kuerzel','rang','funktion','email','notiz','beginn','kompetenzen');
}
function ausbildungLink($url): string {
    if(!is_string($url)||strlen($url)>2048)fail(400,'Ungültiger Dokumentlink');
    $url=trim($url);
    if($url==='')return '';
    $parts=parse_url($url);
    if(!is_array($parts)||($parts['scheme']??'')!=='https'||!in_array(strtolower((string)($parts['host']??'')),
        ['docs.google.com','drive.google.com','sites.google.com'],true)||isset($parts['user'])||isset($parts['pass']))
        fail(400,'Nur sichere Google-Docs-, Drive- und Sites-Links erlaubt');
    return $url;
}
/** Called by Api.php for public token-only status; never return names or remarks. */
function ausbildungExtern(): never {
    $input=body();$token=(string)($input['token']??'');
    if(!preg_match('/^[a-f0-9]{64}$/iD',$token))fail(404,'Ansicht nicht verfügbar');
    $rows=sql('SELECT id,laufbahn FROM ausbildung_anwaerter WHERE public_hash=? AND public_aktiv=1 LIMIT 1',
        [hash('sha256',strtolower($token))]);
    if(!$rows)fail(404,'Ansicht nicht verfügbar');
    $a=$rows[0];$s=ausbildungFortschritt($a,true);
    $modules=array_map(fn($m)=>['code'=>$m['code'],'titel'=>$m['titel'],'abgeschlossen'=>$m['abgeschlossen']],$s['module']);
    header('X-Robots-Tag: noindex, nofollow');
    respond(200,['laufbahn'=>$a['laufbahn'],'status'=>$s['status'],'bereit'=>$s['bereit'],
        'moduleGesamt'=>$s['moduleGesamt'],'moduleFertig'=>$s['moduleFertig'],
        'module'=>$modules,'aktualisiert'=>gmdate('c')]);
}
/** Only explicitly approved AuLK materials may be seen without a login. */
function ausbildungOeffentlicheMaterialien(): never {
    header('X-Robots-Tag: noindex, nofollow');
    $rows=sql("SELECT id,modul_code,titel,typ,url,
        CASE WHEN dateipfad IS NULL THEN 0 ELSE 1 END AS datei
        FROM ausbildung_materialien WHERE aktiv=1 AND public_aktiv=1
        ORDER BY modul_code,titel,id");
    respond(200,['materialien'=>$rows]);
}
function dispatchAusbildung(array $u,string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/ausbildung/'))return false;
    ausbildungRecht($u);
    require_once __DIR__.'/AusbildungSetup.php';
    if(dispatchAusbildungSetup($u,$method,$uri))return true;
    if(!ausbildungSchemaStatus()['bereit'])
        fail(503,'Die Ausbildungsdatenbank ist noch nicht vollständig eingerichtet. '
            .'Ein Administrator kann sie im Ausbildungsbereich nach einer Sicherung einrichten.');
    if($method==='GET'&&$uri==='/api/ausbildung/bootstrap'){
        $leitung=ausbildungLeitung($u);
        $module=sql('SELECT code,laufbahn,titel FROM ausbildung_module WHERE aktiv=1 ORDER BY laufbahn,sortierung');
        $trainers=sql('SELECT a.*,u.gesperrt,u.rolle,u.dienstnummer AS login_dienstnummer FROM ausbildung_ausbilder a JOIN users u ON u.id=a.user_id WHERE a.aktiv=1 ORDER BY a.name');
        if(!$leitung)foreach($trainers as &$t){unset($t['email'],$t['notiz']);}unset($t);
        $trainees=sql('SELECT * FROM ausbildung_anwaerter ORDER BY laufbahn,name,id');
        foreach($trainees as &$a)$a['fortschritt']=ausbildungFortschritt($a);unset($a);
        $materials=sql('SELECT id,modul_code,titel,typ,url,public_aktiv,CASE WHEN dateipfad IS NULL THEN 0 ELSE 1 END AS datei FROM ausbildung_materialien WHERE aktiv=1 ORDER BY modul_code,titel');
        $me=ausbildungTrainer($u);
        respond(200,['leitung'=>$leitung,'user'=>['id'=>(int)$u['id'],'rolle'=>$u['rolle'],
            'name'=>userName($u)],'module'=>$module,'ausbilder'=>$trainers,
            'anwaerter'=>$trainees,'materialien'=>$materials,
            'eigeneKompetenzen'=>json_decode((string)($me['kompetenzen']??'[]'),true)??[]]);
    }
    if($uri==='/api/ausbildung/ausbilder'&&$method==='POST'){
        ausbildungRecht($u,2);
        $b=body();$v=ausbildungTrainerInput($b);
        $pw=$b['startpasswort']??'';
        if(!is_string($pw)||strlen($pw)<8||strlen($pw)>4096)
            fail(400,'Für jeden neuen Ausbilderzugang ist ein Startpasswort mit mindestens 8 Zeichen erforderlich');
        // Strikte Trennung: Eine Ausbildungs-DN kann mit einer bestehenden
        // Personal-DN übereinstimmen. Der Login bekommt den Namespace AUS-.
        // Niemand greift auf bestehende Polizeikonten zu.
        $ausbildungsLogin='AUS-'.$v['nr'];
        if(sql('SELECT id FROM users WHERE dienstnummer=? LIMIT 1',[$ausbildungsLogin])
            ||sql('SELECT id FROM ausbildung_ausbilder WHERE dienstnummer=? AND aktiv=1 LIMIT 1',[$v['nr']]))
            fail(409,'Für diese Dienstnummer existiert bereits ein Ausbildungszugang. '
                .'Bestehende Konten bleiben unverändert.');
        db()->beginTransaction();
        try{
            sql('INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern,gesperrt) VALUES(?,?,\'Ausbilder\',?,1,0)',
                [$ausbildungsLogin,$v['name'],password_hash($pw,PASSWORD_BCRYPT,['cost'=>12])]);
            $uid=(int)db()->lastInsertId();
            sql('INSERT INTO ausbildung_ausbilder(user_id,dienstnummer,name,kuerzel,rang,funktion,eintritt,email,notiz,gewicht,kompetenzen,aktiv) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)',
                [$uid,$v['nr'],$v['name'],$v['kuerzel'],$v['rang'],$v['funktion'],$v['beginn'],$v['email'],$v['notiz'],
                 ausbildungStufe($v['funktion']),json_encode($v['kompetenzen'],JSON_THROW_ON_ERROR)]);
            auditAction($u,'Neuen eigenständigen Ausbilderzugang angelegt: ID '.$uid,'add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/ausbilder/([1-9]\d*)$#D',$uri,$m)){
        ausbildungRecht($u,2);$id=cleanId($m[1]);
        $row=sql('SELECT a.user_id,u.rolle FROM ausbildung_ausbilder a JOIN users u ON u.id=a.user_id WHERE a.id=? AND a.aktiv=1',[$id]);
        if(!$row)fail(404,'Ausbilder nicht gefunden');
        $target=(int)$row[0]['user_id'];
        if($method==='PATCH'){
            $v=ausbildungTrainerInput(body());
            if($target===(int)$u['id'])fail(400,'Eigenes Leitungsprofil hier nicht bearbeiten');
            sql('UPDATE ausbildung_ausbilder SET name=?,kuerzel=?,rang=?,funktion=?,eintritt=?,email=?,notiz=?,gewicht=?,kompetenzen=?,revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',
                [$v['name'],$v['kuerzel'],$v['rang'],$v['funktion'],$v['beginn'],$v['email'],$v['notiz'],
                 ausbildungStufe($v['funktion']),json_encode($v['kompetenzen'],JSON_THROW_ON_ERROR),$id]);
            auditAction($u,'Ausbilderprofil geändert: ID '.$id);
            respond(200,['ok'=>true]);
        }
        if($method==='DELETE'){
            if($target===(int)$u['id']||$row[0]['rolle']!=='Ausbilder')
                fail(403,'Bestehende Polizeikonten werden von der Ausbildungsverwaltung nicht verändert');
            db()->beginTransaction();
            try {
                sql('UPDATE ausbildung_ausbilder SET aktiv=0,revision=revision+1 WHERE id=?',[$id]);
                // Sperrt ausschließlich neu angelegte, reine Ausbilderkonten.
                // Rollen und Berechtigungen bestehender Polizeikonten bleiben unangetastet.
                sql('UPDATE users SET gesperrt=1 WHERE id=? AND rolle=\'Ausbilder\'',[$target]);
                sql('DELETE FROM sessions WHERE user_id=?',[$target]);
                auditAction($u,'Ausbilderzugang entzogen: ID '.$target,'del');
                db()->commit();
            }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
            respond(200,['ok'=>true]);
        }
    }
    if($uri==='/api/ausbildung/anwaerter'&&$method==='POST'){
        ausbildungRecht($u,2);$b=body();
        $name=ausbildungString($b['name']??null,180,'Name',true);
        $laufbahn=(string)($b['laufbahn']??'');
        if(!in_array($laufbahn,['PMA','PKA','KKA'],true))fail(400,'Ungültige Laufbahn');
        $nr=$b['personalnummer']??null;
        if($nr!==null&&(!is_int($nr)||$nr<1||$nr>9999999))fail(400,'Ungültige Dienstnummer');
        $neben=ausbildungString($b['nebenberuf']??'',60,'Nebenberuf');
        $beginn=ausbildungDatum($b['beginn']??null);
        $bem=ausbildungString($b['bemerkung']??'',2000,'Bemerkung');
        sql('INSERT INTO ausbildung_anwaerter(personalnummer,name,laufbahn,nebenberuf,beginn,bemerkung,erstellt_von) VALUES(?,?,?,?,?,?,?)',
            [$nr,$name,$laufbahn,$neben,$beginn,$bem,(int)$u['id']]);
        $id=(int)db()->lastInsertId();
        auditAction($u,'Anwärter angelegt: ID '.$id,'add');
        respond(200,['id'=>$id]);
    }
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)$#D',$uri,$m)){
        $id=cleanId($m[1]);
        if($method==='GET'){
            $a=ausbildungAnwaerter($id);
            respond(200,['anwaerter'=>$a,'fortschritt'=>ausbildungFortschritt($a,true)]);
        }
        if($method==='PATCH'){
            ausbildungRecht($u,2);$b=body();$a=ausbildungAnwaerter($id);
            ausbildungPruefeRevision($a,$b['revision']??null);
            $name=ausbildungString($b['name']??null,180,'Name',true);
            $neben=ausbildungString($b['nebenberuf']??'',60,'Nebenberuf');
            $beg=ausbildungDatum($b['beginn']??null);
            $bem=ausbildungString($b['bemerkung']??'',2000,'Bemerkung');
            $rsa=$b['rsa']??false;
            if(!is_bool($rsa))fail(400,'Ungültiger RSA-Status');
            $stmt=db()->prepare('UPDATE ausbildung_anwaerter SET name=?,nebenberuf=?,beginn=?,bemerkung=?,rsa=?,revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=? AND revision=?');
            $stmt->execute([$name,$neben,$beg,$bem,$rsa?1:0,$id,$b['revision']]);
            if($stmt->rowCount()!==1)fail(409,'Anwärter wurde zwischenzeitlich geändert');
            auditAction($u,'Anwärter aktualisiert: ID '.$id);
            respond(200,['ok'=>true]);
        }
    }
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)/modul/([A-Z]{2}\.[0-9]+)$#D',$uri,$m)&&$method==='PUT'){
        $id=cleanId($m[1]);$code=$m[2];$b=body();
        if(!is_bool($b['abgeschlossen']??null))fail(400,'Abschluss muss Ja oder Nein sein');
        ausbildungDarfModul($u,$code);
        db()->beginTransaction();
        try {
            $a=ausbildungAnwaerter($id,true);ausbildungPruefeRevision($a,$b['revision']??null);
            if(!in_array($code,array_column(ausbildungModule((string)$a['laufbahn']),'code'),true))
                fail(400,'Modul gehört nicht zu dieser Laufbahn');
            sql('INSERT INTO ausbildung_abschluesse(anwaerter_id,modul_code,ausbilder_user_id,abgeschlossen) VALUES(?,?,?,?)
                ON DUPLICATE KEY UPDATE ausbilder_user_id=VALUES(ausbilder_user_id),abgeschlossen=VALUES(abgeschlossen),aktualisiert=UTC_TIMESTAMP(6)',
                [$id,$code,(int)$u['id'],$b['abgeschlossen']?1:0]);
            sql('UPDATE ausbildung_anwaerter SET revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',[$id]);
            auditAction($u,'Ausbildungsmodul '.$code.' für Anwärter-ID '.$id.($b['abgeschlossen']?' abgeschlossen':' zurückgesetzt'));
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)/stimme$#D',$uri,$m)&&$method==='PUT'){
        $id=cleanId($m[1]);$b=body();$vote=$b['stimme']??null;
        if(!in_array($vote,['Ja','Nein',null],true))fail(400,'Ungültige Stimme');
        $trainer=ausbildungTrainer($u);
        if(!$trainer&&!ausbildungLeitung($u))fail(403,'Nur aktive Ausbilder stimmen ab');
        $weight=$trainer?(float)$trainer['gewicht']:2.0;
        db()->beginTransaction();
        try {
            $a=ausbildungAnwaerter($id,true);ausbildungPruefeRevision($a,$b['revision']??null);
            if($a['laufbahn']!=='PMA')fail(400,'Der Excel-Stimmenmonitor gilt nur für PMA');
            if($vote===null)sql('DELETE FROM ausbildung_stimmen WHERE anwaerter_id=? AND ausbilder_user_id=?',[$id,(int)$u['id']]);
            else sql('INSERT INTO ausbildung_stimmen(anwaerter_id,ausbilder_user_id,stimme,gewicht) VALUES(?,?,?,?)
                ON DUPLICATE KEY UPDATE stimme=VALUES(stimme),gewicht=VALUES(gewicht),aktualisiert=UTC_TIMESTAMP(6)',
                [$id,(int)$u['id'],$vote,$weight]);
            sql('UPDATE ausbildung_anwaerter SET revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',[$id]);
            auditAction($u,'PMA-Stimme aktualisiert: Anwärter-ID '.$id);
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)/link$#D',$uri,$m)){
        ausbildungRecht($u,2);$id=cleanId($m[1]);
        if($method==='POST'){
            $a=ausbildungAnwaerter($id);
            $token=bin2hex(random_bytes(32));
            sql('UPDATE ausbildung_anwaerter SET public_hash=?,public_aktiv=1 WHERE id=?',
                [hash('sha256',$token),$id]);
            auditAction($u,'Externen Ausbildungslink für Anwärter-ID '.$id.' erneuert');
            respond(200,['pfad'=>'/ausbildung-status.html#'.$token]);
        }
        if($method==='DELETE'){
            ausbildungAnwaerter($id);
            sql('UPDATE ausbildung_anwaerter SET public_hash=NULL,public_aktiv=0 WHERE id=?',[$id]);
            auditAction($u,'Externen Ausbildungslink für Anwärter-ID '.$id.' deaktiviert');
            respond(200,['ok'=>true]);
        }
    }
    if($method==='POST'&&$uri==='/api/ausbildung/materialien/upload'){
        require_once __DIR__.'/AusbildungFiles.php';
        ausbildungDateiUpload($u);
    }
    if($method==='GET'&&preg_match('#^/api/ausbildung/materialien/([1-9]\\d*)/datei$#D',$uri,$fileMatch)){
        require_once __DIR__.'/AusbildungFiles.php';
        ausbildungDateiDownload($u,cleanId($fileMatch[1]));
    }
    if($uri==='/api/ausbildung/materialien'&&$method==='POST'){
        ausbildungRecht($u,2);$b=body();
        $titel=ausbildungString($b['titel']??null,200,'Titel',true);
        $typ=ausbildungString($b['typ']??'Präsentation',50,'Typ',true);
        $code=$b['modul_code']??null;
        if($code!==null&&!in_array($code,array_column(sql('SELECT code FROM ausbildung_module'),'code'),true))
            fail(400,'Unbekanntes Modul');
        $url=ausbildungLink($b['url']??'');
        if($url==='')fail(400,'Bitte einen Google-Dokumentlink hinterlegen');
        sql('INSERT INTO ausbildung_materialien(modul_code,titel,typ,url) VALUES(?,?,?,?)',[$code,$titel,$typ,$url]);
        auditAction($u,'Ausbildungsunterlage verlinkt: '.$titel,'add');
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/materialien/([1-9]\\d*)/freigabe$#D',$uri,$m)&&$method==='PATCH'){
        ausbildungRecht($u,2);
        $id=cleanId($m[1]);
        $b=body();
        if(!is_bool($b['public_aktiv']??null))fail(400,'Freigabe muss Ja oder Nein sein');
        if(!sql('SELECT 1 FROM ausbildung_materialien WHERE id=? AND aktiv=1',[$id]))
            fail(404,'Ausbildungsunterlage nicht gefunden');
        sql('UPDATE ausbildung_materialien SET public_aktiv=?,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',
            [$b['public_aktiv']?1:0,$id]);
        auditAction($u,'AuLK-Unterlage '.($b['public_aktiv']?'öffentlich freigegeben':'gesperrt').': ID '.$id);
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/materialien/([1-9]\d*)$#D',$uri,$m)&&$method==='DELETE'){
        ausbildungRecht($u,2);$id=cleanId($m[1]);
        sql('UPDATE ausbildung_materialien SET aktiv=0 WHERE id=?',[$id]);
        auditAction($u,'Ausbildungsunterlage entfernt: ID '.$id,'del');
        respond(200,['ok'=>true]);
    }
    return false;
}
