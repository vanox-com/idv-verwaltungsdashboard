<?php
declare(strict_types=1);
namespace IDV;

/** Mutable termination records, preserving protected archive permissions and history. */
function terminationWriteAccess(array $u,array $case): void {
    if(!((bool)$case['aktuell'])&& (rights($u)['kuearchiv']??0)<2)
        fail(403,'Zum Bearbeiten archivierter Kündigungen ist „Kündigungsarchiv → Bearbeiten“ erforderlich');
}
function lockedTermination(array $u,int $id,string $rev): array {
    $r=sql('SELECT k.*,'.terminationCurrentExpr('k').' AS aktuell FROM kuendigungen k WHERE k.id=? FOR UPDATE',[$id]);
    if(!$r)fail(404,'Kündigung nicht gefunden');
    terminationWriteAccess($u,$r[0]);
    if((string)$r[0]['row_revision']!==$rev)versionConflict();
    return $r[0];
}
function terminationDoc(string $name,string $url,string $fallback='Dokument'): string {
    if(strlen($name)>250||strlen($url)>2048)fail(400,'Dokumentenname oder URL zu lang');
    if($url!==''){
        $p=parse_url($url);
        if(!is_array($p)||($p['scheme']??'')!=='https'||!str_contains((string)($p['host']??''),'.')||
           isset($p['user'])||isset($p['pass'])||preg_match('/\s/',$url))
           fail(400,'Bitte einen gültigen HTTPS-Link eingeben');
    }
    return $name!==''||$url!==''?json_encode(['t'=>$name?:$fallback,'u'=>$url],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR):'';
}
function dispatchTerminationEditing(array $u,string $method,string $uri): bool {
    if($method==='POST'&&$uri==='/api/kuendigung'){
        needRight($u,'kue',2);$b=body();
        $fields=['personalnummer','vorname','nachname','rang','grund','handy','vertrag',
            'eintritt','urkunde','zeugnis','kuendigung','waffe','copnet','emd','ic',
            'discord','dienstgegenstaende','anzeige'];
        $values=[];
        foreach($fields as $key){
            $v=$key==='personalnummer'?($b['nr']??null):($b[$key]??null);
            if(in_array($key,['waffe','copnet','emd','ic','discord','dienstgegenstaende'],true))$v=$v?:'Offen';
            if($key==='anzeige')$v=$v?:'Nein';
            if($key==='eintritt')$v=$v?:null;
            if($v!==null&&!is_string($v)&&!is_int($v))fail(400,'Ungültiger Kündigungseintrag');
            if(is_string($v)&&strlen($v)>10000)fail(400,'Eintrag zu lang');
            $values[]=$v;
        }
        db()->beginTransaction();
        try {
            $nr=filter_var($b['nr']??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]])?:null;
            $saved=null;
            if($nr){
                $p=sql('SELECT * FROM personal WHERE personalnummer=? FOR UPDATE',[$nr]);
                if($p){
                    $snapshot=$p[0];unset($snapshot['row_revision']);
                    $docs=sql('SELECT typ,titel,url,erstellt FROM generierte_dokumente WHERE personalnummer=?',[$nr]);
                    $saved=json_encode([
                        'quelle'=>'bei_erstellung','gesichert_am'=>gmdate('Y-m-d\TH:i:s\Z'),
                        'personal'=>$snapshot,'generierte_dokumente'=>$docs
                    ],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
                }
            }
            sql('INSERT INTO kuendigungen('.implode(',',$fields).',personal_snapshot)
                VALUES('.implode(',',array_fill(0,count($fields)+1,'?')).')',[...$values,$saved]);
            $id=(int)db()->lastInsertId();
            $record=sql('SELECT *,row_revision AS _revision FROM kuendigungen WHERE id=?',[$id])[0];
            unset($record['personal_snapshot'],$record['row_revision']);
            $record['_revision']=(string)$record['_revision'];
            auditAction($u,'Kündigung angelegt: '.($b['nachname']??''),'add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,$record);
    }
    if($method==='PATCH'&&preg_match('#^/api/kuendigung/([1-9][0-9]*)/dokumente$#D',$uri,$m)){
        needRight($u,'kue',2);$id=cleanId($m[1]);$revision=expectedRevision();$b=body();
        $docs=$b['dokumente']??null;$fields=['vertrag','urkunde','zeugnis','kuendigung'];
        if(!is_array($docs)||array_is_list($docs)||count($docs)!==4||
           array_diff(array_keys($docs),$fields))fail(400,'Ungültige Dokumentangaben');
        $values=[];
        foreach($fields as $f){
            $entry=$docs[$f]??null;
            if(!is_array($entry)||!is_string($entry['name']??null)||!is_string($entry['url']??null))
                fail(400,'Dokumentname und Link müssen Text sein');
            $values[]=terminationDoc(trim($entry['name']),trim($entry['url']),
                ['vertrag'=>'Arbeitsvertrag','urkunde'=>'Ernennungsurkunde',
                  'zeugnis'=>'Arbeitszeugnis','kuendigung'=>'Kündigung'][$f]);
        }
        db()->beginTransaction();
        try{
            lockedTermination($u,$id,$revision);
            $stmt=db()->prepare('UPDATE kuendigungen SET vertrag=?,urkunde=?,zeugnis=?,kuendigung=?
                  WHERE id=? AND row_revision=?');
            $stmt->execute([...$values,$id,$revision]);
            if($stmt->rowCount()!==1)versionConflict();
            $record=sql('SELECT id,vertrag,urkunde,zeugnis,kuendigung,row_revision AS _revision
                FROM kuendigungen WHERE id=?',[$id])[0];
            $record['_revision']=(string)$record['_revision'];
            auditAction($u,'Dokumente in Kündigungsvorgang '.$id.' bearbeitet');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'dokumente'=>$record,'_revision'=>$record['_revision']]);
    }
    if($method==='PATCH'&&preg_match('#^/api/kuendigung/([1-9][0-9]*)/dokument$#D',$uri,$m)){
        needRight($u,'kue',2);$id=cleanId($m[1]);$rev=expectedRevision();$b=body();
        $field=$b['feld']??null;$name=trim((string)($b['name']??''));$url=trim((string)($b['url']??''));
        if(!in_array($field,['vertrag','urkunde','zeugnis','kuendigung'],true))
            fail(400,'Ungültiger Dokumenteintrag');
        $value=terminationDoc($name,$url);
        db()->beginTransaction();
        try{
            lockedTermination($u,$id,$rev);
            $stmt=db()->prepare('UPDATE kuendigungen SET '.$field.'=? WHERE id=? AND row_revision=?');
            $stmt->execute([$value,$id,$rev]);
            if($stmt->rowCount()!==1)versionConflict();
            auditAction($u,'Kündigungsdokument '.$field.' im Vorgang '.$id.' geändert');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    if($method==='PATCH'&&preg_match('#^/api/kuendigung/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'kue',2);$id=cleanId($m[1]);$rev=expectedRevision();$b=body();
        $options=['waffe'=>['Offen','Informiert'],'copnet'=>['Offen','Entfernt'],
            'emd'=>['Offen','Entfernt'],'ic'=>['Offen','Entfernt'],
            'discord'=>['Offen','Entfernt'],'dienstgegenstaende'=>['Offen','Entfernt'],
            'anzeige'=>['Nein','Ja']];
        if(count($b)!==1||!isset($options[array_key_first($b)]))fail(400,'Ungültiges Feld');
        $field=array_key_first($b);$status=$b[$field];
        if(!in_array($status,$options[$field],true))fail(400,'Ungültiger Status');
        db()->beginTransaction();
        try{
            lockedTermination($u,$id,$rev);
            $stmt=db()->prepare('UPDATE kuendigungen SET '.$field.'=? WHERE id=? AND row_revision=?');
            $stmt->execute([$status,$id,$rev]);
            if($stmt->rowCount()!==1)versionConflict();
            $new=(string)sql('SELECT row_revision FROM kuendigungen WHERE id=?',[$id])[0]['row_revision'];
            auditAction($u,'Kündigung '.$id.': '.$field.' → '.$status);
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'_revision'=>$new]);
    }
    if($method==='DELETE'&&preg_match('#^/api/kuendigung/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'kue',2);$id=cleanId($m[1]);$rev=expectedRevision();
        db()->beginTransaction();
        try{
            $record=lockedTermination($u,$id,$rev);
            unset($record['row_revision'],$record['aktuell']);
            foreach(['personal_snapshot'] as $field){
                if(is_string($record[$field]??null))$record[$field]=json_decode($record[$field],true);
            }
            $title=trim(($record['vorname']??'').' '.($record['nachname']??''))?:'Kündigung '.$id;
            sql("INSERT INTO idv_papierkorb(bereich,schluessel,titel,datensatz,geloescht_von)
                 VALUES('kuendigungen',?,?,?,?)",[
                (string)$id,$title,json_encode($record,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']
            ]);
            sql('DELETE FROM kuendigungen WHERE id=?',[$id]);
            auditAction($u,'Kündigung in Papierkorb verschoben: '.$id,'del');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'im_papierkorb'=>true]);
    }
    return false;
}
