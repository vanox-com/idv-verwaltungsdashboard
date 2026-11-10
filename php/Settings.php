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
    $motifs=['wappen','verlauf','ohne','nachtblau','stahl','raster','licht','minimal','einsatzszene','streife-nacht','streife-einsatz','polizeiweste'];
    $hex=static fn($value)=>is_string($value)&&preg_match('/^#[0-9a-fA-F]{6}$/D',$value);
    $extras=$data['extras']??[];
    if (!$hex($data['akzent']??null) || !is_int($data['schleier']??null) ||
        $data['schleier']<65 || $data['schleier']>97 ||
        !in_array($data['hintergrund']??null,$motifs,true) ||
        !is_array($extras) || array_is_list($extras)&&$extras!==[]) fail(400,'Ungültige Designeinstellungen');
    $keys=['flaeche','seitenleiste','rahmen','schrift','sekundaer','highlight'];
    foreach($extras as $name=>$value){
        if(!in_array($name,[...$keys,'modus','preset'],true)) fail(400,'Ungültige Designeinstellungen');
        if(in_array($name,$keys,true) && !$hex($value))fail(400,'Ungültige Designeinstellungen');
        if($name==='modus'&&!in_array($value,['dunkel','hell'],true))fail(400,'Ungültige Designeinstellungen');
        if($name==='preset'&&!in_array($value,['flori','schulzi'],true))fail(400,'Ungültige Designeinstellungen');
    }
    return [$data['akzent'],$data['schleier'],$data['hintergrund'],json_encode($extras,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)];
}
function dispatchSettings(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/users'){
        needAdmin($u);
        respond(200,[
            'users'=>normalizedRows('SELECT id,dienstnummer,anzeigename,rolle,muss_passwort_aendern,gesperrt,erstellt FROM users ORDER BY dienstnummer'),
            'rollen'=>normalizedRows('SELECT name,farbe,sensibel FROM roles ORDER BY name'),
            'perms'=>normalizedRows('SELECT rolle,modul,stufe FROM role_perms'),
            'userPerms'=>normalizedRows('SELECT user_id,modul,stufe FROM user_perms ORDER BY user_id,modul')
        ]);
    }
    if($method==='POST'&&$uri==='/api/users'){
        needAdmin($u);$b=body();
        $num=trim((string)($b['dienstnummer']??''));$name=trim((string)($b['anzeigename']??''));
        $role=(string)($b['rolle']??'');$pass=(string)($b['startpasswort']??'');
        if($num===''||strlen($num)>32||$name===''||mb_strlen($name)>200||!sql('SELECT 1 FROM roles WHERE name=?',[$role]))
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
            $b=body();$fields=[];$args=[];
            if(($b['gesperrt']??null)===true&&$id==(int)$u['id'])fail(400,'Eigenen Administratorzugang nicht sperren oder herabstufen');
            if(array_key_exists('rolle',$b)&&$b['rolle']!==null){
                if($id==(int)$u['id']&&$b['rolle']!=='Administrator')fail(400,'Eigenen Administratorzugang nicht sperren oder herabstufen');
                if(!is_string($b['rolle'])||!sql('SELECT 1 FROM roles WHERE name=?',[$b['rolle']]))fail(400,'Unbekannte Rolle');
                $fields[]='rolle=?';$args[]=$b['rolle'];
            }
            if(isset($b['anzeigename'])){if(!is_string($b['anzeigename'])||mb_strlen($b['anzeigename'])>200)fail(400,'Ungültiger Name');$fields[]='anzeigename=?';$args[]=$b['anzeigename'];}
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
            $old=sql('SELECT dienstnummer FROM users WHERE id=?',[$id]);
            if(!$old)fail(404,'Zugang nicht gefunden');
            sql('DELETE FROM users WHERE id=?',[$id]);
            auditAction($u,'Zugang gelöscht: '.$old[0]['dienstnummer'],'del');
            respond(200,['ok'=>true]);
        }
    }
    $allowed=['dash','pers','bef','rout','routarchiv','praktika','sonder','dis','kue','chk','rl','org','sperr','geb','jub','bl','log','por','ranghistorie','befricht','texte','rechtesimulator','design','backup','mitteilungen','papierkorb','kuearchiv'];
    if($method==='PATCH'&&preg_match('#^/api/rollen/([^/]+)/recht/([^/]+)$#D',$uri,$m)){
        needAdmin($u);$role=rawurldecode($m[1]);$mod=rawurldecode($m[2]);$b=body();$level=$b['stufe']??null;
        if($role==='Administrator')fail(403,'Administratorrechte sind fest');
        if(!in_array($mod,$allowed,true)||!in_array($level,[0,1,2],true))fail(400,'Ungültiges Modul oder Berechtigungsstufe');
        if(!sql('SELECT 1 FROM roles WHERE name=?',[$role]))fail(404,'Rolle nicht vorhanden');
        sql('INSERT INTO role_perms(rolle,modul,stufe) VALUES(?,?,?) ON DUPLICATE KEY UPDATE stufe=VALUES(stufe)',[$role,$mod,$level]);
        auditAction($u,'Rollenrecht geändert: '.$role.'/'.$mod.' → '.$level);
        respond(200,['ok'=>true,'rolle'=>$role,'modul'=>$mod,'stufe'=>$level]);
    }
    if($method==='PATCH'&&preg_match('#^/api/users/([1-9][0-9]*)/recht/([^/]+)$#D',$uri,$m)){
        needAdmin($u);$id=cleanId($m[1]);$mod=rawurldecode($m[2]);$b=body();
        if(!array_key_exists('stufe',$b)||!in_array($mod,$allowed,true)||!in_array($b['stufe'],[null,0,1,2],true))fail(400,'Ungültige Berechtigung');
        $target=sql('SELECT rolle,dienstnummer FROM users WHERE id=?',[$id]);
        if(!$target)fail(404,'Konto nicht gefunden');
        if($target[0]['rolle']==='Administrator')fail(403,'Administratorrechte sind fest');
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
        foreach($items as $item)if(!is_string($item)||trim($item)===''||mb_strlen($item)>80)fail(400,'Ungültige Auswahlwerte');
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
        if($version===0)sql('INSERT IGNORE INTO dashboard_layout(id,items,version) VALUES(1,?,1)',[$json]);
        else sql('UPDATE dashboard_layout SET items=?,version=version+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=1 AND version=?',[$json,$version]);
        $r=normalizedRows('SELECT items,version FROM dashboard_layout WHERE id=1',[],['items']);
        if(!$r||(int)$r[0]['version']!==$version+1)fail(409,'Das Dashboard wurde bereits geändert. Bitte die Seite neu laden.');
        auditAction($u,'Dashboard-Kacheln und Anordnung angepasst');
        respond(200,$r[0]);
    }
    if($uri==='/api/bekanntmachungen'&&$method==='POST'){
        needAdmin($u);$b=body();$title=trim((string)($b['titel']??''));$content=trim((string)($b['inhalt']??''));
        if($title===''||$content===''||mb_strlen($title)>140||mb_strlen($content)>3000)fail(400,'Titel und Inhalt erforderlich');
        sql('INSERT INTO bekanntmachungen(titel,inhalt) VALUES(?,?)',[$title,$content]);
        auditAction($u,'Bekanntmachung angelegt','add');respond(200,['id'=>(int)db()->lastInsertId()]);
    }
    if(preg_match('#^/api/bekanntmachungen/([1-9][0-9]*)$#D',$uri,$m)&&in_array($method,['PUT','DELETE'],true)){
        needAdmin($u);$id=cleanId($m[1]);
        if($method==='PUT'){
            $b=body();$title=trim((string)($b['titel']??''));$content=trim((string)($b['inhalt']??''));
            if($title===''||$content===''||mb_strlen($title)>140||mb_strlen($content)>3000)fail(400,'Ungültige Bekanntmachung');
            sql('UPDATE bekanntmachungen SET titel=?,inhalt=? WHERE id=?',[$title,$content,$id]);
            if(db()->query('SELECT ROW_COUNT()')->fetchColumn()==0)fail(404,'Nicht gefunden');
        }else sql('DELETE FROM bekanntmachungen WHERE id=?',[$id]);
        auditAction($u,'Bekanntmachung geändert');respond(200,['ok'=>true]);
    }
    if($method==='GET'&&$uri==='/api/backup-status'){
        needRight($u,'backup');$r=sql('SELECT DATABASE() AS datenbank,UTC_TIMESTAMP(6) AS geprueft_am');
        $size=sql('SELECT COALESCE(SUM(data_length+index_length),0) AS bytes FROM information_schema.tables WHERE table_schema=DATABASE()');
        respond(200,['datenbank'=>$r[0]['datenbank'],'bytes'=>(string)$size[0]['bytes'],
            'geprueft_am'=>$r[0]['geprueft_am'],'plan'=>'nicht bekannt','automatische_sicherungen'=>'Nicht bestätigt',
            'wiederherstellung'=>'Nicht im Portal verfügbar','ablauf_am'=>null,
            'hinweis'=>'Dies ist keine Datensicherung. MySQL-Sicherungen und Wiederherstellung beim Hoster prüfen.']);
    }
    return false;
}
