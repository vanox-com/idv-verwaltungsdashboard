<?php
declare(strict_types=1);
namespace IDV;

const IDV_CERTIFICATE_GOOGLE_ID='10aZ55_hWkzXLbrVDu8fZIAcRFD1qPIyMjaMqEgiyDxE';

function canIssueCertificate(array $u): bool {
    $rights=rights($u);
    return ($rights['bef']??0)>=2||
        ($u['rolle']==='Polizeirat'&&($rights['bef']??0)>=1&&($rights['urkunden']??0)>=2);
}
function verifyCertificateDates(string $oath,string $promoted,string $born): ?string {
    foreach([['datum'=>$oath,'name'=>'Amtseid'],['datum'=>$promoted,'name'=>'Ernennung'],
        ['datum'=>$born,'name'=>'Geburt']] as $item){
        if(routineIso($item['datum'])!==$item['datum'])
            return $item['name'].'-Datum ungültig. Bitte JJJJ-MM-TT angeben.';
    }
    $today=gmdate('Y-m-d');
    if($oath>$today)return 'Das Datum des geleisteten Amtseids darf nicht in der Zukunft liegen.';
    if($promoted>$today)return 'Das Ernennungsdatum darf nicht in der Zukunft liegen.';
    if($oath<=$born||$promoted<=$born)return 'Amtseid- oder Ernennungsdatum liegt vor dem Geburtsdatum.';
    return null;
}
function dispatchCertificates(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/urkunden/status'){
        needRight($u,'bef');
        if(!canIssueCertificate($u))fail(403,'Kein Recht für diese Beförderungsaktion');
        $google=googleCredentials();
        $origin=googlePortalOrigin();
        $ready=idvTemplatesReady();
        $hint=googleSetupHint();
        if($hint===null&&!$ready)$hint='Originalvorlagen fehlen: Administrator muss das ZIP unter /vorlagen.html importieren.';
        respond(200,['eingerichtet'=>$google!==null&&$origin!==null&&$ready,
            'clientId'=>$google['id']??null,'origin'=>$origin,
            'hinweis'=>$hint,'modus'=>'persoenlich']);
    }
    if($method==='POST'&&preg_match('#^/api/urkunden/polizeimeister/([1-9][0-9]*)$#D',$uri,$m)){
        needRight($u,'bef');if(!canIssueCertificate($u))fail(403,'Kein Recht für diese Beförderungsaktion');
        $nr=cleanId($m[1]);$b=body();$oath=$b['eid_datum']??null;
        if(!is_string($oath)||routineIso($oath)!==$oath)
            fail(400,'Datum des Amtseids erforderlich (JJJJ-MM-TT)');
        $google=googleCredentials();
        if(!$google)fail(503,'Google-OAuth-Webclient ist noch nicht beim neuen Hoster konfiguriert.');
        $origin=googleOrigin();$code=$b['google_code']??null;
        if(!is_string($code)||strlen($code)<15||strlen($code)>2048)
            fail(400,'Die persönliche Google-Anmeldung fehlt');
        $row=sql("SELECT p.personalnummer,p.vorname,p.nachname,p.geburtsdatum,p.dienstgrad,
             p.ernennungsurkunde_url,p.status,
             (SELECT b.am FROM befoerderungen b WHERE b.personalnummer=p.personalnummer
               AND b.rang='Polizeimeisteranwärter' AND b.neu_rang='Polizeimeister'
               ORDER BY b.am DESC,b.id DESC LIMIT 1) AS ernennungsdatum
            FROM personal p WHERE p.personalnummer=?",[$nr]);
        if(!$row)fail(404,'Personalnummer unbekannt');
        $person=$row[0];$promoted=substr((string)($person['ernennungsdatum']??''),0,10);
        if($person['dienstgrad']!=='Polizeimeister'||$promoted==='')
            fail(409,'Nur nach erfolgter Beförderung PMA → PM möglich');
        if($person['ernennungsurkunde_url'])fail(409,'Es gibt bereits eine verknüpfte Ernennungsurkunde');
        if(!$person['geburtsdatum'])fail(409,'Geburtsdatum fehlt');
        if($person['status']==='Gekündigt')fail(409,'Personal ist ausgeschieden');
        $person['geburtsdatum']=substr((string)$person['geburtsdatum'],0,10);
        $dateError=verifyCertificateDates($oath,$promoted,$person['geburtsdatum']);
        if($dateError)fail(400,$dateError);
        $name=trim(($person['vorname']??'').' '.($person['nachname']??''));
        if($name===''||strlen($name)>160)fail(409,'Name der Person fehlt');
        $token=null;$created=null;$saved=false;
        try{
            $token=googleCodeForSession($code,$origin,$google);
            $original=idvTemplateBytes('urkunde');
            $docx=docxRewrite($original,fn($xml)=>certificateFillXml($xml,$person,$oath,$promoted));
            $title='Ernennungsurkunde '.$name;
            $created=googleUploadDocx($token,$title,$docx);
            $url='https://docs.google.com/document/d/'.$created.'/edit';
            db()->beginTransaction();
            try{
                $stmt=db()->prepare("UPDATE personal SET ernennungsurkunde=?,ernennungsurkunde_url=?
                    WHERE personalnummer=? AND COALESCE(ernennungsurkunde_url,'')=''
                      AND dienstgrad='Polizeimeister'");
                $stmt->execute([$title,$url,$nr]);
                if($stmt->rowCount()!==1)
                    throw new \RuntimeException('Urkunde bereits verknüpft oder Personalakte zwischenzeitlich verändert');
                auditAction($u,'Persönliche Google-Ernennungsurkunde erstellt: '.$nr,'add');
                db()->commit();$saved=true;
            }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        }catch(\Throwable $e){
            if($created&&$token&&!$saved)googleDeleteCreated($token,$created);
            error_log('IDV Urkunde: fehlgeschlagene externe Erstellung oder Datenspeicherung');
            fail(422,'Ernennungsurkunde konnte nicht sicher erstellt werden. Bitte Google-Konto, Vorlagenzugriff und Personalakte prüfen.');
        }
        respond(200,['ok'=>true,'url'=>$url,'titel'=>$title]);
    }
    return false;
}
