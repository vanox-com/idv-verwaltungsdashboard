<?php
declare(strict_types=1);
namespace IDV;

/* Personal Google OAuth, the original nine templates, and secure document history. */
function permittedDocument(array $rights,string $type,int $level=2): bool {
    $template=IDV_GOOGLE_TEMPLATES[$type]??null;
    return $template&&($rights[$template['recht']]??0)>=$level;
}
function documentStatus(array $u): array {
    $google=googleCredentials();$name=trim(userName($u));
    return ['eingerichtet'=>$google!==null,'clientId'=>$google['id']??null,
        'ersteller'=>$name,
        'erstellerVollstaendig'=>count(preg_split('/\s+/u',$name))>=2&&strlen($name)<=160];
}
function dispatchDocuments(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/dokumentgenerator/status')
        respond(200,documentStatus($u));
    if($method==='GET'&&$uri==='/api/dokumentgenerator/archiv'){
        $rights=rights($u);
        $nr=filter_var($_GET['nr']??0,FILTER_VALIDATE_INT);
        if($nr===false||$nr<0)fail(400,'Ungültige Personalnummer');
        $rows=sql("SELECT id,personalnummer,person_name,typ,titel,url,kontext_id,erstellt
           FROM generierte_dokumente WHERE (?=0 OR personalnummer=?)
           ORDER BY erstellt DESC,id DESC LIMIT 400",[$nr,$nr]);
        $visible=array_values(array_filter($rows,fn($r)=>permittedDocument($rights,$r['typ'],1)));
        if(($rights['kuearchiv']??0)<1){
            $archived=[];
            foreach($visible as $r)if(in_array($r['typ'],['fristgerecht','fristlos'],true)&&$r['kontext_id'])
                $archived[(int)$r['kontext_id']]=true;
            if($archived){
                $ids=array_keys($archived);
                $q="SELECT k.id FROM kuendigungen k WHERE k.id IN (".
                    implode(',',array_fill(0,count($ids),'?')).") AND (".
                    terminationCurrentExpr('k').") IS NOT TRUE";
                $blocked=array_fill_keys(array_column(sql($q,$ids),'id'),true);
                $visible=array_values(array_filter($visible,fn($r)=>
                    !in_array($r['typ'],['fristgerecht','fristlos'],true)||
                    !isset($blocked[$r['kontext_id']])));
            }
        }
        respond(200,$visible);
    }
    if($method==='POST'&&$uri==='/api/dokumentgenerator/erstellen'){
        $b=body();$type=(string)($b['typ']??'');$tpl=IDV_GOOGLE_TEMPLATES[$type]??null;
        if(!$tpl)fail(400,'Unbekannte Vorlage');
        $rights=rights($u);
        if(!permittedDocument($rights,$type))fail(403,'Keine Berechtigung zum Dokumentgenerator');
        $origin=googleOrigin();$oauth=googleCredentials();
        if(!$oauth)fail(503,'Google OAuth nicht eingerichtet');
        $code=$b['google_code']??null;
        if(!is_string($code)||strlen($code)<15||strlen($code)>2048)
            fail(400,'Persönliche Google-Anmeldung fehlt');
        $name=trim(userName($u));
        if(count(preg_split('/\s+/u',$name))<2||strlen($name)>160)
            fail(409,'Im angemeldeten Benutzerkonto fehlt ein vollständiger Vor- und Nachname.');
        $fields=$b['felder']??null;
        if(!is_array($fields))fail(400,'Dokumentangaben fehlen');
        $fields['unterzeichner']=$name;
        $f=documentFields($type,$fields);
        $nr=filter_var($b['nr']??0,FILTER_VALIDATE_INT);
        $context=filter_var($b['kontext']??0,FILTER_VALIDATE_INT);
        if($nr===false||$nr<0||$context===false||$context<0)fail(400,'Ungültige Aktenzuordnung');
        $pract=in_array($type,['praktikum','praktikumsbestaetigung'],true);
        if(!$nr&&!$pract)fail(400,'Bitte Personalakte auswählen');
        if(in_array($type,['fristgerecht','fristlos'],true)&&!$context)
            fail(400,'Kündigungsvorgang auswählen');
        $person=$nr?sql('SELECT personalnummer,vorname,nachname,geburtsdatum,eintrittsdatum,dienstgrad
                            FROM personal WHERE personalnummer=?',[$nr]):[];
        if($nr&&!$person)fail(404,'Personalakte nicht gefunden');
        if(!$person){
            $outside=$b['extern']??[];
            if(!$pract||!is_array($outside)||!is_string($outside['vorname']??null)||
               !is_string($outside['nachname']??null)||trim($outside['vorname'])===''||
               trim($outside['nachname'])===''||
               routineIso($outside['geburtsdatum']??null)!==($outside['geburtsdatum']??null))
               fail(400,'Praktikant: Vorname, Nachname und Geburtsdatum eintragen');
            $person=[['vorname'=>substr(trim($outside['vorname']),0,120),
                'nachname'=>substr(trim($outside['nachname']),0,120),
                'geburtsdatum'=>$outside['geburtsdatum']]];
        }
        $p=$person[0];$p['geburtsdatum']=substr((string)($p['geburtsdatum']??''),0,10);
        if(routineIso($p['geburtsdatum'])!==$p['geburtsdatum'])
            fail(400,'Geburtsdatum fehlt in der Personalakte');
        if(in_array($type,['fristgerecht','fristlos'],true)){
            $case=sql('SELECT personalnummer,kuendigung,'.terminationCurrentExpr('k').
                ' AS aktuell FROM kuendigungen k WHERE k.id=?',[$context]);
            if(!$case)fail(404,'Kündigung nicht gefunden');
            if(!(bool)$case[0]['aktuell']&&($rights['kuearchiv']??0)<2)
                fail(403,'Für archivierte Kündigungen fehlt das Bearbeitungsrecht');
            if((int)$case[0]['personalnummer']!==$nr)fail(409,'Kündigung gehört zu anderer Personalakte');
        }
        $title=$tpl['titel'].' – '.$p['vorname'].' '.$p['nachname'];
        $token=null;$fileId=null;$saved=false;
        try{
            $token=googleCodeForSession($code,$origin,$oauth);
            $word=googleDownloadTemplate($token,$tpl['id']);
            $docx=docxRewrite($word,fn($xml)=>documentFillXml($xml,$type,$p,$f));
            $fileId=googleUploadDocx($token,$title,$docx);
            $link='https://docs.google.com/document/d/'.$fileId.'/edit';
            db()->beginTransaction();
            try{
                if($type==='abmahnung'){
                    $found=normalizedRows('SELECT slots FROM disziplin WHERE personalnummer=? FOR UPDATE',
                        [$nr],['slots']);
                    $slots=$found[0]['slots']??[];
                    if(!is_array($slots)||count($slots)>6)
                        throw new \RuntimeException('Disziplinarakte enthält zu viele Maßnahmenslots');
                    while(count($slots)<6)$slots[]=null;
                    $i=(int)$f['stufe'];
                    if(!empty($slots[$i]['u']))throw new \RuntimeException('Für diese Abmahnung ist bereits ein Dokument hinterlegt');
                    $slots[$i]=['done'=>true,'t'=>substr($f['sachverhalt'],0,1500),
                        'u'=>$link,'d'=>$f['datum']];
                    sql("INSERT INTO disziplin(personalnummer,slots,bemerkung)
                         VALUES(?,?,'') ON DUPLICATE KEY UPDATE
                         slots=VALUES(slots),aktualisiert=UTC_TIMESTAMP(6)",
                        [$nr,json_encode($slots,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
                }
                if(in_array($type,['fristgerecht','fristlos'],true)){
                    $current=sql('SELECT kuendigung FROM kuendigungen WHERE id=? FOR UPDATE',[$context]);
                    if(!$current)throw new \RuntimeException('Kündigung wurde gelöscht');
                    if(str_contains((string)($current[0]['kuendigung']??''),'https://'))
                        throw new \RuntimeException('Kündigungsdokument bereits hinterlegt');
                    sql('UPDATE kuendigungen SET kuendigung=? WHERE id=?',
                        [json_encode(['t'=>$title,'u'=>$link],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$context]);
                }
                if(str_contains($type,'vertrag')&&!$pract){
                    $stmt=db()->prepare('UPDATE personal SET arbeitsvertrag=?,arbeitsvertrag_url=?
                         WHERE personalnummer=? AND COALESCE(arbeitsvertrag_url,\'\')=\'\'');
                    $stmt->execute([$title,$link,$nr]);
                    if($stmt->rowCount()!==1)
                        throw new \RuntimeException('Arbeitsvertrag ist inzwischen verknüpft oder Person nicht mehr vorhanden');
                }
                sql('INSERT INTO generierte_dokumente(personalnummer,person_name,typ,titel,url,kontext_id,erstellt_von)
                      VALUES(?,?,?,?,?,?,?)',[
                    $nr?:null,$p['vorname'].' '.$p['nachname'],$type,$title,$link,$context?:null,$u['id']
                ]);
                auditAction($u,'Dokument erstellt: '.$title,'add');
                db()->commit();$saved=true;
            }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        }catch(\Throwable $e){
            if($fileId&&$token&&!$saved)googleDeleteCreated($token,$fileId);
            error_log('IDV Dokumentgenerator: externes Dokument nicht vollständig erstellt: '.get_class($e));
            fail(422,'Dokumenterstellung fehlgeschlagen: '.($e->getCode()===0?
                'Vorlage oder Datensatz wurde zwischenzeitlich geändert. Bitte erneut prüfen.':'Bitte Google-Konto und Vorlagenberechtigung prüfen.'));
        }
        respond(200,['ok'=>true,'titel'=>$title,'url'=>$link]);
    }
    return false;
}
