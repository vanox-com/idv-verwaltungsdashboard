<?php
declare(strict_types=1);
namespace IDV;

function dnReqNumber(mixed $n): ?int {
    if(!is_int($n)&&!(is_string($n)&&preg_match('/^[1-9][0-9]*$/D',$n)))return null;
    $num=(int)$n;return $num>=1&&$num<=999999?$num:null;
}
function dnReqName(array $p): string {return trim(($p['vorname']??'').' '.($p['nachname']??''));}
function dnReqCurrent(?array $p): bool {
    return $p&&$p['administrativ_geloescht_am']===null&&
        in_array($p['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true);
}
function dnReqCheck(int $from,int $to,string $kind,bool $lock=false): array {
    $ids=[$from,$to];sort($ids,SORT_NUMERIC);
    $staff=sql('SELECT * FROM personal WHERE personalnummer IN (?,?) ORDER BY personalnummer'.
        ($lock?' FOR UPDATE':''),$ids);
    $p=[];foreach($staff as $v)$p[(int)$v['personalnummer']]=$v;
    $old=$p[$from]??null;$target=$p[$to]??null;
    if(!dnReqCurrent($old))fail(409,'Quell-Dienstnummer ist nicht mehr aktiv');
    $login=sql("SELECT id,dienstnummer,rolle FROM users
         WHERE dienstnummer REGEXP '^[0-9]{1,6}$'
           AND CAST(dienstnummer AS UNSIGNED) IN (?,?) ORDER BY id".($lock?' FOR UPDATE':''),$ids);
    $account=null;
    foreach($login as $a){
        if((int)$a['dienstnummer']===$to)fail(409,'Ziel-Dienstnummer hat bereits einen Panel-Zugang');
        if((int)$a['dienstnummer']===$from)$account=$a;
    }
    if($kind==='zugang'){
        if(!dnReqCurrent($target)||!$account||
            !in_array($account['rolle'],['Polizeirat','Leitungsdienst','Administrator'],true))
            fail(409,'Zugangswechsel benötigt zwei aktuelle Personalakten und einen Quell-Login');
        foreach(['vorname','nachname'] as $k)
            if(strtolower(trim((string)$old[$k]))!==strtolower(trim((string)$target[$k])))
                fail(409,'Ziel-Personalakte gehört nicht eindeutig derselben Person');
        foreach(['geburtsdatum','eintrittsdatum'] as $k)
            if(($old[$k]??null)!==($target[$k]??null))
                fail(409,'Ziel-Personalakte gehört nicht eindeutig derselben Person');
    }else if($kind==='personal'){
        if($target&&$target['administrativ_geloescht_am']===null)
            fail(409,'Die Zielnummer ist noch aktiv belegt. Nur freie oder administrativ gelöschte Nummern können umnummeriert werden');
    }else fail(400,'Ungültige Art der Dienstnummernänderung');
    return ['old'=>$old,'target'=>$target,'account'=>$account,
        'stamp'=>[
            'oldRevision'=>(string)$old['row_revision'],
            'targetRevision'=>$target?(string)$target['row_revision']:null,
            'accountId'=>$account['id']??null,
            'accountNumber'=>$account['dienstnummer']??null,
            'oldName'=>dnReqName($old),'targetName'=>$target?dnReqName($target):null,
            'oldEntry'=>$old['eintrittsdatum']??null,
            'targetEntry'=>$target['eintrittsdatum']??null
        ]];
}
function dnReqApply(array $req,array $context,array $u): void {
    $from=(int)$req['alt_nr'];$to=(int)$req['ziel_nr'];
    $account=$context['account'];
    if($req['art']==='zugang'){
        $stmt=db()->prepare('UPDATE users SET dienstnummer=? WHERE id=? AND dienstnummer=?');
        $stmt->execute([str_pad((string)$to,2,'0',STR_PAD_LEFT),$account['id'],$account['dienstnummer']]);
        if($stmt->rowCount()!==1)fail(409,'Quell-Login wurde geändert');
        $stmt=db()->prepare('UPDATE personal SET administrativ_geloescht_am=UTC_TIMESTAMP(6),
            administrativ_geloescht_von=? WHERE personalnummer=? AND administrativ_geloescht_am IS NULL');
        $stmt->execute([$u['id'],$from]);
        if($stmt->rowCount()!==1)fail(409,'Quell-Personalakte nicht mehr aktuell');
    }else{
        $refs=sql("SELECT table_name AS tablename,column_name AS fieldname FROM information_schema.key_column_usage
            WHERE table_schema=DATABASE() AND referenced_table_name='personal'
              AND referenced_column_name='personalnummer'");
        $allowed=['copnet_zugaenge','disziplin','generierte_dokumente',
            'personal_fristen','personal_rangantraege','sonderfunktionen'];
        foreach($refs as $fk)
            if(!in_array($fk['table_name'],$allowed,true)||$fk['column_name']!=='personalnummer')
                fail(409,'Unbekannte Personal-Fremdschlüsselreferenz. Änderung abgebrochen');
        if($context['target'])archivePreviousNumber($to,$context['target'],(int)$u['id']);
        $columns=array_column(sql("SELECT column_name FROM information_schema.columns
            WHERE table_schema=DATABASE() AND table_name='personal' ORDER BY ordinal_position"),'column_name');
        $columns=array_values(array_filter($columns,
            fn($c)=>!in_array($c,['personalnummer','row_revision'],true)));
        foreach($columns as $c)if(!preg_match('/^[a-z_]+$/D',$c))
            throw new \LogicException('Invalid column identifier');
        $quoted=array_map(fn($c)=>chr(96).$c.chr(96),$columns);
        if($context['target']){
            $assignments=implode(',',array_map(fn($c)=>'dest.'.$c.'=src.'.$c,$quoted));
            $stmt=db()->prepare('UPDATE personal dest JOIN personal src ON src.personalnummer=?
                SET '.$assignments.' WHERE dest.personalnummer=?
                AND dest.administrativ_geloescht_am IS NOT NULL');
            $stmt->execute([$from,$to]);
            if($stmt->rowCount()!==1)fail(409,'Archivierte Zielakte konnte nicht übernommen werden');
        }else{
            $cols=implode(',',$quoted);
            $stmt=db()->prepare('INSERT INTO personal(personalnummer,'.$cols.')
                SELECT ?,'.$cols.' FROM personal WHERE personalnummer=?');
            $stmt->execute([$to,$from]);
            if($stmt->rowCount()!==1)fail(409,'Quell-Personalakte nicht mehr aktuell');
        }
        sql('UPDATE personal SET beschaeftigungsart=? WHERE personalnummer=?',[dnEmployment($to),$to]);
        foreach($refs as $fk) {
            $table=$fk['table_name'];
            if(!in_array($table,$allowed,true))throw new \LogicException('Unknown FK table');
            sql('UPDATE '.chr(96).$table.chr(96).' SET personalnummer=? WHERE personalnummer=?',[$to,$from]);
        }
        sql('UPDATE routine SET personalnummer=? WHERE personalnummer=?',[$to,$from]);
        if($account){
            $stmt=db()->prepare('UPDATE users SET dienstnummer=?,gesperrt=1 WHERE id=? AND dienstnummer=?');
            $stmt->execute(['archiv-'.$from.'-'.$account['id'],$account['id'],$account['dienstnummer']]);
            if($stmt->rowCount()!==1)fail(409,'Panel-Zugang wurde zwischenzeitlich geändert');
            sql('DELETE FROM sessions WHERE user_id=?',[$account['id']]);
        }
        sql('DELETE FROM personal WHERE personalnummer=?',[$from]);
    }
    auditAction($u,'POR-Dienstnummer '.$from.' → '.$to.' ('.$req['art'].') genehmigt und umgesetzt');
    sql('INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES(?,?,?)',
        [$to,$u['id'],json_encode(['dienstnummer'=>['alt'=>$from,'neu'=>$to],'typ'=>$req['art']],
             JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function dispatchDNRequests(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/dienstnummer-antraege'){
        $rights=rights($u);
        if(($rights['pers']??0)<1&&($rights['por']??0)<1)fail(403,'Kein Recht auf Dienstnummern-Anträge');
        $all=($rights['por']??0)>=1||$u['rolle']==='Administrator';
        $rows=sql("SELECT a.id,a.alt_nr,a.ziel_nr,a.art,a.begruendung,a.status,a.quell_name,
                a.ziel_name,a.entscheidungsnotiz,a.erstellt,a.entschieden_am,a.antragsteller_id,
                a.entscheider_id,COALESCE(us.anzeigename,'–') AS antragsteller,
                COALESCE(decider.anzeigename,'–') AS entscheider
                FROM dienstnummer_antraege a
                LEFT JOIN users us ON us.id=a.antragsteller_id
                LEFT JOIN users decider ON decider.id=a.entscheider_id ".
                ($all?'':'WHERE a.antragsteller_id=?').
                " ORDER BY (a.status='beantragt') DESC,a.erstellt DESC,a.id DESC LIMIT 200",
                $all?[]:[$u['id']]);
        respond(200,['antraege'=>$rows,'darfGenehmigen'=>($rights['por']??0)>=2,
            'darfBeantragen'=>($rights['pers']??0)>=1]);
    }
    if($method==='POST'&&$uri==='/api/dienstnummer-antraege'){
        $b=body();$from=dnReqNumber($b['alt_nr']??null);$to=dnReqNumber($b['ziel_nr']??null);
        $rights=rights($u);
        if(($rights['pers']??0)<1||(($rights['pers']??0)<2&&(int)$u['dienstnummer']!==$from))
            fail(403,'Mit Personal-Leserecht darfst du nur für deine eigene Dienstnummer einen Antrag stellen');
        $kind=(string)($b['art']??'');$reason=trim((string)($b['begruendung']??''));
        if(!$from||!$to||$from===$to||!in_array($kind,['zugang','personal'],true)||
            strlen($reason)<8||strlen($reason)>1000)
            fail(400,'Gültige Nummern, Antragsart und Begründung (8–1000 Zeichen) erforderlich');
        db()->beginTransaction();
        try{
            $check=dnReqCheck($from,$to,$kind,true);
            sql('INSERT INTO dienstnummer_antraege
                (alt_nr,ziel_nr,art,begruendung,quell_name,ziel_name,pruefstand,antragsteller_id)
                VALUES(?,?,?,?,?,?,?,?)',
                [$from,$to,$kind,$reason,dnReqName($check['old']),
                    $check['target']?dnReqName($check['target']):'',
                    json_encode($check['stamp'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']]);
            $id=(int)db()->lastInsertId();
            auditAction($u,'Dienstnummern-Antrag '.$from.' → '.$to.' an POR gestellt','add');
            db()->commit();
        }catch(\PDOException $e){
            if(db()->inTransaction())db()->rollBack();
            if((int)($e->errorInfo[1]??0)===1062)
                fail(409,'Für die Ausgangsnummer besteht bereits ein offener Antrag');
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(201,['ok'=>true,'id'=>$id,'status'=>'beantragt']);
    }
    if($method==='POST'&&preg_match('#^/api/dienstnummer-antraege/([1-9][0-9]*)/entscheidung$#D',$uri,$m)){
        needRight($u,'por',2);$id=cleanId($m[1]);$b=body();
        $status=(string)($b['status']??'');$note=trim((string)($b['notiz']??''));
        if(!in_array($status,['genehmigt','abgelehnt'],true)||strlen($note)>1000||
            ($status==='abgelehnt'&&strlen($note)<5))
            fail(400,'Ungültige POR-Entscheidung oder fehlende Begründung');
        db()->beginTransaction();
        try{
            $r=normalizedRows('SELECT * FROM dienstnummer_antraege WHERE id=? FOR UPDATE',[$id],['pruefstand']);
            if(!$r)fail(404,'Antrag nicht gefunden');
            $req=$r[0];if($req['status']!=='beantragt')fail(409,'Antrag ist bereits abgeschlossen');
            if($status==='genehmigt'){
                if((int)$req['antragsteller_id']===(int)$u['id']&&$u['rolle']!=='Administrator')
                    fail(403,'Eigene Anträge dürfen nur durch einen anderen POR-Berechtigten entschieden werden');
                $ctx=dnReqCheck((int)$req['alt_nr'],(int)$req['ziel_nr'],$req['art'],true);
                foreach(['oldRevision','targetRevision','accountId','accountNumber',
                    'oldName','targetName','oldEntry','targetEntry'] as $f)
                    if((string)($ctx['stamp'][$f]??'')!==(string)($req['pruefstand'][$f]??''))
                        fail(409,'Prüfstand geändert ('.$f.'). Bitte Antrag erneut prüfen.');
                dnReqApply($req,$ctx,$u);
            }
            sql('UPDATE dienstnummer_antraege
                SET status=?,entscheider_id=?,entscheidungsnotiz=?,entschieden_am=UTC_TIMESTAMP(6)
                WHERE id=?',[$status,$u['id'],$note,$id]);
            auditAction($u,'POR-Dienstnummern-Antrag #'.$id.' '.$status);
            db()->commit();
        }catch(\PDOException $e){
            if(db()->inTransaction())db()->rollBack();
            if($e->getCode()==='23000')
                fail(409,'Zielnummer inzwischen belegt oder Datenverknüpfung verhindert Wechsel');
            throw $e;
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'status'=>$status,'umgesetzt'=>$status==='genehmigt']);
    }
    return false;
}
