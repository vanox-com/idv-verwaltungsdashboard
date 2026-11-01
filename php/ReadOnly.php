<?php
declare(strict_types=1);
namespace IDV;

use PDO;

function designValue(?array $row): array {
    if (!$row) return ['akzent'=>'#5b86ba','schleier'=>88,'hintergrund'=>'wappen','extras'=>new \stdClass()];
    $extras=$row['extras']??null;
    if(is_string($extras)){
        $parsed=json_decode($extras,true);
        $extras=is_array($parsed)?$parsed:new \stdClass();
    }
    return [
        'akzent'=>$row['akzent'],'schleier'=>(int)$row['schleier'],
        'hintergrund'=>$row['hintergrund'],'extras'=>$extras??new \stdClass()
    ];
}
function handlePortalDesign(array $u): never {
    $global=sql('SELECT akzent,schleier,hintergrund,extras FROM portal_design WHERE id=1 LIMIT 1');
    $own=sql('SELECT akzent,schleier,hintergrund,extras FROM portal_design_personal WHERE user_id=? LIMIT 1',[$u['id']]);
    $standard=designValue($global[0]??null);
    respond(200,array_merge(designValue($own[0]??($global[0]??null)),
       ['standard'=>$standard,'persoenlich'=>!empty($own)]));
}
function handleProtocol(array $user,string $kind): never {
    $rights=rights($user);
    if(($rights['log']??0)<1)fail(403,'Keine Berechtigung für das Protokoll');
    $view=$_GET['ansicht']??null;
    if($view!==null&&!in_array($view,['aktuell','archiv'],true))
        fail(400,'Ungültige Protokollansicht');
    $page=filter_var($_GET['seite']??1,FILTER_VALIDATE_INT,
        ['options'=>['min_range'=>1,'max_range'=>100000]]);
    if($page===false)fail(400,'Ungültige Protokollseite');
    $isAudit=$kind==='personal-audit';
    $query=$isAudit
      ?"SELECT a.personalnummer,a.zeit,a.aenderungen,COALESCE(u.anzeigename,'–') AS benutzer
          FROM personal_audit a LEFT JOIN users u ON u.id=a.user_id"
      :"SELECT l.zeit,l.aktion,l.art,COALESCE(u.anzeigename,'–') AS benutzer
          FROM log l LEFT JOIN users u ON u.id=l.user_id";
    if($view!==null){
        $column=$isAudit?'a.zeit':'l.zeit';
        $comparison=$view==='archiv'?'<':'>=';
        $query.=" WHERE {$column} {$comparison} DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 3 DAY)";
    }
    $query.= $isAudit?' ORDER BY a.zeit DESC,a.id DESC':' ORDER BY l.zeit DESC,l.id DESC';
    $limit=$view!==null?101:($isAudit?200:500);
    $offset=$view!==null?($page-1)*100:0;
    $stmt=db()->prepare($query.' LIMIT ? OFFSET ?');
    $stmt->bindValue(1,$limit,PDO::PARAM_INT);
    $stmt->bindValue(2,$offset,PDO::PARAM_INT);
    $stmt->execute();
    $rows=$stmt->fetchAll(PDO::FETCH_ASSOC);
    if($isAudit){
        foreach($rows as &$row){
            if(is_string($row['aenderungen']??null)){
                $decoded=json_decode($row['aenderungen'],true);
                $row['aenderungen']=is_array($decoded)?$decoded:[];
            }
        }
        unset($row);
    }
    respond(200,$rows);
}
