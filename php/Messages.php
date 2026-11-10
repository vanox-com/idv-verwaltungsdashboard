<?php
declare(strict_types=1);
namespace IDV;

function messageDates(array $b): array {
    $values=[];
    foreach(['sichtbar_ab','sichtbar_bis'] as $name){
        $v=$b[$name]??null;
        if($v===null||$v===''){$values[]=null;continue;}
        if(!is_string($v)||strlen($v)>60)fail(400,'Ungültiger Anzeigezeitraum');
        try{$d=new \DateTimeImmutable($v);}
        catch(\Throwable $e){fail(400,'Ungültiger Anzeigezeitraum');}
        $values[]=$d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    }
    if($values[0]!==null&&$values[1]!==null&&$values[0]>=$values[1])
        fail(400,'Ungültiger Anzeigezeitraum');
    return $values;
}
function messageBody(array $b): array {
    $title=trim((string)($b['titel']??''));$content=trim((string)($b['inhalt']??''));
    if($title===''||$content===''||strlen($title)>140||strlen($content)>3000)
        fail(400,'Ungültige Mitteilung oder Empfänger');
    [$from,$until]=messageDates($b);
    return [$title,$content,$from,$until];
}
function dispatchMessages(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/mitteilungen'){
        needRight($u,'mitteilungen');
        respond(200,sql('SELECT m.id,m.titel,m.inhalt,m.erstellt FROM portal_meldungen m
            JOIN portal_meldung_empfaenger e ON e.meldung_id=m.id
            WHERE e.user_id=? AND e.ausgeblendet_am IS NULL
              AND (m.sichtbar_ab IS NULL OR m.sichtbar_ab<=UTC_TIMESTAMP(6))
              AND (m.sichtbar_bis IS NULL OR m.sichtbar_bis>UTC_TIMESTAMP(6))
            ORDER BY m.erstellt DESC LIMIT 30',[$u['id']]));
    }
    if($method==='GET'&&$uri==='/api/mitteilungen/empfaenger'){
        needRight($u,'mitteilungen',2);
        respond(200,[
            'users'=>sql('SELECT id,anzeigename,rolle,dienstnummer FROM users WHERE gesperrt=0 ORDER BY anzeigename'),
            'gruppen'=>array_column(sql("SELECT DISTINCT gruppe FROM personal WHERE gruppe IS NOT NULL AND gruppe<>'' ORDER BY gruppe"),'gruppe')
        ]);
    }
    if($method==='GET'&&$uri==='/api/mitteilungen/verwaltung'){
        needRight($u,'mitteilungen',2);
        respond(200,sql('SELECT m.id,m.titel,m.inhalt,m.erstellt,m.sichtbar_ab,m.sichtbar_bis,
          COUNT(e.user_id) AS empfaenger FROM portal_meldungen m
          LEFT JOIN portal_meldung_empfaenger e ON e.meldung_id=m.id
          GROUP BY m.id ORDER BY m.erstellt DESC LIMIT 150'));
    }
    if($method==='POST'&&$uri==='/api/mitteilungen'){
        needRight($u,'mitteilungen',2);$b=body();
        [$title,$content,$from,$until]=messageBody($b);
        $ids=$b['userIds']??[];$roles=$b['rollen']??[];$groups=$b['gruppen']??[];
        if(!is_array($ids)||!is_array($roles)||!is_array($groups)||
            count($ids)>500||count($roles)>30||count($groups)>40||
            (count($ids)+count($roles)+count($groups))===0)
            fail(400,'Ungültige Mitteilung oder Empfänger');
        foreach($ids as $id)if(!is_int($id)||$id<1)fail(400,'Ungültiger Empfänger');
        foreach([...$roles,...$groups] as $x)if(!is_string($x)||strlen($x)>=100)fail(400,'Ungültiger Empfänger');
        $conditions=[];$args=[];
        foreach([['u.id',$ids],['u.rolle',$roles],['p.gruppe',$groups]] as [$col,$items]){
            if(!$items)continue;
            $conditions[]=$col.' IN ('.implode(',',array_fill(0,count($items),'?')).')';
            array_push($args,...$items);
        }
        db()->beginTransaction();
        try{
            $users=sql("SELECT DISTINCT u.id FROM users u LEFT JOIN personal p
                ON p.personalnummer=CASE WHEN u.dienstnummer REGEXP '^[0-9]{1,9}$'
                  THEN CAST(u.dienstnummer AS UNSIGNED) ELSE NULL END
                WHERE u.gesperrt=0 AND (".implode(' OR ',$conditions).')',$args);
            if(!$users)fail(400,'Keine gültigen Empfänger');
            sql('INSERT INTO portal_meldungen(titel,inhalt,absender_id,sichtbar_ab,sichtbar_bis) VALUES(?,?,?,?,?)',
                [$title,$content,$u['id'],$from,$until]);
            $id=(int)db()->lastInsertId();
            foreach($users as $row)sql('INSERT INTO portal_meldung_empfaenger(meldung_id,user_id) VALUES(?,?)',
                [$id,$row['id']]);
            auditAction($u,'Mitteilung an '.count($users).' Empfänger erstellt','add');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'anzahl'=>count($users)]);
    }
    if(preg_match('#^/api/mitteilungen/([1-9][0-9]*)$#D',$uri,$match)){
        needRight($u,'mitteilungen',2);$id=cleanId($match[1]);
        if($method==='PATCH'){
            [$title,$content,$from,$until]=messageBody(body());
            $stmt=db()->prepare('UPDATE portal_meldungen SET titel=?,inhalt=?,sichtbar_ab=?,sichtbar_bis=? WHERE id=?');
            $stmt->execute([$title,$content,$from,$until,$id]);
            if(!sql('SELECT 1 FROM portal_meldungen WHERE id=?',[$id]))fail(404,'Mitteilung nicht gefunden');
            auditAction($u,'Mitteilung geändert: #'.$id);
            respond(200,['ok'=>true]);
        }
        if($method==='DELETE'){
            $stmt=db()->prepare('DELETE FROM portal_meldungen WHERE id=?');$stmt->execute([$id]);
            if($stmt->rowCount()===0)fail(404,'Mitteilung nicht gefunden');
            auditAction($u,'Mitteilung gelöscht: #'.$id,'del');
            respond(200,['ok'=>true]);
        }
    }
    if($method==='POST'&&preg_match('#^/api/mitteilungen/([1-9][0-9]*)/ausblenden$#D',$uri,$m)){
        needRight($u,'mitteilungen');$id=cleanId($m[1]);
        $stmt=db()->prepare('UPDATE portal_meldung_empfaenger SET ausgeblendet_am=UTC_TIMESTAMP(6)
            WHERE meldung_id=? AND user_id=?');
        $stmt->execute([$id,$u['id']]);
        if(!sql('SELECT 1 FROM portal_meldung_empfaenger WHERE meldung_id=? AND user_id=?',[$id,$u['id']]))
            fail(404,'Mitteilung nicht vorhanden');
        respond(200,['ok'=>true]);
    }
    return false;
}
