<?php
declare(strict_types=1);
namespace IDV;

function legacyOrg(): array {
    $rows=normalizedRows('SELECT zeile FROM organigramm ORDER BY sortierung,id',[],['zeile']);
    $grid=array_map(fn($r)=>is_array($r['zeile']??null)?$r['zeile']:[],$rows);
    $leader=trim((string)($grid[1][0]??''));
    $council=array_values(array_filter(array_map(fn($x)=>trim((string)$x),$grid[3]??[])));
    $units=[];
    foreach($grid[5]??[] as $col=>$raw) {
        $parts=explode("\n",(string)$raw);
        $name=trim(array_shift($parts));
        if($name==='')continue;
        $responsibility=preg_replace('/^Zuständig\s*:\s*/iu','',trim(implode(' ',$parts)));
        $tasks=[];foreach(array_slice($grid,7) as $row){
            $value=trim((string)($row[$col]??''));
            if($value!=='')$tasks[]=$value;
        }
        $units[]=['name'=>$name,'zust'=>$responsibility,'tasks'=>$tasks];
    }
    return ['leitung'=>$leader,'raete'=>$council,'bereiche'=>$units];
}
function orgBody(array $b): array {
    if(!is_string($b['leitung']??null)||strlen(trim($b['leitung']))>180)fail(400,'Ungültiger Polizeioberrat');
    $raete=$b['raete']??null;$bereiche=$b['bereiche']??null;
    if(!is_array($raete)||count($raete)>20||!is_array($bereiche)||count($bereiche)>20)
        fail(400,'Ungültige Organigramm-Daten');
    $cleanRaete=[];
    foreach($raete as $v) {
        if(!is_string($v)||trim($v)===''||strlen(trim($v))>180)fail(400,'Ungültige Polizeiräte');
        $cleanRaete[]=trim($v);
    }
    $cleanUnits=[];$names=[];
    foreach($bereiche as $unit){
        if(!is_array($unit)||!is_string($unit['name']??null)||!is_string($unit['zust']??null)||
            !is_array($unit['tasks']??null))fail(400,'Ungültige Aufgabenbereiche');
        $name=trim($unit['name']);$detail=trim($unit['zust']);
        if($name===''||strlen($name)>180||strlen($detail)>250||count($unit['tasks'])>40)
            fail(400,'Ungültige Aufgabenbereiche');
        $normalized=strtolower($name);
        if(isset($names[$normalized]))fail(400,'Aufgabenbereiche dürfen nicht doppelt vorkommen');
        $names[$normalized]=true;
        $tasks=[];
        foreach($unit['tasks'] as $t){
            if(!is_string($t)||trim($t)===''||strlen(trim($t))>500)fail(400,'Ungültige Aufgabe');
            $tasks[]=trim($t);
        }
        $cleanUnits[]=['name'=>$name,'zust'=>$detail,'tasks'=>$tasks];
    }
    return ['leitung'=>trim($b['leitung']),'raete'=>$cleanRaete,'bereiche'=>$cleanUnits];
}
function dispatchOrg(array $u,string $method,string $uri): bool {
    if($uri!=='/api/organigramm')return false;
    if($method==='GET'){
        needRight($u,'org');
        $r=normalizedRows('SELECT inhalt,version FROM organigramm_layout WHERE id=1',[],['inhalt']);
        respond(200,$r[0]??['inhalt'=>legacyOrg(),'version'=>0]);
    }
    if($method==='PUT'){
        needRight($u,'org',2);$b=body();$v=$b['version']??null;
        if(!is_int($v)||$v<0)fail(400,'Ungültige Organigramm-Version');
        $data=orgBody($b['inhalt']??[]);$json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $stmt=db()->prepare($v===0
            ?'INSERT IGNORE INTO organigramm_layout(id,inhalt,version) VALUES(1,?,1)'
            :'UPDATE organigramm_layout SET inhalt=?,version=version+1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=1 AND version=?');
        $stmt->execute($v===0?[$json]:[$json,$v]);
        if($stmt->rowCount()!==1)fail(409,'Das Organigramm wurde zwischenzeitlich geändert. Bitte neu laden.');
        $r=normalizedRows('SELECT inhalt,version FROM organigramm_layout WHERE id=1',[],['inhalt']);
        auditAction($u,'Organigramm geändert (Version '.$r[0]['version'].')');
        respond(200,$r[0]);
    }
    return false;
}
