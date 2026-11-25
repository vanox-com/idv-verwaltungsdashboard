<?php
declare(strict_types=1);
namespace IDV;

use PDO;
use PDOException;
use Throwable;
use RuntimeException;

const SESSION_HOURS = 12;
const MAX_BODY_BYTES = 2097152;
const PANEL_LOGIN_ROLES = ['Administrator','Leitungsdienst','Polizeirat','Ausbildungsleitung','Ausbilder'];

function hasPanelLoginRole(string $role): bool {
    return in_array($role,PANEL_LOGIN_ROLES,true);
}

function respond(int $code, array $result): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}
function fail(int $code, string $message): never { respond($code, ['error'=>$message]); }
function envRequired(string $name): string {
    $value = getenv($name);
    if (!is_string($value) || $value === '') {
        throw new RuntimeException('Umgebung ist nicht vollständig konfiguriert: '.$name);
    }
    return $value;
}
function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $host = envRequired('MYSQL_HOST');
    $dbName = envRequired('MYSQL_DATABASE');
    $user = envRequired('MYSQL_USER');
    $password = envRequired('MYSQL_PASSWORD');
    $port = getenv('MYSQL_PORT') ?: '3306';
    if (!ctype_digit($port) || (int)$port < 1 || (int)$port > 65535) throw new RuntimeException('Ungültiger MySQL-Port');
    // TLS is required when MYSQL_SSL_CA is configured. Use a trusted CA rather than disabling verification.
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 10,
    ];
    $ca = getenv('MYSQL_SSL_CA');
    if (is_string($ca) && $ca !== '') {
        $options[PDO::MYSQL_ATTR_SSL_CA] = $ca;
        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
    }
    $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $password, $options);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}
