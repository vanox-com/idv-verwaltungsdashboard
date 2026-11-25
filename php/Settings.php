<?php
declare(strict_types=1);
namespace IDV;

/**
 * MySQL/PHP implementations of administrative and appearance routes.
 * Every write is authenticated in Api.php and checked here for role/permission.
 */
function needRight(array $user, string $module, int $level=1): void {
    if ((rights($user)[$module] ?? 0) < $level) fail(403,'Kein Recht für diesen Bereich');
}
function needAdmin(array $user): void {
    if ($user['rolle'] !== 'Administrator') fail(403,'Nur Administratoren');
}
function auditAction(array $user, string $action, string $type='edit'): void {
    sql('INSERT INTO log(user_id,aktion,art) VALUES(?,?,?)',[$user['id'],$action,$type]);
}
function cleanId(string $raw): int {
    if (!preg_match('/^[1-9][0-9]{0,9}$/D',$raw)) fail(400,'Ungültige ID');
    return (int)$raw;
}
function portalDesignInput(): array {
    $data=body();
    $motifs=['wappen','verlauf','ohne','nachtblau','stahl','raster','licht','minimal','einsatzszene','streife-nacht','streife-einsatz','polizeiweste','streifenbesprechung','winter-funkstreife','winter-lagebesprechung','winter-verkehrskontrolle','winter-funkwagen','winter-einsatzteam'];
    $hex=static fn($value)=>is_string($value)&&preg_match('/^#[0-9a-fA-F]{6}$/D',$value);
    $extras=$data['extras']??[];
    if (!$hex($data['akzent']??null) || !is_int($data['schleier']??null) ||
        $data['schleier']<65 || $data['schleier']>97 ||
        !in_array($data['hintergrund']??null,$motifs,true) ||
        !is_array($extras) || array_is_list($extras)&&$extras!==[]) fail(400,'Ungültige Designeinstellungen');
    $keys=['flaeche','seitenleiste','rahmen','schrift','sekundaer','highlight'];
    foreach($extras as $name=>$value){
        if(!in_array($name,[...$keys,'modus','preset','hintergrundBlur'],true)) fail(400,'Ungültige Designeinstellungen');
        if(in_array($name,$keys,true) && !$hex($value))fail(400,'Ungültige Designeinstellungen');
        if($name==='hintergrundBlur'&&(!is_int($value)||$value<0||$value>24))fail(400,'Ungültige Hintergrund-Weichzeichnung');
        if($name==='modus'&&!in_array($value,['dunkel','hell'],true))fail(400,'Ungültige Designeinstellungen');
        if($name==='preset'&&!in_array($value,['flori','schulzi','chem'],true))fail(400,'Ungültige Designeinstellungen');
    }
    return [$data['akzent'],$data['schleier'],$data['hintergrund'],json_encode($extras,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)];
}
/** Preserve the authors of training records while permanently revoking their login. */
function ausbildungsZugangArchiviert(string $dn): bool {
    return str_starts_with(strtolower($dn),'archiv-aus-');
}
function ausbildungsZugangTabellen(): array {
    return array_column(sql("SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('ausbildung_ausbilder','ausbildung_stimmen','ausbildung_abschluesse','ausbildung_unterricht')"),'TABLE_NAME');
}
function ausbildungsZugangHatHistorie(int $id,array $tables): bool {
    foreach(['ausbildung_ausbilder'=>'user_id','ausbildung_stimmen'=>'ausbilder_user_id',
        'ausbildung_abschluesse'=>'ausbilder_user_id','ausbildung_unterricht'=>'ausbilder_user_id'] as $table=>$column){
        if(in_array($table,$tables,true)&&sql("SELECT 1 FROM ".$table." WHERE ".$column."=? LIMIT 1",[$id]))return true;
    }
    return false;
}
/** Caller must hold a transaction and the target user's row lock. */
function ausbildungsZugangArchivieren(int $id,array $tables): void {
    if(in_array('ausbildung_ausbilder',$tables,true))
        sql('UPDATE ausbildung_ausbilder SET aktiv=0,revision=revision+1,aktualisiert=UTC_TIMESTAMP(6) WHERE user_id=? AND aktiv=1',[$id]);
    if(in_array('ausbildung_unterricht',$tables,true))
        sql('UPDATE ausbildung_unterricht SET beendet=1,angebot=NULL,antwort=NULL,aktualisiert=UTC_TIMESTAMP(6) WHERE ausbilder_user_id=? AND beendet=0',[$id]);
    // Keep the original display name, role and ID for module/stimm records.
    // Release the original login name; never allow the archived account to log in.
    $archiv='archiv-aus-'.$id.'-'.bin2hex(random_bytes(6));
    $hash=password_hash(bin2hex(random_bytes(32)),PASSWORD_BCRYPT,['cost'=>12]);
    sql('UPDATE users SET dienstnummer=?,gesperrt=1,passwort_hash=?,muss_passwort_aendern=1 WHERE id=?',[$archiv,$hash,$id]);
    sql('DELETE FROM sessions WHERE user_id=?',[$id]);
}
function notificationSettingsDefaults(): array {
    return ['por_bef'=>true,'por_rang'=>true,'pma_warnung'=>true,'pma_stimmen'=>true,'pma_dringend'=>true];
}
/** Preferences belong exclusively to the authenticated user; legacy global flags are ignored. */
function notificationSettingsPrefix(array $u): string {
    return 'personal_hinweis:'.(int)$u['id'].':';
}
function notificationSettingsRead(array $u): array {
    $flags=notificationSettingsDefaults();
    $prefix=notificationSettingsPrefix($u);
    $keys=array_map(fn($k)=>$prefix.$k,array_keys($flags));
    foreach(sql('SELECT schluessel,werte FROM system_optionen WHERE schluessel IN (?,?,?,?,?)',$keys) as $row){
        $key=substr((string)$row['schluessel'],strlen($prefix));
        $value=json_decode((string)$row['werte'],true);
        if(array_key_exists($key,$flags)&&is_bool($value[0]??null))$flags[$key]=$value[0];
    }
    return $flags;
}

