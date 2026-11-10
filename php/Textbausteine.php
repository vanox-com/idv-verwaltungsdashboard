<?php
declare(strict_types=1);
namespace IDV;

function textInput(array $data): array {
    $fields=['kategorie'=>80,'titel'=>160,'inhalt'=>10000];
    $value=[];
    foreach($fields as $name=>$limit){
        $s=$data[$name]??null;
        if(!is_string($s)||trim($s)===''||strlen(trim($s))>$limit)
            fail(400,$name.' fehlt oder ist zu lang');
        $value[$name]=trim($s);
    }
    return $value;
}
function textKey(string $key): string {
    if(!preg_match('/^[a-z0-9-]{3,80}$/D',$key))fail(400,'Ungültiger Textbaustein-Schlüssel');
    return $key;
}
function dispatchText(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/textbausteine'){
        needRight($u,'texte');
        $rows=sql('SELECT schluessel,kategorie,titel,inhalt,row_revision AS _revision
            FROM textbausteine WHERE geloescht=0 ORDER BY sortierung,schluessel');
        foreach($rows as &$r)$r['_revision']=(string)$r['_revision'];
        respond(200,$rows);
    }
    if($method==='POST'&&$uri==='/api/textbausteine'){
        needRight($u,'texte',2);$b=textInput(body());
        $key='neu-'.substr(bin2hex(random_bytes(16)),0,32);
        db()->beginTransaction();
        try{
            $seq=(int)sql('SELECT COALESCE(MAX(sortierung),0)+10 AS next_order FROM textbausteine')[0]['next_order'];
            sql('INSERT INTO textbausteine(schluessel,kategorie,titel,inhalt,sortierung) VALUES(?,?,?,?,?)',
                [$key,$b['kategorie'],$b['titel'],$b['inhalt'],$seq]);
            auditAction($u,'Textbaustein hinzugefügt: '.$b['titel'],'add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        $rows=sql('SELECT schluessel,kategorie,titel,inhalt,row_revision AS _revision FROM textbausteine WHERE schluessel=?',[$key]);
        $rows[0]['_revision']=(string)$rows[0]['_revision'];
        respond(201,$rows[0]);
    }
    if(preg_match('#^/api/textbausteine/([^/]+)$#D',$uri,$m)&&in_array($method,['PATCH','DELETE'],true)){
        needRight($u,'texte',2);
        $key=textKey(rawurldecode($m[1]));$expected=expectedRevision();
        $b=$method==='PATCH'?textInput(body()):null;
        db()->beginTransaction();
        try{
            $found=sql('SELECT * FROM textbausteine WHERE schluessel=? AND geloescht=0 FOR UPDATE',[$key]);
            if(!$found||(string)$found[0]['row_revision']!==$expected)versionConflict();
            if($method==='PATCH'){
                $stmt=db()->prepare('UPDATE textbausteine SET kategorie=?,titel=?,inhalt=?
                    WHERE schluessel=? AND geloescht=0 AND row_revision=?');
                $stmt->execute([$b['kategorie'],$b['titel'],$b['inhalt'],$key,$expected]);
                if($stmt->rowCount()!==1)versionConflict();
                auditAction($u,'Textbaustein bearbeitet: '.$b['titel']);
            }else{
                $original=$found[0];unset($original['row_revision']);
                sql("INSERT INTO idv_papierkorb(bereich,schluessel,titel,datensatz,geloescht_von)
                    VALUES('textbausteine',?,?,?,?)",[
                    $key,$original['titel'],json_encode($original,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']
                ]);
                sql('UPDATE textbausteine SET geloescht=1 WHERE schluessel=?',[$key]);
                auditAction($u,'Textbaustein in Papierkorb verschoben: '.$original['titel'],'del');
            }
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        if($method==='DELETE')respond(200,['ok'=>true,'im_papierkorb'=>true]);
        $result=sql('SELECT schluessel,kategorie,titel,inhalt,row_revision AS _revision FROM textbausteine WHERE schluessel=?',[$key]);
        $result[0]['_revision']=(string)$result[0]['_revision'];
        respond(200,$result[0]);
    }
    return false;
}