function sql(string $statement, array $params=[]): array {
    $stmt = db()->prepare($statement);
    $stmt->execute($params);
    return $stmt->fetchAll();
}
function body(): array {
    $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > MAX_BODY_BYTES) fail(413, 'Anfrage zu groß');
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES+1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) fail(413,'Anfrage zu groß');
    try{$value=json_decode($raw, false, 64, JSON_THROW_ON_ERROR);}
    catch(Throwable $e){fail(400,'Ungültige JSON-Anfrage');}
    if (!$value instanceof \stdClass) fail(400,'JSON-Objekt erforderlich');
    return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
}
function secureRequest(): bool {
    // Shared PHP hosts may terminate HTTPS at their reverse proxy.
    // Trust only an explicit server-side setting, never client-supplied
    // X-Forwarded-Proto, when enforcing Secure cookies and Origin checks.
    if(getenv('IDV_FORCE_HTTPS')==='1')return true;
    return ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['SERVER_PORT'] ?? '') === '443';
}
function csrfCheck(): void {
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST','PUT','PATCH','DELETE'],true)) return;
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $url = parse_url($origin);
        if (!is_array($url) || !isset($url['scheme'],$url['host'])) fail(403,'Ungültiger Anfrageursprung');
        $scheme = secureRequest()?'https':'http';
        $host = strtolower((string)($_SERVER['HTTP_HOST']??''));
        $hostname = strtolower($url['host']).(isset($url['port'])?':'.$url['port']:'');
        if ($url['scheme'] !== $scheme || $hostname !== $host) fail(403,'Ungültiger Anfrageursprung');
    }
    if (($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site') fail(403,'Cross-site-Anfrage gesperrt');
}
function cookieSet(string $token, int $expires): void {
    setcookie('session',$token,[
        'expires'=>$expires,'path'=>'/','secure'=>secureRequest(),
        'httponly'=>true,'samesite'=>'Strict'
    ]);
}
function loggedUser(bool $allowPasswordChange=false): ?array {
    $token = (string)($_COOKIE['session']??'');
    if (!preg_match('/^[a-f0-9]{64}$/D',$token)) return null;
    $users=sql(
        "SELECT u.id,u.dienstnummer,u.anzeigename,u.rolle,u.gesperrt,u.muss_passwort_aendern,s.zweck
         FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token=? AND s.ablauf>UTC_TIMESTAMP() LIMIT 1",[$token]);
    $u=$users[0]??null;
    if (!$u || (int)$u['gesperrt']===1 || !hasPanelLoginRole((string)$u['rolle'])) return null;
    if ($u['rolle']==='Ausbilder' && !sql('SELECT 1 FROM ausbildung_ausbilder WHERE user_id=? AND aktiv=1 LIMIT 1',[(int)$u['id']])) return null;
    if ((int)$u['muss_passwort_aendern']===1) {
        return $allowPasswordChange && $u['zweck']==='passwortwechsel'?$u:null;
    }
    return $u['zweck']==='voll'?$u:null;
}
function requireLogin(bool $allowPasswordChange=false): array {
    $u=loggedUser($allowPasswordChange);
    if (!$u) fail(401,'Nicht angemeldet');
    return $u;
}
function ausbildungLeitungsprofil(array $u): bool {
    if(in_array($u['rolle']??'',['Administrator','Ausbildungsleitung'],true))return true;
    try{
        $row=sql("SELECT funktion FROM ausbildung_ausbilder WHERE user_id=? AND aktiv=1 LIMIT 1",[(int)$u['id']]);
        return in_array($row[0]['funktion']??'',['Ausbildungsleitung','stv. Ausbildungsleitung'],true);
    }catch(Throwable $e){return false;}
}
/** Sensitive training administration, not merely a delegated training permission. */
function ausbildungVerwaltungsleitung(array $u): bool {
    return (int)(rights($u)['ausbildung']??0)>=2
        &&(in_array($u['rolle']??'',['Administrator','Leitungsdienst','Ausbildungsleitung'],true)||ausbildungLeitungsprofil($u));
}
/** Popup preferences are restricted to the four leadership/administrative roles, including genuine training leadership profiles on an AUS account. */
function notificationSettingsAllowed(array $u): bool {
    $role=(string)($u['rolle']??'');
    return in_array($role,['Administrator','Leitungsdienst','Polizeirat','Ausbildungsleitung'],true)
        ||($role==='Ausbilder'&&(int)(rights($u)['ausbildung']??0)>=2);
}
/** Role defaults are deliberately limited; an administrator's explicit user override
 * can grant training leadership to an existing police account. */
function ausbildungRechtsstufe(string $rolle,int $rollenstufe,?int $einzelrecht,bool $leitungsprofil=false): int {
    if(in_array($rolle,['Administrator','Leitungsdienst'],true))return 2;
    if($rolle==='Ausbildungsleitung')return 2;
    if($rolle==='Ausbilder')return $leitungsprofil?2:1;
    if($einzelrecht!==null)return max(0,min(2,$einzelrecht));
    return $leitungsprofil?2:max(0,min(1,$rollenstufe));
}
function rights(array $u,bool $nurRolle=false): array {
    if(in_array($u['rolle'],['Ausbilder','Ausbildungsleitung'],true))
        return ['ausbildung'=>($nurRolle?$u['rolle']==='Ausbildungsleitung':ausbildungLeitungsprofil($u))?2:1,'dash'=>1,'design'=>1];
    ensureDNApprovalPermissions();
    $rights=[];
    foreach(sql("SELECT modul,stufe FROM role_perms WHERE rolle=?",[$u['rolle']]) as $row)
        $rights[$row['modul']] = (int)$row['stufe'];
    $ausbildungRolle=(int)($rights['ausbildung']??0);
    $ausbildungEinzel=null;
    if (!$nurRolle&&$u['rolle']!=='Administrator') {
        foreach(sql("SELECT modul,stufe FROM user_perms WHERE user_id=?",[$u['id']]) as $row){
            $rights[$row['modul']] = (int)$row['stufe'];
            if($row['modul']==='ausbildung')$ausbildungEinzel=(int)$row['stufe'];
        }
    }
    $rights['ausbildung']=ausbildungRechtsstufe((string)$u['rolle'],$ausbildungRolle,$ausbildungEinzel,
        !$nurRolle&&!in_array($u['rolle'],['Administrator','Leitungsdienst'],true)&&$ausbildungEinzel===null&&ausbildungLeitungsprofil($u));
    // Never delegate the simulator via saved role permissions or overrides.
    $rights['rechtesimulator']=$u['rolle']==='Administrator'?2:0;
    return $rights;
}
/* Neues, eigenständiges Entscheidungsrecht. Fügt fehlende Rollenstandards hinzu,
   ohne bereits gesetzte Rechte oder individuelle Ausnahmen zu überschreiben. */
function ensureDNApprovalPermissions(): void {
    static $done=false;
    if($done)return;
    sql("INSERT IGNORE INTO role_perms(rolle,modul,stufe) VALUES
        ('Administrator','dnfreigabe',2),('Polizeirat','dnfreigabe',2),
        ('Leitungsdienst','dnfreigabe',2),('Ausbilder','dnfreigabe',0),
        ('Mitarbeiter','dnfreigabe',0),
        ('Administrator','rlbearb',2),('Polizeirat','rlbearb',0),
        ('Leitungsdienst','rlbearb',0),('Ausbilder','rlbearb',0),
        ('Mitarbeiter','rlbearb',0)");
    $done=true;
}
function userName(array $u): string {
    $num=trim((string)$u['dienstnummer']);
    if (preg_match('/^[0-9]{1,6}$/D',$num) && (int)$num > 0) {
        $rows=sql("SELECT vorname,nachname FROM personal WHERE personalnummer=? LIMIT 1",[(int)$num]);
        if ($rows) {
            $name=trim(trim((string)($rows[0]['vorname']??'')).' '.trim((string)($rows[0]['nachname']??'')));
            if ($name !== '' && $name !== '- -') return $name;
        }
    }
    return (string)$u['anzeigename'];
}
function sessionApiUser(array $u): array {
    return [
        'id'=>(int)$u['id'],'dienstnummer'=>$u['dienstnummer'],
        'anzeigename'=>userName($u),'rolle'=>$u['rolle'],
        'mussPasswortAendern'=>(bool)$u['muss_passwort_aendern'],
        'rechte'=>rights($u)
    ];
}
function handleLogin(): never {
    $data=body();
    $number=trim((string)($data['dienstnummer']??''));
    $password=(string)($data['passwort']??'');
    if ($number===''||$password==='') fail(400,'Dienstnummer und Passwort nötig');
    if(strlen($number)>32||strlen($password)>4096) fail(400,'Ungültige Zugangsdaten');
    checkLoginRate();
    $list=sql("SELECT id,rolle,passwort_hash,muss_passwort_aendern,gesperrt FROM users WHERE dienstnummer=? LIMIT 1",[$number]);
    $u=$list[0]??null;
    // Same generic error to avoid user enumeration.
    if(!$u||!password_verify($password,(string)$u['passwort_hash'])){
        recordLoginFailure();
        fail(401,'Dienstnummer oder Passwort stimmt nicht');
    }
    if((int)$u['gesperrt']===1)fail(403,'Dieser Zugang ist gesperrt');
    // Ausschließlich die fünf ausdrücklich erlaubten Verwaltungs-/Ausbildungsrollen.
    if(!hasPanelLoginRole((string)$u['rolle']))
        fail(403,'Für diese Rolle besteht kein Verwaltungszugang');
    if($u['rolle']==='Ausbilder' && !sql('SELECT 1 FROM ausbildung_ausbilder WHERE user_id=? AND aktiv=1 LIMIT 1',[(int)$u['id']]))
        fail(403,'Kein aktiver Ausbilderzugang');
    $token=bin2hex(random_bytes(32));
    $purpose=(int)$u['muss_passwort_aendern']===1?'passwortwechsel':'voll';
    $expiry=time()+SESSION_HOURS*3600;
    db()->beginTransaction();
    try {
        sql("INSERT INTO sessions(token,user_id,zweck,ablauf) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 12 HOUR))",
           [$token,$u['id'],$purpose]);
        sql("INSERT INTO log(user_id,aktion,art) VALUES(?,'Anmeldung','auth')",[$u['id']]);
        db()->commit();
    }catch(Throwable $e){db()->rollBack();throw $e;}
    cookieSet($token,$expiry);
    respond(200,['ok'=>true,'mussPasswortAendern'=>(bool)$u['muss_passwort_aendern']]);
}
function handleLogout(): never {
    $token=(string)($_COOKIE['session']??'');
    if(preg_match('/^[a-f0-9]{64}$/D',$token)){
        $u=loggedUser(true);
        if($u)sql("INSERT INTO log(user_id,aktion,art) VALUES(?,'Abmeldung','auth')",[$u['id']]);
        sql("DELETE FROM sessions WHERE token=?",[$token]);
    }
    cookieSet('',time()-3600);
    respond(200,['ok'=>true]);
}
function handlePassword(): never {
    $u=requireLogin(true);
    $d=body();
    $old=(string)($d['alt']??'');
    $new=(string)($d['neu']??'');
    if(strlen($new)<8||strlen($new)>4096)fail(400,'Passwort muss 8 bis 4096 Zeichen lang sein');
    $record=sql("SELECT passwort_hash FROM users WHERE id=?",[$u['id']]);
    if(!$record||!password_verify($old,(string)$record[0]['passwort_hash']))
        fail(401,'Bisheriges Passwort stimmt nicht');
    $hash=password_hash($new,PASSWORD_BCRYPT,['cost'=>12]);
    $token=(string)($_COOKIE['session']??'');
    db()->beginTransaction();
    try {
        sql("UPDATE users SET passwort_hash=?,muss_passwort_aendern=0 WHERE id=?",[$hash,$u['id']]);
        sql("UPDATE sessions SET zweck='voll' WHERE token=? AND user_id=?",[$token,$u['id']]);
        sql("DELETE FROM sessions WHERE user_id=? AND token<>?",[$u['id'],$token]);
        sql("INSERT INTO log(user_id,aktion,art) VALUES(?,'Passwort geändert','auth')",[$u['id']]);
        db()->commit();
    }catch(Throwable $e){db()->rollBack();throw $e;}
    respond(200,['ok'=>true]);
}
function run(): void {
    ini_set('display_errors', '0');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    try {
        $uri=(string)(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)??'/');
        $method=strtoupper((string)($_SERVER['REQUEST_METHOD']??'GET'));
        if(!str_starts_with($uri,'/api/')) fail(404,'Nicht gefunden');
        csrfCheck();
        // While an administrator restores a database, block every ordinary
        // write through this PHP application (including login and logout).
        // Backup restoration itself remains explicitly controlled separately.
        if(in_array($method,['POST','PUT','PATCH','DELETE'],true)
           &&!str_starts_with($uri,'/api/backup/')){
            $backupRoot=(string)(getenv('IDV_BACKUP_DIRECTORY')
                ?:dirname(__DIR__).'/private/database-backups');
            if(is_file($backupRoot.'/.restore_maintenance'))
                fail(503,'Datenbank wird gerade wiederhergestellt. Schreibzugriffe sind vorübergehend gesperrt.');
        }
        require_once __DIR__.'/RateLimit.php';
        // Authentication must remain independent of optional feature files,
        // including partially deployed or unavailable training modules.
        if($method==='POST'&&$uri==='/api/login')handleLogin();
        if($method==='POST'&&$uri==='/api/logout')handleLogout();
        if($method==='GET'&&$uri==='/api/me'){
            $u=requireLogin();
            respond(200,sessionApiUser($u));
        }
        if($method==='POST'&&$uri==='/api/passwort')handlePassword();
        // Public guest handlers are loaded only for their own URL prefix.
        if(str_starts_with($uri,'/api/unterricht/')){
            require_once __DIR__.'/AusbildungUnterricht.php';
            if(dispatchUnterrichtGast($method,$uri))return;
            fail(404,'Unterrichts-Endpunkt unbekannt');
        }
        if(str_starts_with($uri,'/api/pruefung-gast/')){
            require_once __DIR__.'/Pruefungen.php';
            if(pruefungGuest($method,$uri))return;
            fail(404,'Prüfungs-Endpunkt unbekannt');
        }
        if($method==='POST'&&$uri==='/api/ausbildung-extern/status'){
            require_once __DIR__.'/Ausbildung.php';
            ausbildungExtern();
        }
        if($method==='GET'&&$uri==='/api/ausbildung-oeffentlich'){
            require_once __DIR__.'/Ausbildung.php';
            ausbildungOeffentlicheMaterialien();
        }
        // Ausschließlich aggregierte PMA-/PKA-/KKA-Zahlen: keine Namen, keine DNs.
        if($method==='GET'&&$uri==='/api/ausbildung-oeffentlich/monitore'){
            require_once __DIR__.'/Ausbildung.php';
            require_once __DIR__.'/AusbildungSetup.php';
            ausbildungOeffentlicheMonitore();
        }
        if($method==='GET'&&preg_match('#^/api/ausbildung-oeffentlich/datei/([1-9]\\d*)$#D',$uri,$publicFile)){
            require_once __DIR__.'/Ausbildung.php';
            require_once __DIR__.'/AusbildungFiles.php';
            ausbildungOeffentlicheDatei((int)$publicFile[1]);
        }

        // Unknown routes must fail closed, and no PHP code may delegate to PostgreSQL.
        $u=requireLogin();
        // Nur Ausbildungs-APIs sind für die isolierten Ausbildungsrollen zulässig.
        if(in_array($u['rolle'],['Ausbildungsleitung','Ausbilder'],true)){
            if($method==='GET'&&$uri==='/api/bootstrap'){
                // Minimales Dashboard-Grundgerüst – keinerlei Personal-,
                // Polizeirat-, Disziplinar- oder sonstige Verwaltungsdaten.
                respond(200,['user'=>sessionApiUser($u),'daten'=>['dashboard'=>['summary'=>new \stdClass(),
                    'layout'=>['items'=>[],'version'=>0]]]]);
            }
            $personalDesign=($method==='GET'&&$uri==='/api/portal-design')
                ||(in_array($method,['PUT','DELETE'],true)&&$uri==='/api/portal-design/personal');
            $personalNotifications=notificationSettingsAllowed($u)&&(($method==='GET'&&$uri==='/api/benachrichtigungs-einstellungen')
                ||($method==='PUT'&&preg_match('#^/api/benachrichtigungs-einstellungen/[a-z_]+$#D',$uri)));
            if(!str_starts_with($uri,'/api/ausbildung/')&&!$personalDesign&&!$personalNotifications)
                fail(403,'Dieser Zugang ist nur für die Ausbildungsabteilung und das eigene Design freigegeben');
        }
        // Make authenticated actor available to MySQL audit triggers on every route.
        sql('SET @idv_actor = ?',[(int)$u['id']]);
        // Ausbildung benötigt cleanId() und auditAction() aus Settings.php.
        require_once __DIR__.'/Settings.php';
        require_once __DIR__.'/DatabaseBackup.php';
        if(dispatchDatabaseBackup($u,$method,$uri))return;
        if(str_starts_with($uri,'/api/ausbildung/')){
            require_once __DIR__.'/Ausbildung.php';
            if(dispatchAusbildung($u,$method,$uri))return;
            fail(404,'Ausbildungs-Endpunkt unbekannt');
        }
        if($method==='GET'&&$uri==='/api/changes') {
            require_once __DIR__.'/Changes.php';
            streamChanges($u);
        }
        require_once __DIR__.'/Bootstrap.php';
        require_once __DIR__.'/DisziplinRichtlinie.php';
        if(dispatchDisziplinRichtlinie($u,$method,$uri))return;
        if($method==='GET'&&$uri==='/api/bootstrap')handleBootstrap($u);
        if($method==='GET'&&$uri==='/api/system-optionen')handleSystemOptions($u);
        require_once __DIR__.'/ReadOnly.php';
        if($method==='GET'&&$uri==='/api/portal-design')handlePortalDesign($u);
        if($method==='GET'&&$uri==='/api/log')handleProtocol($u,'log');
        if($method==='GET'&&$uri==='/api/personal-audit')handleProtocol($u,'personal-audit');
        require_once __DIR__.'/Routine.php';
        if($method==='POST'&&preg_match('#^/api/routine/([1-9][0-9]*)/termin$#D',$uri,$match))
            handleRoutineDate($u,(int)$match[1]);
        require_once __DIR__.'/Settings.php';
        if(dispatchSettings($u,$method,$uri)) return;
        require_once __DIR__.'/Checklists.php';
        if(dispatchChecklists($u,$method,$uri)) return;
        require_once __DIR__.'/TerminationDiagnostics.php';
        if(dispatchTerminationDiagnostics($u,$method,$uri)) return;
        require_once __DIR__.'/Personnel.php';
        if(dispatchPersonnel($u,$method,$uri)) return;
        require_once __DIR__.'/Textbausteine.php';
        if(dispatchText($u,$method,$uri)) return;
        require_once __DIR__.'/Messages.php';
        if(dispatchMessages($u,$method,$uri)) return;
        require_once __DIR__.'/ReferenceLists.php';
        if(dispatchReferenceLists($u,$method,$uri)) return;
        require_once __DIR__.'/Org.php';
        if(dispatchOrg($u,$method,$uri)) return;
        require_once __DIR__.'/PersonnelHistory.php';
        if(dispatchPersonnelHistory($u,$method,$uri)) return;
        require_once __DIR__.'/CopNet.php';
        if(dispatchCopNet($u,$method,$uri)) return;
        require_once __DIR__.'/PromotionGuidelines.php';
        if(dispatchPromotionGuidelines($u,$method,$uri)) return;
        require_once __DIR__.'/PersonnelSpecial.php';
        if(dispatchPersonnelSpecial($u,$method,$uri)) return;
        require_once __DIR__.'/TerminationArchive.php';
        if(dispatchTerminationArchive($u,$method,$uri)) return;
        require_once __DIR__.'/RoutineArchive.php';
        if(dispatchRoutineArchive($u,$method,$uri)) return;
        require_once __DIR__.'/Promotion.php';
        if(dispatchPromotion($u,$method,$uri)) return;
        require_once __DIR__.'/RoutineEditing.php';
        if(dispatchRoutineEditing($u,$method,$uri)) return;
        require_once __DIR__.'/TerminationEditing.php';
        if(dispatchTerminationEditing($u,$method,$uri)) return;
        require_once __DIR__.'/DienstnummerAntraege.php';
        if(dispatchDNRequests($u,$method,$uri)) return;
        require_once __DIR__.'/Abmeldungen.php';
        if(dispatchAbmeldungen($u,$method,$uri)) return;
        require_once __DIR__.'/BotKonfiguration.php';
        if(dispatchBotKonfiguration($u,$method,$uri)) return;
        require_once __DIR__.'/AktenFeatures.php';
        if(dispatchRecordFeatures($u,$method,$uri)) return;
        require_once __DIR__.'/GoogleDocuments.php';
        require_once __DIR__.'/GoogleTemplates.php';
        if(dispatchGoogleTemplateAdmin($u,$method,$uri))return;
        require_once __DIR__.'/DocumentTemplates.php';
        require_once __DIR__.'/Documents.php';
        if(dispatchDocuments($u,$method,$uri)) return;
        require_once __DIR__.'/Certificates.php';
        if(dispatchCertificates($u,$method,$uri)) return;
        fail(501,'Diese Funktion wurde noch nicht auf die MySQL/PHP-Version umgestellt');
    }catch(PDOException $e){
        error_log('[IDV PHP] Database failure: '.$e->getCode());
        fail(500,'Interner Datenbankfehler');
    }catch(Throwable $e){
        error_log('[IDV PHP] Unhandled '.$e::class.' at '.basename($e->getFile()).':'.$e->getLine());
        fail(500,'Interner Fehler');
    }
}
