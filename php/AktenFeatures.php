<?php
declare(strict_types=1);
namespace IDV;

function journalScope(array $rights): array {
    $map=['personal'=>'pers','kuendigungen'=>'kue','disziplin'=>'dis',
        'sonderfunktionen'=>'sonder','checklisten'=>'chk','textbausteine'=>'texte',
        'routine'=>'rout','sonderzahlungen'=>'rout'];
    return array_keys(array_filter($map,fn($right)=>($rights[$right]??0)>=1));
}
function fieldChanges(mixed $json): array {
    if(is_string($json))$json=json_decode($json,true);
    if(!is_array($json))return [];
    $rows=[];
    foreach($json as $key=>$value)$rows[]=['feld'=>$key,'alt'=>$value['alt']??null,'neu'=>$value['neu']??null];
    return $rows;
}
function sortedEvents(array $items): array {
    usort($items,fn($a,$b)=>strcmp((string)($b['zeit']??''),(string)($a['zeit']??'')));
    return array_slice($items,0,250);
}
function restoreSqlRecord(string $table,array $record): void {
    if(!in_array($table,['kuendigungen','checklisten'],true))
        throw new \LogicException('Invalid restore table');
    $permitted=array_column(sql('SELECT column_name AS fieldname FROM information_schema.columns
        WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position',[$table]),'fieldname');
    $data=array_intersect_key($record,array_flip($permitted));
    unset($data['row_revision']);
    if(!$data)fail(409,'Wiederherstellungsdaten fehlen');
    foreach($data as $name=>&$value) {
        if(!preg_match('/^[a-z_]+$/D',$name))throw new \LogicException('Unexpected data field');
        if(is_array($value)||is_object($value))$value=json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    }unset($value);
    $quoted=array_map(fn($x)=>chr(96).$x.chr(96),array_keys($data));
    sql('INSERT INTO '.chr(96).$table.chr(96).'('.implode(',',$quoted).')
        VALUES('.implode(',',array_fill(0,count($quoted),'?')).')',array_values($data));
}
function dispatchRecordFeatures(array $u,string $method,string $uri): bool {
    if($method==='GET'&&preg_match('#^/api/akten/([1-9][0-9]*)/laufbahn$#D',$uri,$m)){
        needRight($u,'pers');needRight($u,'persverlauf');
        $nr=cleanId($m[1]);$rights=rights($u);$scope=journalScope($rights);
        $person=sql('SELECT personalnummer,vorname,nachname,status,dienstgrad,eintrittsdatum,
                        letzte_befoerderung FROM personal WHERE personalnummer=?',[$nr]);
        if(!$person)fail(404,'Personalakte nicht gefunden');
        $p=$person[0];$events=[];
        if($p['eintrittsdatum'])$events[]=['zeit'=>$p['eintrittsdatum'],'titel'=>'Dienstantritt',
            'bereich'=>'personal','typ'=>'eintritt','details'=>[],'benutzer'=>null];
        $journal=[];
        if($scope){
            $marks=implode(',',array_fill(0,count($scope),'?'));
            $journal=normalizedRows("SELECT a.zeit,a.bereich,a.vorgang,a.felder,us.anzeigename AS benutzer
              FROM idv_aenderungen a LEFT JOIN users us ON us.id=a.user_id
              WHERE a.personalnummer=? AND a.bereich IN (".$marks.")
              ORDER BY a.zeit DESC,a.id DESC LIMIT 150",[$nr,...$scope],['felder']);
        }
        $old=normalizedRows("SELECT a.zeit,a.aenderungen,us.anzeigename AS benutzer
            FROM personal_audit a LEFT JOIN users us ON us.id=a.user_id
            WHERE a.personalnummer=? AND a.zeit <
              COALESCE((SELECT MIN(zeit) FROM idv_aenderungen
                  WHERE bereich='personal' AND personalnummer=?),'9999-12-31')
            ORDER BY a.zeit DESC LIMIT 75",[$nr,$nr],['aenderungen']);
        $promotions=($rights['bef']??0)>=1?
            sql('SELECT am,rang,neu_rang,grund,erstellt FROM befoerderungen
                WHERE personalnummer=? ORDER BY erstellt DESC LIMIT 60',[$nr]):[];
        $applications=($rights['ranghistorie']??0)>=1?
            sql('SELECT erstellt,entschieden_am,alter_rang,beantragter_rang,status
                  FROM personal_rangantraege WHERE personalnummer=? ORDER BY erstellt DESC LIMIT 60',[$nr]):[];
        $docs=($rights['pers']??0)>=2?sql('SELECT erstellt,typ,titel FROM generierte_dokumente
             WHERE personalnummer=? ORDER BY erstellt DESC LIMIT 60',[$nr]):[];
        if($p['letzte_befoerderung']&&($rights['bef']??0)>=1){
            $known=false;foreach($promotions as $b)if(substr((string)$b['am'],0,10)===substr((string)$p['letzte_befoerderung'],0,10))$known=true;
            if(!$known)$events[]=['zeit'=>$p['letzte_befoerderung'],'titel'=>'Letzte bekannte Beförderung',
               'bereich'=>'bef','typ'=>'bef','details'=>[['feld'=>'Dienstgrad','alt'=>null,'neu'=>$p['dienstgrad']]],
               'benutzer'=>null];
        }
        foreach($journal as $j)$events[]=['zeit'=>$j['zeit'],'titel'=>$j['vorgang'].' · '.$j['bereich'],
            'bereich'=>$j['bereich'],'typ'=>'journal','details'=>fieldChanges($j['felder']),
            'benutzer'=>$j['benutzer']??null];
        foreach($old as $a)$events[]=['zeit'=>$a['zeit'],'titel'=>'Historische Personaländerung',
            'bereich'=>'personal','typ'=>'journal','details'=>fieldChanges($a['aenderungen']),
            'benutzer'=>$a['benutzer']??null];
        foreach($promotions as $b)$events[]=['zeit'=>$b['am']?:$b['erstellt'],
            'titel'=>'Beförderung: '.($b['rang']?:'–').' → '.($b['neu_rang']?:'–'),
            'bereich'=>'bef','typ'=>'bef','details'=>$b['grund']?[['feld'=>'Grund','alt'=>null,'neu'=>$b['grund']]]:[],
            'benutzer'=>null];
        foreach($applications as $a)$events[]=['zeit'=>$a['entschieden_am']?:$a['erstellt'],
            'titel'=>'Rangantrag '.$a['status'].': '.$a['alter_rang'].' → '.$a['beantragter_rang'],
            'bereich'=>'bef','typ'=>'antrag','details'=>[],'benutzer'=>null];
        foreach($docs as $d)$events[]=['zeit'=>$d['erstellt'],'titel'=>'Dokument erstellt: '.$d['titel'],
            'bereich'=>'personal','typ'=>'dokument',
            'details'=>[['feld'=>'Dokumenttyp','alt'=>null,'neu'=>$d['typ']]],'benutzer'=>null];
        if(($rights['dis']??0)>=1){
            $dis=normalizedRows('SELECT slots FROM disziplin WHERE personalnummer=?',[$nr],['slots']);
            $names=['Ermahnung','Verwarnung','Abmahnung','Suspendierung','Degradierung','Entlassung'];
            foreach(($dis[0]['slots']??[]) as $i=>$item){
                if(!empty($item['done'])&&!empty($item['d']))
                    $events[]=['zeit'=>$item['d'],'titel'=>'Disziplinarmaßnahme: '.($names[$i]??'Maßnahme'),
                      'bereich'=>'disziplin','typ'=>'dis',
                      'details'=>[['feld'=>'Bezeichnung','alt'=>null,'neu'=>$item['t']??'']],'benutzer'=>null];
            }
        }
        respond(200,['person'=>[
            'personalnummer'=>$nr,'name'=>trim(($p['vorname']??'').' '.($p['nachname']??'')),
            'dienstgrad'=>$p['dienstgrad'],'status'=>$p['status']],
            'ereignisse'=>sortedEvents($events)]);
    }
    if($method==='GET'&&$uri==='/api/aenderungsvergleich'){
        needRight($u,'log');$rights=rights($u);$scope=journalScope($rights);
        if(!$scope)respond(200,[]);
        $filter=(string)($_GET['bereich']??'');$view=$_GET['ansicht']??null;
        if($filter!==''&&!in_array($filter,$scope,true))fail(403,'Kein Zugriff auf diesen Bereich');
        if($view!==null&&!in_array($view,['aktuell','archiv'],true))fail(400,'Ungültige Protokollansicht');
        $page=filter_var($_GET['seite']??1,FILTER_VALIDATE_INT);
        if(!$page||$page<1||$page>100000)fail(400,'Ungültige Protokollseite');
        $limit=$view!==null?101:filter_var($_GET['limit']??80,FILTER_VALIDATE_INT);
        if(!$limit||$limit<1||$limit>150)fail(400,'Ungültige Protokollgröße');
        $scope=$filter!==''?[$filter]:$scope;
        $marks=implode(',',array_fill(0,count($scope),'?'));
        $sql="SELECT a.id,a.zeit,a.bereich,a.schluessel,a.personalnummer,a.vorgang,a.felder,
                     us.anzeigename AS benutzer
              FROM idv_aenderungen a LEFT JOIN users us ON us.id=a.user_id
              WHERE a.bereich IN (".$marks.")";
        if($view!==null)$sql.=" AND a.zeit ".($view==='archiv'?'<':'>=')." DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 3 DAY)";
        $sql.=$view!==null?' ORDER BY a.zeit DESC,a.id DESC':' ORDER BY a.id DESC';
        $sql.=' LIMIT ?';
        if($view!==null)$sql.=' OFFSET ?';
        $stmt=db()->prepare($sql);
        $index=1;foreach($scope as $s)$stmt->bindValue($index++,$s,\PDO::PARAM_STR);
        $stmt->bindValue($index++,$limit,\PDO::PARAM_INT);
        if($view!==null)$stmt->bindValue($index,($page-1)*100,\PDO::PARAM_INT);
        $stmt->execute();
        $rows=$stmt->fetchAll();
        foreach($rows as &$r){$r['details']=fieldChanges($r['felder']);unset($r['felder']);}unset($r);
        respond(200,$rows);
    }
    if($method==='GET'&&$uri==='/api/papierkorb'){
        needRight($u,'papierkorb');$rights=rights($u);
        $scope=[];
        foreach(['kuendigungen'=>'kue','checklisten'=>'chk','textbausteine'=>'texte'] as $key=>$right)
            if(($rights[$right]??0)>=1)$scope[]=$key;
        if($u['rolle']==='Administrator')$scope[]='personal';
        if(!$scope)respond(200,[]);
        $rows=sql("SELECT p.id,p.bereich,p.schluessel,p.titel,p.geloescht_am,
           us.anzeigename AS geloescht_von
           FROM idv_papierkorb p LEFT JOIN users us ON us.id=p.geloescht_von
           WHERE p.wiederhergestellt_am IS NULL AND p.bereich IN (".
           implode(',',array_fill(0,count($scope),'?')).")
           ORDER BY p.id DESC LIMIT 150",$scope);
        respond(200,$rows);
    }
    if($method==='POST'&&preg_match('#^/api/papierkorb/([1-9][0-9]*)/wiederherstellen$#D',$uri,$m)){
        needRight($u,'papierkorb',2);$id=cleanId($m[1]);
        db()->beginTransaction();
        try{
            $found=normalizedRows('SELECT * FROM idv_papierkorb WHERE id=? AND wiederhergestellt_am IS NULL FOR UPDATE',
                [$id],['datensatz','zusatz']);
            if(!$found)fail(404,'Papierkorb-Eintrag nicht mehr vorhanden');
            $entry=$found[0];$area=$entry['bereich'];$record=$entry['datensatz'];
            if(!is_array($record))fail(409,'Ungültiger archivierter Datensatz');
            if($area==='personal'&&$u['rolle']!=='Administrator')
                fail(403,'Nur Administratoren können Personaldatensätze wiederherstellen');
            if($area!=='personal'){
                $map=['kuendigungen'=>'kue','checklisten'=>'chk','textbausteine'=>'texte'];
                if(!isset($map[$area])||(rights($u)[$map[$area]]??0)<2)
                    fail(403,'Für die Wiederherstellung fehlt das Bearbeitungsrecht im ursprünglichen Bereich');
            }
            if($area==='kuendigungen')restoreSqlRecord('kuendigungen',$record);
            elseif($area==='checklisten'){
                restoreSqlRecord('checklisten',$record);
                foreach(is_array($entry['zusatz']??null)?$entry['zusatz']:[] as $r)
                    sql('INSERT INTO checklisten_status(name,punkt,erledigt)
                        VALUES(?,?,?)',[$r['name'],$r['punkt'],!empty($r['erledigt'])?1:0]);
            }elseif($area==='personal'){
                $nr=filter_var($record['personalnummer']??null,FILTER_VALIDATE_INT);
                if(!$nr||(string)$nr!==(string)$entry['schluessel'])fail(409,'Ungültiger Personaldatensatz');
                $stmt=db()->prepare('UPDATE personal SET administrativ_geloescht_am=NULL,
                     administrativ_geloescht_von=NULL
                     WHERE personalnummer=? AND administrativ_geloescht_am IS NOT NULL');
                $stmt->execute([$nr]);
                if($stmt->rowCount()!==1)fail(409,'Personaldatensatz ist nicht mehr im Papierkorb');
            }elseif($area==='textbausteine'){
                $stmt=db()->prepare('UPDATE textbausteine SET geloescht=0
                    WHERE schluessel=? AND geloescht=1 AND titel=? AND inhalt=? AND kategorie=?');
                $stmt->execute([$entry['schluessel'],$record['titel']??null,
                    $record['inhalt']??null,$record['kategorie']??null]);
                if($stmt->rowCount()!==1)fail(409,'Textbaustein wurde seit dem Löschen geändert');
            }else fail(400,'Unbekannter Datensatztyp');
            sql('UPDATE idv_papierkorb SET wiederhergestellt_am=UTC_TIMESTAMP(6),
                wiederhergestellt_von=? WHERE id=?',[$u['id'],$id]);
            auditAction($u,'Aus Papierkorb wiederhergestellt: '.$area.' / '.$entry['schluessel']);
            db()->commit();
        }catch(\PDOException $e){
            if(db()->inTransaction())db()->rollBack();
            if($e->getCode()==='23000')fail(409,'Wiederherstellung nicht möglich: Eintrag oder Zuordnung kollidiert');
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'bereich'=>$area,'schluessel'=>$entry['schluessel']]);
    }
    return false;
}