/** Public-to-authenticated-dashboard text, writable only by the administrator. */
function dashboardSpruchDefault(): string {return 'Schon wieder hier? Na dann, ran an die Arbeit!';}
function dashboardSpruchDecode(?string $raw): string {
    $v=json_decode($raw??'',true);
    return is_array($v)&&is_string($v[0]??null)&&trim($v[0])!==''?$v[0]:dashboardSpruchDefault();
}
function dashboardSpruchRead(): string {
    $rows=sql("SELECT werte FROM system_optionen WHERE schluessel='dashboard_jonas_spruch' LIMIT 1");
    return dashboardSpruchDecode($rows[0]['werte']??null);
}
function dashboardSpruchSave(array $u): never {
    needAdmin($u);$b=body();$spruch=$b['spruch']??null;$expected=$b['erwartet']??null;
    if(!is_string($spruch)||!is_string($expected))fail(400,'Ungültiger Spruch');
    $spruch=trim($spruch);
    if(!preg_match('/\A.{1,180}\z/us',$spruch))fail(400,'Der Spruch muss 1 bis 180 Zeichen enthalten');
    db()->beginTransaction();
    try{
        sql("INSERT IGNORE INTO system_optionen(schluessel,werte) VALUES('dashboard_jonas_spruch',?)",[json_encode([dashboardSpruchDefault()],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        $rows=sql("SELECT werte FROM system_optionen WHERE schluessel='dashboard_jonas_spruch' FOR UPDATE");
        $current=dashboardSpruchDecode($rows[0]['werte']??null);
        if($current!==$expected){db()->rollBack();fail(409,'Der Spruch wurde inzwischen geändert. Bitte Dashboard aktualisieren und erneut öffnen.');}
        sql("UPDATE system_optionen SET werte=?,aktualisiert=UTC_TIMESTAMP(6) WHERE schluessel='dashboard_jonas_spruch'",[json_encode([$spruch],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        auditAction($u,'Dashboard-Spruch des Polizeipräsidenten geändert');
        db()->commit();
    }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
    respond(200,['spruch'=>$spruch]);
}

function dispatchSettings(array $u,string $method,string $uri): bool {
    if($method==='PUT'&&$uri==='/api/dashboard-spruch')dashboardSpruchSave($u);
    if($method==='GET'&&$uri==='/api/benachrichtigungs-einstellungen'){
        if(!notificationSettingsAllowed($u))fail(403,'Keine Berechtigung für Benachrichtigungseinstellungen');
        respond(200,['einstellungen'=>notificationSettingsRead($u)]);
    }
    if($method==='PUT'&&preg_match('#^/api/benachrichtigungs-einstellungen/([a-z_]+)$#D',$uri,$m)){
        if(!notificationSettingsAllowed($u))fail(403,'Keine Berechtigung für Benachrichtigungseinstellungen');
        // Authorized accounts may adjust only their own preferences.
        $key=$m[1];$b=body();$enabled=$b['aktiv']??null;
        if(!array_key_exists($key,notificationSettingsDefaults())||!is_bool($enabled))fail(400,'Ungültige Benachrichtigungseinstellung');
        db()->beginTransaction();
        try{
            sql('INSERT INTO system_optionen(schluessel,werte) VALUES(?,?) ON DUPLICATE KEY UPDATE werte=VALUES(werte),aktualisiert=UTC_TIMESTAMP(6)',
                [notificationSettingsPrefix($u).$key,json_encode([$enabled],JSON_THROW_ON_ERROR)]);
            auditAction($u,'Persönliche Benachrichtigung '.$key.($enabled?' aktiviert':' deaktiviert'));
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['einstellungen'=>notificationSettingsRead($u)]);
    }
    if($method==='GET'&&$uri==='/api/users'){
        needAdmin($u);
        ensureDNApprovalPermissions();
        respond(200,[
            'users'=>normalizedRows("SELECT id,dienstnummer,anzeigename,rolle,muss_passwort_aendern,gesperrt,erstellt FROM users WHERE LOWER(dienstnummer) NOT LIKE 'archiv-aus-%' ORDER BY dienstnummer"),
            'rollen'=>normalizedRows('SELECT name,farbe,sensibel FROM roles ORDER BY name'),
            'perms'=>normalizedRows('SELECT rolle,modul,stufe FROM role_perms'),
            'userPerms'=>normalizedRows('SELECT user_id,modul,stufe FROM user_perms ORDER BY user_id,modul')
        ]);
    }
    if($method==='POST'&&$uri==='/api/users'){
        needAdmin($u);$b=body();
        $num=trim((string)($b['dienstnummer']??''));$name=trim((string)($b['anzeigename']??''));
        $role=(string)($b['rolle']??'');$pass=(string)($b['startpasswort']??'');
        if(ausbildungsZugangArchiviert($num))fail(400,'Diese Dienstnummer ist für archivierte Zugänge reserviert');
        if($num===''||strlen($num)>32||$name===''||strlen($name)>200||!sql('SELECT 1 FROM roles WHERE name=?',[$role]))
            fail(400,'Dienstnummer, gültiger Name und Rolle nötig');
        if(strlen($pass)<8||strlen($pass)>4096)fail(400,'Startpasswort min. 8 Zeichen');
        if(sql('SELECT 1 FROM users WHERE dienstnummer=?',[$num]))fail(409,'Diese Dienstnummer gibt es schon');
        sql('INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern) VALUES(?,?,?,?,1)',
            [$num,$name,$role,password_hash($pass,PASSWORD_BCRYPT,['cost'=>12])]);
        $id=(int)db()->lastInsertId();
        auditAction($u,'Zugang angelegt: '.$num.' '.$name,'add');
        respond(200,['id'=>$id,'dienstnummer'=>$num,'anzeigename'=>$name,'rolle'=>$role]);
    }
    if(preg_match('#^/api/users/([1-9][0-9]*)$#D',$uri,$m)){
        needAdmin($u);$id=cleanId($m[1]);
        if($method==='PATCH'){
            $target=sql('SELECT dienstnummer FROM users WHERE id=?',[$id]);
            if(!$target||ausbildungsZugangArchiviert((string)$target[0]['dienstnummer']))fail(404,'Aktiver Zugang nicht gefunden');
            $b=body();$fields=[];$args=[];
            if(($b['gesperrt']??null)===true&&$id==(int)$u['id'])fail(400,'Eigenen Administratorzugang nicht sperren oder herabstufen');
            if(array_key_exists('rolle',$b)&&$b['rolle']!==null){
                if($id==(int)$u['id']&&$b['rolle']!=='Administrator')fail(400,'Eigenen Administratorzugang nicht sperren oder herabstufen');
                if(!is_string($b['rolle'])||!sql('SELECT 1 FROM roles WHERE name=?',[$b['rolle']]))fail(400,'Unbekannte Rolle');
                $fields[]='rolle=?';$args[]=$b['rolle'];
            }
            if(isset($b['anzeigename'])){if(!is_string($b['anzeigename'])||strlen($b['anzeigename'])>200)fail(400,'Ungültiger Name');$fields[]='anzeigename=?';$args[]=$b['anzeigename'];}
            if(isset($b['gesperrt'])){$fields[]='gesperrt=?';$args[]=(bool)$b['gesperrt']?1:0;}
            if(!empty($b['neues_passwort'])){
                if(!is_string($b['neues_passwort'])||strlen($b['neues_passwort'])<8||strlen($b['neues_passwort'])>4096)fail(400,'Passwort min. 8 Zeichen');
                $fields[]='passwort_hash=?';$args[]=password_hash($b['neues_passwort'],PASSWORD_BCRYPT,['cost'=>12]);
                $fields[]='muss_passwort_aendern=1';
            }
            if(!$fields)fail(400,'Keine Änderung übergeben');
            $args[]=$id;sql('UPDATE users SET '.implode(',',$fields).' WHERE id=?',$args);
            sql('DELETE FROM sessions WHERE user_id=?',[$id]);
            auditAction($u,'Zugang geändert: ID '.$id);
            respond(200,['ok'=>true]);
        }
        if($method==='DELETE'){
            if($id==(int)$u['id'])fail(400,'Der eigene Zugang kann nicht gelöscht werden');
            $tables=ausbildungsZugangTabellen();
            $archived=false;
            db()->beginTransaction();
            try{
                $old=sql('SELECT dienstnummer,rolle FROM users WHERE id=? FOR UPDATE',[$id]);
                if(!$old||ausbildungsZugangArchiviert((string)$old[0]['dienstnummer']))fail(404,'Aktiver Zugang nicht gefunden');
                $archived=ausbildungsZugangHatHistorie($id,$tables)||in_array($old[0]['rolle'],['Ausbilder','Ausbildungsleitung'],true);
                if($archived)ausbildungsZugangArchivieren($id,$tables);
                else sql('DELETE FROM users WHERE id=?',[$id]);
                auditAction($u,($archived?'Zugang entzogen (Ausbildungshistorie erhalten): ':'Zugang gelöscht: ').$old[0]['dienstnummer'],'del');
                db()->commit();
            }catch(\PDOException $e){
                if(db()->inTransaction())db()->rollBack();
                if((int)($e->errorInfo[1]??0)===1451)
                    fail(409,'Dieser Zugang ist mit weiteren Datensätzen verknüpft. Bitte zunächst sperren; die Historie bleibt erhalten.');
                throw $e;
            }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
            respond(200,['ok'=>true,'archiviert'=>$archived]);
        }
    }
    $allowed=['dash','pers','bef','rout','routarchiv','praktika','sonder','dis','kue','chk','rl','rlbearb','org','sperr','geb','jub','bl','log','por','dnfreigabe','ranghistorie','befricht','texte','rechtesimulator','design','backup','mitteilungen','papierkorb','kuearchiv','abm','botcfg','ausbildung'];
    if($method==='PATCH'&&preg_match('#^/api/rollen/([^/]+)/recht/([^/]+)$#D',$uri,$m)){
        needAdmin($u);$role=rawurldecode($m[1]);$mod=rawurldecode($m[2]);$b=body();$level=$b['stufe']??null;
        if($role==='Administrator')fail(403,'Administratorrechte sind fest');
        if($mod==='rechtesimulator')fail(403,'Der Berechtigungs-Simulator ist fest Administratoren vorbehalten');
        if(!in_array($mod,$allowed,true)||!in_array($level,[0,1,2],true))fail(400,'Ungültiges Modul oder Berechtigungsstufe');
        if(in_array($role,['Ausbildungsleitung','Ausbilder'],true))fail(403,'Ausbildungszugänge haben feste, isolierte Rollenrechte');
        if($mod==='ausbildung'){
            if(in_array($role,['Leitungsdienst','Ausbildungsleitung','Ausbilder'],true))fail(403,'Ausbildungsrollenrechte sind fest bzw. werden über die Ausbilderfunktion bestimmt');
            if($level===2)fail(400,'Ausbildungsleitungsrechte bitte gezielt über Einzelrechte vergeben');
        }
        if(!sql('SELECT 1 FROM roles WHERE name=?',[$role]))fail(404,'Rolle nicht vorhanden');
        sql('INSERT INTO role_perms(rolle,modul,stufe) VALUES(?,?,?) ON DUPLICATE KEY UPDATE stufe=VALUES(stufe)',[$role,$mod,$level]);
        auditAction($u,'Rollenrecht geändert: '.$role.'/'.$mod.' → '.$level);
        respond(200,['ok'=>true,'rolle'=>$role,'modul'=>$mod,'stufe'=>$level]);
    }
    if($method==='PATCH'&&preg_match('#^/api/users/([1-9][0-9]*)/recht/([^/]+)$#D',$uri,$m)){
        needAdmin($u);$id=cleanId($m[1]);$mod=rawurldecode($m[2]);$b=body();
        if(!array_key_exists('stufe',$b)||!in_array($mod,$allowed,true)||!in_array($b['stufe'],[null,0,1,2],true))fail(400,'Ungültige Berechtigung');
        $target=sql('SELECT rolle,dienstnummer FROM users WHERE id=?',[$id]);
        if(!$target||ausbildungsZugangArchiviert((string)$target[0]['dienstnummer']))fail(404,'Aktiver Zugang nicht gefunden');
        if($target[0]['rolle']==='Administrator')fail(403,'Administratorrechte sind fest');
        if($mod==='rechtesimulator')fail(403,'Der Berechtigungs-Simulator ist fest Administratoren vorbehalten');
        if(in_array($target[0]['rolle'],['Ausbildungsleitung','Ausbilder'],true))
            fail(403,'Ausbildungszugänge haben feste, isolierte Rollenrechte');
        if($mod==='ausbildung'&&in_array($target[0]['rolle'],['Leitungsdienst','Ausbildungsleitung','Ausbilder'],true))
            fail(403,'Ausbildungsrechte dieses Kontos sind fest bzw. werden über die Ausbilderfunktion bestimmt');
        if($b['stufe']===null)sql('DELETE FROM user_perms WHERE user_id=? AND modul=?',[$id,$mod]);
        else sql('INSERT INTO user_perms(user_id,modul,stufe) VALUES(?,?,?) ON DUPLICATE KEY UPDATE stufe=VALUES(stufe)',[$id,$mod,$b['stufe']]);
        auditAction($u,'Individuelles Recht '.$target[0]['dienstnummer'].'/'.$mod.' → '.($b['stufe']===null?'Rolle':$b['stufe']));
        respond(200,['ok'=>true,'stufe'=>$b['stufe']]);
    }
    if($method==='PUT'&&preg_match('#^/api/system-optionen/([^/]+)$#D',$uri,$m)){
        needAdmin($u);$key=rawurldecode($m[1]);$b=body();$items=$b['werte']??null;
        if(!in_array($key,['mitarbeitergruppen','beschaeftigungsarten'],true))fail(400,'Unbekanntes Feld');
        if(!is_array($items)||count($items)<1||count($items)>40||count(array_unique($items))!==count($items))
            fail(400,'Ungültige Auswahlwerte');
        foreach($items as $item)if(!is_string($item)||trim($item)===''||strlen($item)>80)fail(400,'Ungültige Auswahlwerte');
        $req=$key==='beschaeftigungsarten'?['Hauptberuf','Nebenberuf']:['Mittlerer Dienst','Gehobener Dienst','Polizeirat','Leitungsdienst','Nicht zugeordnet'];
        foreach($req as $item)if(!in_array($item,$items,true))fail(400,'Basiswerte dürfen nicht entfernt werden');
        if($key==='beschaeftigungsarten'&&count($items)!==2)fail(400,'Beschäftigungsarten bleiben Hauptberuf und Nebenberuf');
        sql('INSERT INTO system_optionen(schluessel,werte) VALUES(?,?) ON DUPLICATE KEY UPDATE werte=VALUES(werte),aktualisiert=UTC_TIMESTAMP(6)',[$key,json_encode($items,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        auditAction($u,'Systemoptionen geändert: '.$key);
        respond(200,['ok'=>true]);
    }
    if($method==='PUT'&&$uri==='/api/portal-design'){
        needRight($u,'design',2);[$akzent,$schleier,$motiv,$extras]=portalDesignInput();
        sql('UPDATE portal_design SET akzent=?,schleier=?,hintergrund=?,extras=?,aktualisiert=UTC_TIMESTAMP(6) WHERE id=1',[$akzent,$schleier,$motiv,$extras]);
        auditAction($u,'Globales Portaldesign geändert');respond(200,['ok'=>true]);
    }
    if($uri==='/api/portal-design/personal'){
        if($method==='PUT'){
            [$a,$s,$m,$e]=portalDesignInput();
            sql('INSERT INTO portal_design_personal(user_id,akzent,schleier,hintergrund,extras) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE akzent=VALUES(akzent),schleier=VALUES(schleier),hintergrund=VALUES(hintergrund),extras=VALUES(extras),aktualisiert=UTC_TIMESTAMP(6)',[$u['id'],$a,$s,$m,$e]);
            respond(200,['ok'=>true]);
        }
        if($method==='DELETE'){sql('DELETE FROM portal_design_personal WHERE user_id=?',[$u['id']]);respond(200,['ok'=>true]);}
    }
    if($method==='PUT'&&$uri==='/api/dashboard-layout'){
        needAdmin($u);$b=body();$version=$b['version']??null;$items=$b['items']??null;
        $allowedWidgets=['kpi-personal','kpi-kuendigungen','kpi-rueckgaben','kpi-disziplin','kpi-aktiv','kpi-neu30','kpi-urlaub','kpi-bef','panel-bef','panel-gruppen','panel-inaktiv','panel-geb','panel-jub','panel-dienstblatt','panel-links','panel-vorlagen','panel-info','panel-status','panel-neue','panel-bekanntmachungen'];
        if(!is_int($version)||$version<0||!is_array($items)||count($items)>count($allowedWidgets))fail(400,'Ungültige Dashboard-Konfiguration');
        $seen=[];
        foreach($items as $item){
            if(!is_array($item)||!in_array($item['id']??null,$allowedWidgets,true)||!is_bool($item['sichtbar']??null)||isset($seen[$item['id']]))
                fail(400,'Ungültige Dashboard-Konfiguration');
            $seen[$item['id']]=1;
        }
        $json=json_encode($items,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
        $stmt=db()->prepare($version===0
            ?'INSERT IGNORE INTO dashboard_layout(id,items,version) VALUES(1,?,1)'
            :'UPDATE dashboard_layout SET items=?,version=version+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=1 AND version=?');
        $stmt->execute($version===0?[$json]:[$json,$version]);
        if($stmt->rowCount()!==1)fail(409,'Das Dashboard wurde bereits geändert. Bitte die Seite neu laden.');
        $r=normalizedRows('SELECT items,version FROM dashboard_layout WHERE id=1',[],['items']);
        auditAction($u,'Dashboard-Kacheln und Anordnung angepasst');
        respond(200,$r[0]);
    }
    if($uri==='/api/bekanntmachungen'&&$method==='POST'){
        needAdmin($u);$b=body();$title=trim((string)($b['titel']??''));$content=trim((string)($b['inhalt']??''));
        if($title===''||$content===''||strlen($title)>140||strlen($content)>3000)fail(400,'Titel und Inhalt erforderlich');
        sql('INSERT INTO bekanntmachungen(titel,inhalt) VALUES(?,?)',[$title,$content]);
        auditAction($u,'Bekanntmachung angelegt','add');respond(200,['id'=>(int)db()->lastInsertId()]);
    }
    if(preg_match('#^/api/bekanntmachungen/([1-9][0-9]*)$#D',$uri,$m)&&in_array($method,['PUT','DELETE'],true)){
        needAdmin($u);$id=cleanId($m[1]);
        if($method==='PUT'){
            $b=body();$title=trim((string)($b['titel']??''));$content=trim((string)($b['inhalt']??''));
            if($title===''||$content===''||strlen($title)>140||strlen($content)>3000)fail(400,'Ungültige Bekanntmachung');
            sql('UPDATE bekanntmachungen SET titel=?,inhalt=? WHERE id=?',[$title,$content,$id]);
            if(db()->query('SELECT ROW_COUNT()')->fetchColumn()==0)fail(404,'Nicht gefunden');
        }else sql('DELETE FROM bekanntmachungen WHERE id=?',[$id]);
        auditAction($u,'Bekanntmachung geändert');respond(200,['ok'=>true]);
    }
    if($method==='GET'&&$uri==='/api/backup-status'){
        // Raw database exports contain password hashes and sensitive records.
        // Backup status and all archive operations are administrator-only.
        needAdmin($u);
        $r=sql('SELECT DATABASE() AS datenbank,UTC_TIMESTAMP(6) AS geprueft_am');
        $size=sql('SELECT COALESCE(SUM(data_length+index_length),0) AS bytes FROM information_schema.tables WHERE table_schema=DATABASE()');
        respond(200,['datenbank'=>$r[0]['datenbank'],'bytes'=>(string)$size[0]['bytes'],
            'geprueft_am'=>$r[0]['geprueft_am'],
            'plan'=>'MySQL 8 / PHP-Hoster',
            'automatische_sicherungen'=>'Nicht eingerichtet – manuelle AES-256-Backups verfügbar',
            'wiederherstellung'=>'Kontrolliert und transaktional bei identischem Datenbankschema',
            'ablauf_am'=>null,
            'hinweis'=>'Backup-Archive werden AES-256-verschlüsselt außerhalb des Webroots gespeichert. Unabhängige Offsite-Sicherung wird empfohlen.']);
    }
    return false;
}
