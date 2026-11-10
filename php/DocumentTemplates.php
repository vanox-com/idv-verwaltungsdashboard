<?php
declare(strict_types=1);
namespace IDV;

function documentFields(string $type,array $input): array {
    $keys=['datum','beginn','enddatum','praktikumsdatum','anrede','strasse','hausnummer',
      'wohnort','unterzeichner','rang','sachverhalt','paragraphen','begruendung',
      'taetigkeit','arbeitgeber','probezeit','uhrzeit_von','uhrzeit_bis','stufe'];
    $f=[];
    foreach($keys as $k){
        $v=trim((string)($input[$k]??''));
        if(strlen($v)>(in_array($k,['sachverhalt','paragraphen','begruendung'],true)?3000:160))
            fail(400,'Text zu lang: '.$k);
        $f[$k]=$v;
    }
    if(routineIso($f['datum'])!==$f['datum'])fail(400,'Ausstellungsdatum fehlt');
    if(count(preg_split('/\s+/u',$f['unterzeichner']))<2||$f['rang']==='')
        fail(400,'Unterzeichner mit Vorname, Nachname und Dienstgrad erforderlich');
    $required=match($type){
        'abmahnung'=>['sachverhalt','paragraphen','stufe'],
        'fristgerecht'=>['enddatum'],'fristlos'=>['begruendung'],
        'hauptvertrag'=>['beginn','probezeit'],'pmavertrag'=>['beginn'],
        'nebenvertrag'=>['beginn','arbeitgeber','taetigkeit'],
        'praktikum'=>['wohnort'],
        'praktikumsbestaetigung'=>['praktikumsdatum','uhrzeit_von','uhrzeit_bis'],
        'nebenjob'=>['arbeitgeber'],
        default=>null
    };
    if($required===null)fail(400,'Unbekannter Dokumenttyp');
    foreach($required as $k)if($f[$k]==='')fail(400,'Pflichtfeld fehlt: '.$k);
    foreach(['beginn','enddatum','praktikumsdatum'] as $k)
        if($f[$k]!==''&&routineIso($f[$k])!==$f[$k])fail(400,'Ungültiges Datum: '.$k);
    if($type==='abmahnung'&&!in_array($f['stufe'],['1','2','3'],true))
        fail(400,'Ungültige Abmahnungsstufe');
    return $f;
}
function documentSignature(string $xml,string $type,string $signer): string {
    $name=trim($signer);
    if(count(preg_split('/\s+/u',$name))<2||strlen($name)>160)
        fail(422,'Vollständiger Name des angemeldeten Dokumentenerstellers fehlt');
    $marker=xmlValue('<Unterschrift>');$replacement=xmlValue($name);
    if(in_array($type,['hauptvertrag','pmavertrag','nebenvertrag'],true)){
        if(substr_count($xml,$marker)!==2)
            fail(422,'Arbeitsvertragsvorlage: zwei Unterschriftenfelder erwartet');
        $pos=strpos($xml,$marker);
        $next=strpos($xml,$marker,$pos+strlen($marker));
        return substr_replace($xml,$replacement,$next,strlen($marker));
    }
    if($type==='praktikum'){
        $found=0;$changed=0;
        // preg_replace_callback below intentionally operates only on the second
        // paragraph whose visible text is exactly "Unterschrift".
        $res=preg_replace_callback('#<w:p\b[^>]*>[\s\S]*?</w:p>#',
            function(array $m) use(&$found,&$changed,$replacement):string {
                preg_match_all('#<w:t(?:\s[^>]*)?>([\s\S]*?)</w:t>#',$m[0],$tags);
                if(implode('',$tags[1])!=='Unterschrift')return $m[0];
                $found++;if($found!==2)return $m[0];
                $out=preg_replace('#(<w:t(?:\s[^>]*)?>)Unterschrift(</w:t>)#',
                    '$1'.$replacement.'$2',$m[0],1);
                if($out!==$m[0])$changed++;
                return $out;
            },$xml);
        if($found!==2||$changed!==1||$res===null)
            fail(422,'Praktikumsvertrag: Unterschriftszeilen nicht eindeutig');
        return $res;
    }
    if(substr_count($xml,$marker)!==1)
        fail(422,'Polizeiliches Unterschriftenfeld nicht eindeutig');
    return str_replace($marker,$replacement,$xml);
}
function documentFillXml(string $xml,string $type,array $person,array $f): string {
    $first=(string)$person['vorname'];$last=(string)$person['nachname'];
    $signer=preg_split('/\s+/u',trim($f['unterzeichner']));
    $signFirst=array_shift($signer);$signLast=implode(' ',$signer);
    $names=match($type){
        'abmahnung','praktikum','nebenjob'=>[[$signFirst,$first,$signFirst],[$signLast,$last,$signLast]],
        'fristgerecht','fristlos','praktikumsbestaetigung'=>[[$signFirst,$first,$signFirst],
            [$signLast,$last,$last,$signLast]],
        'hauptvertrag','pmavertrag','nebenvertrag'=>[[$first,$first,$signFirst],
            [$last,$last,$signLast]],
        default=>null
    };
    if($type==='praktikum')$names[1]=[$signLast,$last,$signLast,$last];
    if(!$names)fail(400,'Unbekannte Vorlage');
    $xml=docxReplace($xml,'<Vorname>',$names[0],true);
    $xml=docxReplace($xml,'<Name>',$names[1],true);
    $values=[
        '<Dienstgrad>'=>$f['rang'],'<Rang>'=>$f['rang'],
        '<Herr / Frau>'=>$f['anrede'],'<Herr/Frau>'=>$f['anrede'],
        '<Straße>'=>$f['strasse']?:'—','<Haus-Nr.>'=>$f['hausnummer']?:'—',
        '<Geburtsdatum>'=>germanDocumentDate($person['geburtsdatum']),
        '<Wohnhaft>'=>$f['wohnort']?:'—','<Vodasdasdrname>'=>$first,
        '<Uhrzeit Start>'=>$f['uhrzeit_von']?:'—','<Uhrzeit Ende>'=>$f['uhrzeit_bis']?:'—',
        '<Datum>'=>germanDocumentDate(
            $type==='fristgerecht'?$f['enddatum']:
            ($type==='praktikumsbestaetigung'?$f['praktikumsdatum']:$f['datum']))
    ];
    foreach($values as $pattern=>$value)$xml=docxReplace($xml,$pattern,[(string)$value]);
    if($type==='abmahnung'){
        $xml=docxReplace($xml,'<1., 2., 3.>',[$f['stufe']],true);
        $xml=docxReplace($xml,'< evtl. genaue Beschreibung >',
            [$f['paragraphen'].' – '.$f['sachverhalt']],true);
    }
    $xml=documentSignature($xml,$type,$f['unterzeichner']);
    if($type==='hauptvertrag')$xml=preg_replace('/XX/',$f['probezeit'],$xml,1);
    if($type==='nebenvertrag'){
        $xml=preg_replace('/XXX/',xmlValue($f['taetigkeit']),$xml,1);
        $xml=preg_replace('/XXX/',xmlValue($f['arbeitgeber']),$xml,1);
    }
    if($type==='nebenjob')$xml=str_replace('bei xx','bei '.xmlValue($f['arbeitgeber']),$xml);
    if($type==='fristlos')$xml=str_replace('Kündigungsgrund:',
        'Kündigungsgrund: '.xmlValue($f['begruendung']),$xml);
    if(str_ends_with($type,'vertrag'))$xml=str_replace(
        'Das Arbeitsverhältnis beginnt am ',
        'Das Arbeitsverhältnis beginnt am '.xmlValue(germanDocumentDate($f['beginn'])).' ',$xml);
    if($type==='praktikum')$xml=str_replace('Ort, Datum: Frankfurt den ',
        'Ort, Datum: Frankfurt den '.xmlValue(germanDocumentDate($f['datum'])).' ',$xml);
    if(in_array($type,['abmahnung','fristgerecht','fristlos','nebenjob',
        'praktikumsbestaetigung','praktikum'],true)){
        $xml=str_replace('Datum:','Datum: '.xmlValue(germanDocumentDate($f['datum'])).' ',$xml);
        $xml=str_replace('2026-10-27',xmlValue($f['datum']),$xml);
    }
    return $xml;
}
function certificateFillXml(string $xml,array $p,string $oath,string $appointment): string {
    foreach(['<Vorname>'=>$p['vorname'],'<Name>'=>$p['nachname'],
        '<Geburtsdatum>'=>germanDocumentDate($p['geburtsdatum'])] as $needle=>$value)
        $xml=docxReplace($xml,$needle,[(string)$value],true);
    return docxReplace($xml,'<Datum>',[germanDocumentDate($oath),
        germanDocumentDate($appointment)],true);
}
