<?php
declare(strict_types=1);
namespace IDV;

function checklistInput(array $input): array {
    $name=$input['name']??null;
    if(!is_string($name)||trim($name)===''||strlen(trim($name))>120)fail(400,'Name muss 1–120 Zeichen lang sein');
    $tasks=$input['aufgaben']??null;
    if(!is_array($tasks)||count($tasks)>100)fail(400,'Maximal 100 Aufgaben pro Checkliste erlaubt');
    $clean=[];
    foreach($tasks as $i=>$t){
        if(!is_array($t)||!is_string($t['t']??null)||!is_string($t['u']??''))fail(400,'Ungültige Aufgabe '.($i+1));
        $text=trim($t['t']);$url=trim($t['u']??'');
        if($text===''||strlen($text)>500||strlen($url)>2048)fail(400,'Aufgabe '.($i+1).': Text fehlt oder ist zu lang');
        if($url!==''){
            $parts=parse_url($url);
            if(!is_array($parts)||($parts['scheme']??null)!=='https'||!str_contains((string)($parts['host']??''),'.')||
                isset($parts['user'])||isset($parts['pass'])||preg_match('/\s/',$url))
                fail(400,'Aufgabe '.($i+1).': nur gültige HTTPS-Links erlaubt');
        }
        $clean[]=['t'=>$text,'u'=>$url];
    }
    return [trim($name),$clean];
}
function expectedRevision(): string {
    $rev=(string)($_SERVER['HTTP_IF_MATCH']??'');
    if(!preg_match('/^[0-9]{1,20}$/D',$rev))fail(428,'Versionsstand fehlt. Bitte die Akte neu öffnen.');
    return $rev;
}
function versionConflict(): never {
    fail(409,'Speicherkonflikt: Dieser Datensatz wurde inzwischen geändert oder gelöscht. Deine Eingaben wurden nicht überschrieben. Bitte aktuellen Stand laden und die Änderungen erneut prüfen.');
}
function checklistEditor(array $u): void {
    $level=rights($u)['chk']??0;
    if($level<2&& !($u['rolle']==='Polizeirat'&&$level>=1))fail(403,'Kein Recht zum Abhaken der Checkliste');
}
function dispatchChecklists(array $u,string $method,string $uri): bool {
    if($method==='POST'&&$uri==='/api/checklisten'){
        needRight($u,'chk',2);[$name,$tasks]=checklistInput(body());
        db()->beginTransaction();
        try{
            $max=sql('SELECT COALESCE(MAX(sortierung)+1,0) AS n FROM checklisten');
            sql('INSERT INTO checklisten(name,aufgaben,sortierung) VALUES(?,?,?)',
                [$name,json_encode($tasks,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),(int)$max[0]['n']]);
            auditAction($u,'Checkliste angelegt: '.$name,'add');
            db()->commit();
        }catch(\PDOException $e){db()->rollBack();if($e->getCode()==='23000')fail(409,'Eine Checkliste mit diesem Namen existiert bereits');throw $e;}
        catch(\Throwable $e){db()->rollBack();throw $e;}
        respond(201,['name'=>$name,'aufgaben'=>$tasks,'sortierung'=>(int)$max[0]['n']]);
    }
    if($method==='POST'&&$uri==='/api/checklisten/reset'){
        needRight($u,'chk');checklistEditor($u);db()->beginTransaction();
        try{
            $count=(int)sql('SELECT COUNT(*) AS n FROM checklisten_status')[0]['n'];
            sql('DELETE FROM checklisten_status');
            auditAction($u,'Alle Checklisten-Häkchen zurückgesetzt ('.$count.')');
            db()->commit();
        }catch(\Throwable $e){db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'anzahl'=>$count]);
    }
    if($method==='PATCH'&&preg_match('#^/api/checklisten/([^/]+)/punkte/([0-9]+)$#D',$uri,$m)){
        needRight($u,'chk');checklistEditor($u);$rev=expectedRevision();
        $name=rawurldecode($m[1]);$index=(int)$m[2];$b=body();
        if($name===''||strlen($name)>250||$index<0||!is_bool($b['erledigt']??null)||!is_bool($b['erwartet']??null))
            fail(400,'Ungültiger Checklistenpunkt');
        db()->beginTransaction();
        try{
            $c=sql('SELECT aufgaben,row_revision FROM checklisten WHERE name=? FOR UPDATE',[$name]);
            if(!$c||(string)$c[0]['row_revision']!==$rev)versionConflict();
            $tasks=json_decode((string)$c[0]['aufgaben'],true,64,JSON_THROW_ON_ERROR);
            if(!is_array($tasks)||$index>=count($tasks))fail(400,'Checklistenpunkt nicht vorhanden');
            $old=sql('SELECT erledigt FROM checklisten_status WHERE name=? AND punkt=? FOR UPDATE',[$name,$index]);
            if((bool)($old[0]['erledigt']??false)!==$b['erwartet'])versionConflict();
            sql('INSERT INTO checklisten_status(name,punkt,erledigt) VALUES(?,?,?) ON DUPLICATE KEY UPDATE erledigt=VALUES(erledigt),aktualisiert=UTC_TIMESTAMP(6)',
                [$name,$index,$b['erledigt']?1:0]);
            auditAction($u,'Checkliste '.$name.' / Punkt '.($index+1).': '.($b['erledigt']?'erledigt':'offen'));
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'erledigt'=>$b['erledigt']]);
    }
    if(preg_match('#^/api/checklisten/([^/]+)$#D',$uri,$m)&&in_array($method,['PUT','DELETE'],true)){
        needRight($u,'chk',2);$rev=expectedRevision();$oldName=rawurldecode($m[1]);
        if($oldName===''||strlen($oldName)>250)fail(400,'Ungültiger Checklistenname');
        $b=$method==='PUT'?body():[];
        if($method==='PUT'){
            [$name,$tasks]=checklistInput($b);$map=$b['zuordnung']??null;
            if(!is_array($map)||count($map)!==count($tasks))fail(400,'Ungültige Aufgaben-Zuordnung');
            $seen=[];
            foreach($map as $idx){
                if($idx===null)continue;
                if(!is_int($idx)||$idx<0||isset($seen[$idx]))fail(400,'Ungültige Aufgaben-Zuordnung');
                $seen[$idx]=true;
            }
        }
        db()->beginTransaction();
        try{
            $rows=sql('SELECT * FROM checklisten WHERE name=? FOR UPDATE',[$oldName]);
            if(!$rows){if($method==='PUT')fail(404,'Checkliste nicht gefunden');versionConflict();}
            $original=$rows[0];if((string)$original['row_revision']!==$rev)versionConflict();
            $status=sql('SELECT punkt,erledigt FROM checklisten_status WHERE name=? ORDER BY punkt FOR UPDATE',[$oldName]);
            if($method==='DELETE'){
                $jsonOriginal=$original;unset($jsonOriginal['row_revision']);
                $jsonOriginal['aufgaben']=json_decode((string)$jsonOriginal['aufgaben'],true,64,JSON_THROW_ON_ERROR);
                sql("INSERT INTO idv_papierkorb(bereich,schluessel,titel,datensatz,zusatz,geloescht_von) VALUES('checklisten',?,?,?,?,?)",
                    [$oldName,$oldName,json_encode($jsonOriginal,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),json_encode($status,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']]);
                sql('DELETE FROM checklisten WHERE name=?',[$oldName]);
                auditAction($u,'Checkliste in Papierkorb verschoben: '.$oldName,'del');
            }else{
                $previous=json_decode((string)$original['aufgaben'],true,64,JSON_THROW_ON_ERROR);
                foreach($map as $idx)if($idx!==null&&$idx>=count($previous))fail(400,'Ungültige alte Aufgabenposition');
                $oldStatus=[];foreach($status as $entry)$oldStatus[(int)$entry['punkt']]=(bool)$entry['erledigt'];
                $json=json_encode($tasks,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                if($name!==$oldName){
                    sql('INSERT INTO checklisten(name,aufgaben,sortierung) VALUES(?,?,?)',[$name,$json,$original['sortierung']]);
                    sql('DELETE FROM checklisten WHERE name=?',[$oldName]);
                }else{
                    sql('UPDATE checklisten SET aufgaben=? WHERE name=?',[$json,$name]);
                    sql('DELETE FROM checklisten_status WHERE name=?',[$name]);
                }
                foreach($map as $i=>$idx)if($idx!==null&&array_key_exists($idx,$oldStatus))
                    sql('INSERT INTO checklisten_status(name,punkt,erledigt) VALUES(?,?,?)',[$name,$i,$oldStatus[$idx]?1:0]);
                auditAction($u,'Checkliste bearbeitet: '.$oldName.($name!==$oldName?' → '.$name:''));
            }
            db()->commit();
        }catch(\PDOException $e){if(db()->inTransaction())db()->rollBack();if($e->getCode()==='23000')fail(409,'Eine Checkliste mit diesem Namen existiert bereits');throw $e;}
        catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        if($method==='DELETE')respond(200,['ok'=>true,'im_papierkorb'=>true]);
        respond(200,['name'=>$name,'aufgaben'=>$tasks]);
    }
    return false;
}
