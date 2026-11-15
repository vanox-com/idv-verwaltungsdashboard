<?php
declare(strict_types=1);
namespace IDV;

const RL_DEFAULT_MASSNAHMEN = [
    ['id'=>1,'text'=>'Mündliche Ermahnung'],['id'=>2,'text'=>'Schriftliche Verwarnung'],
    ['id'=>3,'text'=>'Schriftliche Abmahnung'],['id'=>4,'text'=>'Degradierung nach PDV §28'],
    ['id'=>5,'text'=>'Beförderungssperre'],['id'=>6,'text'=>'Entlassung nach PDV §33'],
    ['id'=>7,'text'=>'Anordnung von Weiterbildungskursen'],['id'=>8,'text'=>'Entziehung abgelegter Prüfungen'],
    ['id'=>9,'text'=>'Nicht diensttauglich'],['id'=>10,'text'=>'Anordnung sportlicher oder erzieherischer Maßnahmen'],
    ['id'=>11,'text'=>'Suspendierung']
];
function rlSnapshot(bool $lock=false): array {
    $option=sql('SELECT werte FROM system_optionen WHERE schluessel=?'.($lock?' FOR UPDATE':''),['disziplin_massnahmen']);
    $catalog=$option?json_decode((string)$option[0]['werte'],true):RL_DEFAULT_MASSNAHMEN;
    if(!is_array($catalog))$catalog=RL_DEFAULT_MASSNAHMEN;
    $rows=sql('SELECT id,stand,pdv,text_kurz,mild,hart,sonst,anmerkung,sortierung FROM richtlinie ORDER BY sortierung,id'.($lock?' FOR UPDATE':''));
    foreach($rows as &$row)foreach(['stand','pdv','text_kurz','mild','hart','sonst','anmerkung'] as $f)
        $row[$f]=(string)($row[$f]??'');
    unset($row);
    $revision=hash('sha256',json_encode([$rows,$catalog],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    return ['zeilen'=>$rows,'massnahmen'=>$catalog,'revision'=>$revision,'stand'=>$rows[0]['stand']??''];
}
function dispatchDisziplinRichtlinie(array $u,string $method,string $uri): bool {
    if($uri!=='/api/disziplinrichtlinie')return false;
    if($method==='GET'){
        needRight($u,'rl',1);
        respond(200,rlSnapshot());
    }
    if($method!=='PUT')return false;
    needRight($u,'rlbearb',2);
    $body=body();$catalog=$body['massnahmen']??null;$rows=$body['zeilen']??null;
    if(!is_array($catalog)||!array_is_list($catalog)||count($catalog)>100||
       !is_array($rows)||!array_is_list($rows)||count($rows)>1000||
       !is_string($body['revision']??null))fail(400,'Ungültige Richtliniendaten');
    $ids=[];
    foreach($catalog as $m){
        if(!is_array($m)||!is_int($m['id']??null)||$m['id']<1||$m['id']>9999||
           !is_string($m['text']??null)||strlen(trim($m['text']))<2||strlen($m['text'])>750||
           isset($ids[$m['id']]))fail(400,'Ungültiger oder doppelter Maßnahmenpunkt');
        $ids[$m['id']]=true;
    }
    foreach($rows as $r){
        if(!is_array($r))fail(400,'Ungültiger Richtlinieneintrag');
        foreach(['pdv','text_kurz','mild','hart','sonst','anmerkung'] as $f)
            if(!is_string($r[$f]??null)||strlen($r[$f])>6000)fail(400,'Ungültiges Feld: '.$f);
        if(trim($r['pdv'])===''||trim($r['text_kurz'])==='')fail(400,'PDV und Beschreibung sind erforderlich');
        foreach(['mild','hart'] as $f)
            if(preg_match('/^Punkt\s+(\d+)$/iu',trim($r[$f]),$m)&&!isset($ids[(int)$m[1]]))
                fail(400,'Ein Eintrag verweist auf einen entfernten Maßnahmenpunkt '.$m[1]);
    }
    db()->beginTransaction();
    try{
        // The option row acts as a transaction-wide lock, even for an empty guideline table.
        sql('INSERT IGNORE INTO system_optionen(schluessel,werte) VALUES(?,?)',
            ['disziplin_massnahmen',json_encode(RL_DEFAULT_MASSNAHMEN,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        $current=rlSnapshot(true);
        if(!hash_equals($current['revision'],$body['revision'])){
            db()->rollBack();fail(409,'Richtlinie wurde inzwischen geändert. Bitte neu laden.');
        }
        sql('UPDATE system_optionen SET werte=?,aktualisiert=UTC_TIMESTAMP(6) WHERE schluessel=?',
            [json_encode($catalog,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'disziplin_massnahmen']);
        sql('DELETE FROM richtlinie');
        $stand=is_string($body['stand']??null)?substr($body['stand'],0,100):'';
        foreach($rows as $i=>$r)
            sql('INSERT INTO richtlinie(stand,pdv,text_kurz,mild,hart,sonst,anmerkung,sortierung) VALUES(?,?,?,?,?,?,?,?)',
                [$stand,$r['pdv'],$r['text_kurz'],$r['mild'],$r['hart'],$r['sonst'],$r['anmerkung'],$i]);
        auditAction($u,'Disziplinarrichtlinie bearbeitet ('.count($rows).' Einträge, '.count($catalog).' Maßnahmen)');
        db()->commit();
    }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
    respond(200,['ok'=>true]);
}
