<?php
declare(strict_types=1);
namespace IDV;

require_once __DIR__.'/AusbildungPersonal.php';

/**
 * Ausbildung – eigenständiger API-Bereich (PHP 8.2/MySQL8).
 * Ausbilder-Rollen erhalten niemals Zugriff auf Polizeirat-/Personal-APIs.
 * Alle personenbezogenen Werte bleiben ausschließlich in MySQL beim Hoster.
 */
function ausbildungLeitung(array $u): bool {
    return (int)(rights($u)['ausbildung']??0)>=2;
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
/** Feste Stimmgewichte nach der tatsächlichen Funktion – niemals nach dem Rang. */
function ausbildungStufe(string $funktion): float {
    return match($funktion) {
        'Ausbildungsleitung','stv. Ausbildungsleitung','Administrator'=>2.0,
        'Leitungsdienst'=>1.5,
        'Ausbilder auf Probe'=>0.5,
        'Ausbilder gehobener Dienst','Ausbilder mittlerer Dienst','Ausbilder'=>1.0,
        default=>1.0
    };
}
/**
 * Existierende Stimmabgaben werden nach der Ausbilderfunktion gewertet.
 * Historische Stimmdatensätze müssen dafür nicht geändert oder gelöscht werden.
 */
function ausbildungStimmgewicht(array $stimme): float {
    $funktion=$stimme['funktion']??null;
    if(is_string($funktion) && $funktion!=='')
        return ausbildungStufe($funktion);
    $rolle=(string)($stimme['rolle']??'');
    if(in_array($rolle,['Administrator','Ausbildungsleitung','Leitungsdienst'],true))
        return ausbildungStufe($rolle);
    // Historische Stimmen ohne vorhandenes Ausbilderprofil behalten ihre
    // gespeicherte Gewichtung, statt einen unbekannten Rang zu unterstellen.
    return (float)($stimme['gespeichert_gewicht']??$stimme['gewicht']??0);
}
/** Verhindert Fehler bei schrittweise bereitgestellten MySQL-Migrationen. */
function ausbildungStimmenDetailsVerfuegbar(): bool {
    static $bereit=null;
    if($bereit!==null)return $bereit;
    $row=sql("SELECT COUNT(DISTINCT COLUMN_NAME) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_stimmen'
          AND COLUMN_NAME IN ('anlass','streifenfahrt_datum','bemerkung')");
    return $bereit=(int)($row[0]['n']??0)===3;
}
/** Validierung für neue Stimmen; die Altstimmen bleiben ohne Umschreiben gültig. */
function ausbildungStimmDetailsPruefen(array $body,string $vote): array {
    $anlass=ausbildungString($body['anlass']??null,32,'Anlass',true);
    if(!in_array($anlass,['Streifenfahrt','Sonstige Leistungen'],true))
        fail(400,'Bitte Streifenfahrt oder Sonstige Leistungen als Anlass wählen.');
    $bemerkung=ausbildungString($body['bemerkung']??'',2000,'Bemerkung');
    if($vote==='Nein'&&$bemerkung==='')
        fail(400,'Bei einer Nein-Stimme ist eine Bemerkung mit Begründung verpflichtend.');
    $date=ausbildungDatum($body['streifenfahrt_datum']??null);
    if($vote==='Ja'&&$anlass==='Streifenfahrt'&&$date===null)
        fail(400,'Bei einer Ja-Stimme für eine Streifenfahrt muss deren Datum angegeben werden.');
    if($anlass!=='Streifenfahrt')$date=null;
    return ['anlass'=>$anlass,'streifenfahrt_datum'=>$date,'bemerkung'=>$bemerkung];
}
function ausbildungModule(string $laufbahn): array {
    $track=$laufbahn==='PMA'?'PMA':'PKA';
    return sql('SELECT code,titel,laufbahn FROM ausbildung_module WHERE laufbahn=? AND aktiv=1 ORDER BY sortierung,code',[$track]);
}
/** Pure status rules sourced from the uploaded spreadsheets. */
function ausbildungStatus(string $laufbahn,array $required,array $completed,array $votes,bool $rsa=false): array {
    $required=array_values(array_unique($required));
    $done=count(array_intersect($required,array_values(array_unique($completed))));
    $all=count($required)>0&&$done===count($required);
    $score=0.0;$yes=0;$no=0;$jaPunkte=0.0;$neinPunkte=0.0;
    foreach($votes as $v){
        $weight=(float)($v['gewicht']??0);
        if(($v['stimme']??'')==='Ja'){$score+=$weight;$jaPunkte+=$weight;$yes++;}
        elseif(($v['stimme']??'')==='Nein'){$score-=$weight;$neinPunkte+=$weight;$no++;}
    }
    $rsaPflicht=$laufbahn==='PMA';
    $ready=$all&&(!$rsaPflicht||($rsa&&$score>=2.5));
    return ['status'=>!$all?'Module unvollständig':($ready?'Zugelassen':($rsaPflicht&&!$rsa?'RSA ausstehend':'Nicht bereit')),
        'rsaPflicht'=>$rsaPflicht,'rsa'=>$rsaPflicht&&$rsa,
        'bereit'=>$ready,'moduleGesamt'=>count($required),'moduleFertig'=>$done,
        'stimmenJa'=>$yes,'stimmenNein'=>$no,'stimmenSaldo'=>round($score,2),
        'jaPunkte'=>round($jaPunkte,2),'neinPunkte'=>round($neinPunkte,2),
        'schwelle'=>$laufbahn==='PMA'?2.5:null];
}
function ausbildungFortschritt(array $a,bool $details=false): array {
    $id=(int)$a['id'];
    $modules=ausbildungModule((string)$a['laufbahn']);
    $doneRows=sql("SELECT c.modul_code,c.abgeschlossen,c.ausbilder_user_id,c.aktualisiert,
        COALESCE(NULLIF(t.name,''),NULLIF(u.anzeigename,'')) AS ausbilder_name
        FROM ausbildung_abschluesse c
        LEFT JOIN users u ON u.id=c.ausbilder_user_id
        LEFT JOIN ausbildung_ausbilder t ON t.user_id=c.ausbilder_user_id
        WHERE c.anwaerter_id=?",[$id]);
    $done=array_values(array_map(fn($x)=>(string)$x['modul_code'],array_filter($doneRows,fn($x)=>(int)$x['abgeschlossen']===1)));
    $stimmfelder=ausbildungStimmenDetailsVerfuegbar()
        ? 's.anlass,s.streifenfahrt_datum,s.bemerkung'
        : 'NULL AS anlass,NULL AS streifenfahrt_datum,NULL AS bemerkung';
    $votes=sql('SELECT s.stimme,s.gewicht AS gespeichert_gewicht,s.ausbilder_user_id,
        s.aktualisiert,COALESCE(NULLIF(t.name,\'\'),u.anzeigename) AS anzeigename,u.rolle,t.funktion,'.$stimmfelder.'
        FROM ausbildung_stimmen s
        JOIN users u ON u.id=s.ausbilder_user_id
        LEFT JOIN ausbildung_ausbilder t ON t.user_id=s.ausbilder_user_id
        WHERE s.anwaerter_id=? ORDER BY s.aktualisiert DESC',[$id]);
    foreach($votes as &$vote){
        $vote['gewicht']=ausbildungStimmgewicht($vote);
        unset($vote['gespeichert_gewicht'],$vote['rolle'],$vote['funktion']);
    }
    unset($vote);
    // Read the current personnel value even for a public token with an old mirror.
    $source=$a['laufbahn']==='PMA'?ausbildungPersonalQuelleLesen($a):null;
    $rsa=ausbildungRsaErhalten($source['rsa']??null);
    $s=ausbildungStatus((string)$a['laufbahn'],array_column($modules,'code'),$done,$votes,$rsa);
    if($details){
        $s['module']=array_map(static function($m)use($doneRows){
            $record=null;foreach($doneRows as $row)if($row['modul_code']===$m['code']){$record=$row;break;}
            return ['code'=>$m['code'],'titel'=>$m['titel'],
                'abgeschlossen'=>(int)($record['abgeschlossen']??0)===1,
                'bearbeitetVon'=>$record['ausbilder_user_id']??null,
                'ausbilderName'=>$record['ausbilder_name']??null,
                'aktualisiert'=>$record['aktualisiert']??null];
        },$modules);
        $s['stimmen']=$votes;
    }
    return $s;
}
function ausbildungAnwaerter(int $id,bool $lock=false): array {
    $rows=sql('SELECT * FROM ausbildung_anwaerter WHERE id=?'.($lock?' FOR UPDATE':''),[$id]);
    if(!$rows || !ausbildungPersonalQuelleGueltig($rows[0]))
        fail(404,'Anwärter nicht mehr im aktiven Personalstamm vorhanden');
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
function ausbildungTrainerPersonal(?int $nr=null,bool $lock=false): array {
    $ranks=['Polizeiobermeister','Polizeihauptmeister','Polizeihauptmeister AZ','Polizeihauptmeister mit Amtszulage','Polizeikommissar','Kriminalkommissar','Polizeioberkommissar','Kriminaloberkommissar','Polizeihauptkommissar','Kriminalhauptkommissar','Polizeihauptkommissar A12','Erster Polizeihauptkommissar','Polizeiratanwärter','Polizeirat','Polizeioberrat','Polizeidirektor','Leitender Polizeidirektor','Polizeivizepräsident','Polizeipräsident'];
    $cols=array_column(sql("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='personal' AND COLUMN_NAME IN ('email','e_mail','mail','email_adresse')"),'COLUMN_NAME');
    $emailExpr="''";
    foreach(['email','e_mail','mail','email_adresse'] as $col)if(in_array($col,$cols,true)){$emailExpr='p.`'.$col.'`';break;}
    $rows=sql("SELECT p.personalnummer,p.vorname,p.nachname,p.dienstgrad,".$emailExpr." AS email,
        COALESCE((SELECT COUNT(*) FROM personalnummer_neubelegungen h WHERE h.personalnummer=p.personalnummer),0) AS belegungen
        FROM personal p WHERE p.administrativ_geloescht_am IS NULL AND p.status IN ('Aktiv','Abgemeldet')".
        ($nr!==null?' AND p.personalnummer=?':'')." ORDER BY p.nachname,p.vorname,p.personalnummer".($lock?' FOR UPDATE':''),$nr!==null?[$nr]:[]);
    $result=[];
    foreach($rows as $p){
        if(!in_array(trim((string)$p['dienstgrad']),$ranks,true))continue;
        $first=trim((string)$p['vorname']);$last=trim((string)$p['nachname']);$n=(int)$p['personalnummer'];
        if($n<1||$first===''||$last===''||$first==='-'||$last==='-')continue;
        preg_match('/^./u',$first,$a);preg_match('/^./u',$last,$b);
        $initials=($a[0]??'').($b[0]??'');
        $initials=function_exists('mb_strtoupper')?mb_strtoupper($initials,'UTF-8'):strtoupper(strtr($initials,['ä'=>'Ä','ö'=>'Ö','ü'=>'Ü','ß'=>'ẞ']));
        $email=trim((string)($p['email']??''));
        $result[]=['personalnummer'=>$n,'dienstnummer'=>str_pad((string)$n,2,'0',STR_PAD_LEFT),'name'=>$first.' '.$last,
            'kuerzel'=>$initials,'rang'=>(string)$p['dienstgrad'],'email'=>filter_var($email,FILTER_VALIDATE_EMAIL)?$email:'',
            'quelle'=>ausbildungPersonalQuelle($n,(int)$p['belegungen'])];
    }
    return $result;
}
function ausbildungTrainerKandidaten(): array {
    $used=[];
    foreach(sql('SELECT dienstnummer FROM ausbildung_ausbilder WHERE aktiv=1') as $r){
        $dn=(string)$r['dienstnummer'];if(ctype_digit($dn))$used[(int)$dn]=true;
    }
    foreach(sql("SELECT dienstnummer FROM users WHERE dienstnummer REGEXP '^AUS-[0-9]+$'") as $r)
        $used[(int)substr((string)$r['dienstnummer'],4)]=true;
    return array_values(array_filter(ausbildungTrainerPersonal(),fn($p)=>!isset($used[$p['personalnummer']])));
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
    $rows=sql('SELECT id,laufbahn,personalnummer,personal_quelle FROM ausbildung_anwaerter WHERE public_hash=? AND public_aktiv=1 LIMIT 1',
        [hash('sha256',strtolower($token))]);
    if(!$rows)fail(404,'Ansicht nicht verfügbar');
    $a=$rows[0];
    if(!ausbildungPersonalQuelleGueltig($a))fail(404,'Diese Ausbildungsansicht ist nicht mehr aktiv');
    $s=ausbildungFortschritt($a,true);
    $modules=array_map(fn($m)=>['code'=>$m['code'],'titel'=>$m['titel'],'abgeschlossen'=>$m['abgeschlossen']],$s['module']);
    header('X-Robots-Tag: noindex, nofollow');
    $result=['laufbahn'=>$a['laufbahn'],'status'=>$s['status'],'bereit'=>$s['bereit'],
        'moduleGesamt'=>$s['moduleGesamt'],'moduleFertig'=>$s['moduleFertig'],
        'module'=>$modules,'aktualisiert'=>gmdate('c')];
    if($a['laufbahn']==='PMA'){
        $result['stimmenAnzahl']=$s['stimmenJa']+$s['stimmenNein'];
        $result['rsa']=$s['rsa'];
    }
    respond(200,$result);
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
/** One-time curriculum content adjustment, not a schema migration.
 * Keep historical hiring-process records separate from the new onboarding.
 * Previously PM.1 was a combined onboarding/funk module, so its recorded
 * completion is retained for both successor topics. Never infer onboarding
 * from the old PM.0 hiring process.
 */
function ausbildungOnboardingAktualisieren(array $u): void {
    $old=sql("SELECT titel FROM ausbildung_module WHERE code='PM.0'");
    if(($old[0]['titel']??null)!=='Einstellungsprozess')return;
    db()->beginTransaction();
    try{
        $rows=sql("SELECT code,titel FROM ausbildung_module WHERE code IN ('PM.0','PM.1') ORDER BY code FOR UPDATE");
        $titles=array_column($rows,'titel','code');
        if(($titles['PM.0']??null)!=='Einstellungsprozess'){db()->commit();return;}
        if(($titles['PM.1']??null)!=='Onboarding')throw new RuntimeException('Unerwartete Modulstruktur');
        sql("INSERT INTO ausbildung_module(code,laufbahn,titel,sortierung,aktiv)
             VALUES('PM.0-ALT','PMA','Einstellungsprozess (Archiv)',0,0)");
        // Retain old completion authors, timestamps and status, but do not count them.
        sql("UPDATE ausbildung_abschluesse SET modul_code='PM.0-ALT' WHERE modul_code='PM.0'");
        sql("INSERT INTO ausbildung_abschluesse(anwaerter_id,modul_code,ausbilder_user_id,abgeschlossen,aktualisiert)
             SELECT anwaerter_id,'PM.0',ausbilder_user_id,abgeschlossen,aktualisiert
             FROM ausbildung_abschluesse WHERE modul_code='PM.1'");
        // Preserve material IDs, original files and room references.
        sql("UPDATE ausbildung_materialien SET modul_code='PM.0-ALT',aktiv=0,public_aktiv=0 WHERE modul_code='PM.0'");
        sql("UPDATE ausbildung_materialien SET modul_code='PM.0',
             titel=CASE WHEN titel LIKE 'PM.1%' THEN CONCAT('PM.0',SUBSTRING(titel,5)) ELSE titel END
             WHERE modul_code='PM.1' AND (url LIKE 'https://docs.google.com/presentation/d/1qwrE5Irm08rV1iymltkkKwPJ496vlT_-BKP7z4oHTb8/%'
                 OR LOWER(titel) LIKE '%onboarding%')");
        if(ausbildungSchemaStatus()['unterrichtBereit']){
            sql("UPDATE ausbildung_unterricht SET modul_code='PM.0-ALT',beendet=1,angebot=NULL,antwort=NULL,aktualisiert=UTC_TIMESTAMP(6) WHERE modul_code='PM.0'");
            sql("UPDATE ausbildung_unterricht r JOIN ausbildung_materialien m ON m.id=r.material_id
                 SET r.modul_code='PM.0' WHERE r.modul_code='PM.1' AND m.modul_code='PM.0'");
        }
        // Keep former combined PM.1 teaching permissions for onboarding.
        // Remove the old hiring-only PM.0 permission where PM.1 was not granted.
        foreach(sql('SELECT id,kompetenzen FROM ausbildung_ausbilder FOR UPDATE') as $trainer){
            $codes=json_decode((string)$trainer['kompetenzen'],true);
            if(!is_array($codes))continue;
            $next=array_values(array_filter($codes,fn($code)=>$code!=='PM.0'));
            if(in_array('PM.1',$codes,true))$next[]='PM.0';
            $next=array_values(array_unique($next));
            if($next!==$codes)sql('UPDATE ausbildung_ausbilder SET kompetenzen=?,revision=revision+1 WHERE id=?',
                [json_encode($next,JSON_THROW_ON_ERROR),$trainer['id']]);
        }
        sql("UPDATE ausbildung_module SET titel='Onboarding' WHERE code='PM.0'");
        sql("UPDATE ausbildung_module SET titel='Funkwesen, Funkstatus & Einsatztablet' WHERE code='PM.1'");
        sql("UPDATE ausbildung_anwaerter SET revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE laufbahn='PMA'");
        auditAction($u,'Ausbildung: PM.0 Onboarding, PM.1 Funkwesen; Einstellungsprozess archiviert','edit');
        db()->commit();
    }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function dispatchAusbildung(array $u,string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/ausbildung/'))return false;
    ausbildungRecht($u);
    require_once __DIR__.'/AusbildungSetup.php';
    if(dispatchAusbildungSetup($u,$method,$uri))return true;
    if(!ausbildungSchemaStatus()['bereit'])
        fail(503,'Die Ausbildungsdatenbank ist noch nicht vollständig eingerichtet. '
            .'Ein Administrator kann sie im Ausbildungsbereich nach einer Sicherung einrichten.');
    if(!ausbildungSchemaStatus()['personalbindungBereit'])
        fail(503,'Die Verbindung zum zentralen Personalstamm muss nach einer Datenbanksicherung noch eingerichtet werden.');
    ausbildungOnboardingAktualisieren($u);
    if($uri==='/api/ausbildung/bootstrap'||str_starts_with($uri,'/api/ausbildung/anwaerter/'))
        ausbildungSynchronisierePersonal();
    // Unterrichtssitzungen sind innerhalb der geschützten Ausbildungs-API.
    require_once __DIR__.'/AusbildungUnterricht.php';
    if(dispatchUnterrichtTrainer($u,$method,$uri))return true;
    if($method==='GET'&&$uri==='/api/ausbildung/bootstrap'){
        $leitung=ausbildungLeitung($u);
        $module=sql('SELECT code,laufbahn,titel FROM ausbildung_module WHERE aktiv=1 ORDER BY laufbahn,sortierung');
        $trainers=sql('SELECT a.*,u.gesperrt,u.rolle,u.dienstnummer AS login_dienstnummer FROM ausbildung_ausbilder a JOIN users u ON u.id=a.user_id WHERE a.aktiv=1 ORDER BY a.name');
        foreach($trainers as &$t){
            $t['gewicht']=ausbildungStufe((string)$t['funktion']);
            if(!$leitung)unset($t['email'],$t['notiz']);
        }
        unset($t);
        $trainees=ausbildungAktuelleAnwaerter();
        foreach($trainees as &$a)$a['fortschritt']=ausbildungFortschritt($a);unset($a);
        // Kein erneuter Datei-Upload: die Präsentationen aus der gelieferten ZIP
        // sind mit den bereits vorhandenen Google-Slides-Originalen abgeglichen.
        // Ergänzt nur fehlende, private Verweise (kein Überschreiben/Freigeben).
        if($leitung){
            require_once __DIR__.'/AusbildungDecks.php';
            ausbildungSeedZipDecks($u);
        }
        $materials=sql('SELECT id,modul_code,titel,typ,url,public_aktiv,CASE WHEN dateipfad IS NULL THEN 0 ELSE 1 END AS datei FROM ausbildung_materialien WHERE aktiv=1 ORDER BY modul_code,titel');
        $me=ausbildungTrainer($u);
        if(!$leitung){
            $trainers=[];
            $kompetenzen=json_decode((string)($me['kompetenzen']??'[]'),true)??[];
            $materials=array_values(array_filter($materials,fn($m)=>in_array($m['modul_code'],$kompetenzen,true)
                &&preg_match('#^https://docs\.google\.com/presentation/#D',(string)$m['url'])));
        }
        respond(200,['leitung'=>$leitung,'user'=>['id'=>(int)$u['id'],'rolle'=>$u['rolle'],
            'name'=>userName($u)],'module'=>$module,'ausbilder'=>$trainers,
            'anwaerter'=>$trainees,'materialien'=>$materials,
            'ausbilderKandidaten'=>(int)(rights($u)['ausbildung']??0)>=2?ausbildungTrainerKandidaten():[],
            'unterrichtBereit'=>ausbildungSchemaStatus()['unterrichtBereit'],
            'stimmenDetailsBereit'=>ausbildungStimmenDetailsVerfuegbar(),
            'eigeneKompetenzen'=>json_decode((string)($me['kompetenzen']??'[]'),true)??[]]);
    }
    if($uri==='/api/ausbildung/ausbilder'&&$method==='POST'){
        ausbildungRecht($u,2);
        $b=body();
        $nr=filter_var($b['personalnummer']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
        if($nr===false||$nr===null)fail(400,'Bitte eine geeignete Person aus dem Personalstamm auswählen.');
        $pw=$b['startpasswort']??'';
        if(!is_string($pw)||strlen($pw)<8||strlen($pw)>4096)
            fail(400,'Für jeden neuen Ausbilderzugang ist ein Startpasswort mit mindestens 8 Zeichen erforderlich');
        db()->beginTransaction();
        try{
            $person=ausbildungTrainerPersonal((int)$nr,true)[0]??null;
            if(!$person)fail(409,'Person nicht mehr geeignet: mindestens Polizeiobermeister und aktiv oder abgemeldet erforderlich.');
            if(!is_string($b['personal_quelle']??null)||$b['personal_quelle']!==$person['quelle'])
                fail(409,'Die Personalzuordnung hat sich geändert. Bitte erneut auswählen.');
            foreach(['dienstnummer','name','kuerzel','rang'] as $key)$b[$key]=$person[$key];
            if($person['email']!=='')$b['email']=$person['email'];
            $v=ausbildungTrainerInput($b);
            if($v['beginn']===null)fail(400,'Bitte Eintritt in die Ausbildungsabteilung angeben.');
            if($v['email']==='')fail(400,'Bitte E-Mail-Adresse angeben.');
            $ausbildungsLogin='AUS-'.$v['nr'];
            if(sql("SELECT id FROM users WHERE dienstnummer REGEXP '^AUS-[0-9]+$' AND CAST(SUBSTRING(dienstnummer,5) AS UNSIGNED)=? LIMIT 1",[(int)$nr])
                ||sql("SELECT id FROM ausbildung_ausbilder WHERE aktiv=1 AND dienstnummer REGEXP '^[0-9]+$' AND CAST(dienstnummer AS UNSIGNED)=? LIMIT 1",[(int)$nr]))
                fail(409,'Für diese Dienstnummer existiert bereits ein Ausbildungszugang.');
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
            $tables=ausbildungsZugangTabellen();
            db()->beginTransaction();
            try {
                $locked=sql('SELECT dienstnummer,rolle FROM users WHERE id=? FOR UPDATE',[$target]);
                if(!$locked||$locked[0]['rolle']!=='Ausbilder'||ausbildungsZugangArchiviert((string)$locked[0]['dienstnummer']))
                    fail(409,'Dieser Ausbilderzugang wurde bereits geändert oder entzogen.');
                ausbildungsZugangArchivieren($target,$tables);
                auditAction($u,'Ausbilderzugang entzogen: ID '.$target,'del');
                db()->commit();
            }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
            respond(200,['ok'=>true]);
        }
    }
    if($uri==='/api/ausbildung/anwaerter'&&$method==='POST')
        fail(409,'Anwärter werden ausschließlich im Personalstamm angelegt und automatisch ihrem Ausbildungsmonitor zugeordnet.');
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)$#D',$uri,$m)){
        $id=cleanId($m[1]);
        if($method==='GET'){
            $a=ausbildungAnwaerter($id);
            respond(200,['anwaerter'=>$a,'fortschritt'=>ausbildungFortschritt($a,true)]);
        }
        if($method==='PATCH'){
            ausbildungRecht($u);$b=body();$a=ausbildungAnwaerter($id);
            ausbildungPruefeRevision($a,$b['revision']??null);
            // Name, Laufbahn, DN, Beginn und RSA stammen ausschließlich aus personal.
            $bem=ausbildungString($b['bemerkung']??'',2000,'Bemerkung');
            $stmt=db()->prepare('UPDATE ausbildung_anwaerter SET bemerkung=?,revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=? AND revision=?');
            $stmt->execute([$bem,$id,$b['revision']]);
            if($stmt->rowCount()!==1)fail(409,'Anwärter wurde zwischenzeitlich geändert');
            auditAction($u,'Anwärter aktualisiert: ID '.$id);
            respond(200,['ok'=>true]);
        }
    }
    // Only PMA RSA can be edited here. No general personnel write permission.
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)/rsa$#D',$uri,$m)&&$method==='PUT'){
        ausbildungRecht($u);$id=cleanId($m[1]);$b=body();
        if(!is_bool($b['abgeschlossen']??null)||!is_bool($b['bisher']??null))
            fail(400,'RSA-Status muss Ja oder Nein sein');
        $pre=ausbildungAnwaerter($id);
        if($pre['laufbahn']!=='PMA')fail(400,'RSA ist nur für PMA vorgesehen');
        db()->beginTransaction();
        try{
            // Lock the actual personnel identity before updating the linked mirror.
            $source=ausbildungPersonalQuelleLesen($pre,true);
            if(!$source)fail(409,'Personalzuordnung geändert. Bitte neu laden.');
            $rows=sql('SELECT * FROM ausbildung_anwaerter WHERE id=? FOR UPDATE',[$id]);
            $a=$rows[0]??null;
            if(!$a||$a['laufbahn']!=='PMA'||$a['personal_quelle']!==$pre['personal_quelle']||
                (int)$a['personalnummer']!==(int)$pre['personalnummer'])
                fail(409,'Anwärterzuordnung geändert. Bitte neu laden.');
            ausbildungPruefeRevision($a,$b['revision']??null);
            $old=ausbildungRsaErhalten($source['rsa']??null);
            if($old!==$b['bisher'])fail(409,'RSA wurde zwischenzeitlich geändert. Bitte neu laden.');
            $next=$b['abgeschlossen'];$nr=(int)$a['personalnummer'];$value=$next?'Erhalten':'Offen';
            if($old!==$next){
                sql('UPDATE personal SET rsa=? WHERE personalnummer=?',[$value,$nr]);
                sql('UPDATE ausbildung_anwaerter SET rsa=?,revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',[$next?1:0,$id]);
                sql('INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES(?,?,?)',
                    [$nr,$u['id'],json_encode(['rsa'=>['alt'=>$source['rsa'],'neu'=>$value]],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
                auditAction($u,'PMA RSA-Schulung für Anwärter-ID '.$id.($next?' abgeschlossen':' zurückgesetzt'));
            }
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)/modul/([A-Z]{2}\.[0-9]+)$#D',$uri,$m)&&$method==='PUT'){
        $id=cleanId($m[1]);$code=$m[2];$b=body();
        if(!is_bool($b['abgeschlossen']??null))fail(400,'Abschluss muss Ja oder Nein sein');
        // Monitorpflege ist für alle Ausbilder erlaubt; Unterrichtskompetenzen
        // bleiben separat bei der Anlage eines Unterrichtsraums geprüft.
        ausbildungRecht($u);
        db()->beginTransaction();
        try {
            $a=ausbildungAnwaerter($id,true);ausbildungPruefeRevision($a,$b['revision']??null);
            if(!in_array($code,array_column(ausbildungModule((string)$a['laufbahn']),'code'),true))
                fail(400,'Modul gehört nicht zu dieser Laufbahn');
            sql('INSERT INTO ausbildung_abschluesse(anwaerter_id,modul_code,ausbilder_user_id,abgeschlossen,aktualisiert) VALUES(?,?,?,?,UTC_TIMESTAMP(6))
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
        if(!ausbildungStimmenDetailsVerfuegbar())
            fail(503,'Für neue Stimmabgaben müssen zuerst die zusätzlichen Felder für Anlass, Datum und Bemerkung nach einer Datenbanksicherung eingerichtet werden.');
        $details=$vote===null?null:ausbildungStimmDetailsPruefen($b,$vote);
        $trainer=ausbildungTrainer($u);
        // Explicit training access also supports existing police accounts without
        // a duplicate AUS profile. Keep the established Leitungsdienst weight.
        ausbildungRecht($u);
        $weight=$trainer?ausbildungStufe((string)$trainer['funktion']):
            ausbildungStufe($u['rolle']==='Leitungsdienst'?'Leitungsdienst':
                (ausbildungLeitung($u)?'Ausbildungsleitung':'Ausbilder'));
        db()->beginTransaction();
        try {
            $a=ausbildungAnwaerter($id,true);ausbildungPruefeRevision($a,$b['revision']??null);
            if($a['laufbahn']!=='PMA')fail(400,'Der Excel-Stimmenmonitor gilt nur für PMA');
            if($vote===null)sql('DELETE FROM ausbildung_stimmen WHERE anwaerter_id=? AND ausbilder_user_id=?',[$id,(int)$u['id']]);
            else sql('INSERT INTO ausbildung_stimmen(anwaerter_id,ausbilder_user_id,stimme,gewicht,anlass,streifenfahrt_datum,bemerkung,aktualisiert)
                VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(6))
                ON DUPLICATE KEY UPDATE stimme=VALUES(stimme),gewicht=VALUES(gewicht),
                  anlass=VALUES(anlass),streifenfahrt_datum=VALUES(streifenfahrt_datum),
                  bemerkung=VALUES(bemerkung),aktualisiert=UTC_TIMESTAMP(6)',
                [$id,(int)$u['id'],$vote,$weight,$details['anlass'],$details['streifenfahrt_datum'],$details['bemerkung']]);
            sql('UPDATE ausbildung_anwaerter SET revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',[$id]);
            auditAction($u,'PMA-Stimme aktualisiert: Anwärter-ID '.$id);
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if(preg_match('#^/api/ausbildung/anwaerter/([1-9]\d*)/link$#D',$uri,$m)){
        ausbildungRecht($u);$id=cleanId($m[1]);
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
    // Private AuLK-URL-Zuordnung aus einem lokalen JSON-Import. Nur neue Einträge.
    // Keine Veröffentlichung, keine Änderung oder Löschung bestehender Unterlagen.
    if($method==='POST'&&$uri==='/api/ausbildung/materialien/import'){
        ausbildungRecht($u,2);
        $b=body();$items=$b['eintraege']??null;
        if(($b['bestaetigung']??null)!=='AULK_PRIVAT_IMPORT'
            ||!is_array($items)||!array_is_list($items)||count($items)<1||count($items)>60)
            fail(400,'Gültige AuLK-Importdatei mit höchstens 60 Einträgen erforderlich');
        $validModules=array_column(sql('SELECT code FROM ausbildung_module WHERE aktiv=1'),'code');
        $records=[];
        foreach($items as $item){
            if(!is_array($item))fail(400,'Ungültiger AuLK-Eintrag');
            $code=ausbildungString($item['modul_code']??null,12,'Modulcode',true);
            $title=ausbildungString($item['titel']??null,200,'Titel',true);
            $url=ausbildungLink($item['url']??null);
            if(!in_array($code,$validModules,true)
                ||!preg_match('#^https://docs\.google\.com/presentation/d/[a-zA-Z0-9_-]+/#D',$url))
                fail(400,'Nur vorhandene Module und Google-Slides-Präsentationen importieren');
            $records[]=[$code,$title,$url];
        }
        $locked=sql("SELECT GET_LOCK('idv_ausbildung_aulk_import',10) AS ok");
        if((int)($locked[0]['ok']??0)!==1)fail(503,'Ein weiterer AuLK-Import läuft gerade');
        $created=0;$skipped=0;
        try{
            db()->beginTransaction();
            foreach($records as [$code,$title,$url]){
                if(sql('SELECT id FROM ausbildung_materialien WHERE modul_code=? AND url=? LIMIT 1',[$code,$url])){
                    $skipped++;continue;
                }
                sql("INSERT INTO ausbildung_materialien(modul_code,titel,typ,url,public_aktiv,aktiv)
                    VALUES(?,?,'Präsentation',?,0,1)",[$code,$title,$url]);
                $created++;
            }
            auditAction($u,'Private AuLK-Präsentationen importiert: '.$created.' neu, '.$skipped.' übersprungen','add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        finally{sql("SELECT RELEASE_LOCK('idv_ausbildung_aulk_import')");}
        respond(200,['ok'=>true,'neu'=>$created,'vorhanden'=>$skipped]);
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
