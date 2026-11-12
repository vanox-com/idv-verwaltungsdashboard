<?php
declare(strict_types=1);
namespace IDV;

/**
 * Server-side DOCX and personal Google OAuth helpers.
 * Never persist OAuth access tokens. Never disable Google TLS validation.
 */
// Canonical HTTPS origin of the new PHP panel. Explicit host configuration wins.
// Never derive the trusted OAuth origin from untrusted HTTP Host headers.
const IDV_GOOGLE_PRODUCTION_ORIGIN='https://pol-panel.identityvalley.de';
const IDV_GOOGLE_TEMPLATES=[
    'abmahnung'=>['titel'=>'Abmahnung','id'=>'1wUNxrOWCxMUHF12Mq54PNfUKOfytKiYAA399g3aYF5w','recht'=>'dis'],
    'fristgerecht'=>['titel'=>'Fristgerechte Kündigung','id'=>'10RN9SpmI2OdElidWpbhsIIqJ26DhaAYd8A4bUuim7hw','recht'=>'kue'],
    'fristlos'=>['titel'=>'Fristlose Kündigung','id'=>'1N1nwnMRBt0Q5NMr4NafRu4Kj-kxPwGs4xuU3-ZtySN8','recht'=>'kue'],
    'hauptvertrag'=>['titel'=>'Arbeitsvertrag Hauptberuf','id'=>'1v6bFm7e5jPAgxIIRxaqBGmF4uVwm63aD_Js74DTi9vo','recht'=>'pers'],
    'pmavertrag'=>['titel'=>'Arbeitsvertrag PMA','id'=>'1REMFYLPcyxu0FPxImCuxKKgvs_vTaZwaJMWdi4v_aPM','recht'=>'pers'],
    'nebenvertrag'=>['titel'=>'Arbeitsvertrag Nebenberuf','id'=>'10KZ2qRLCLcPD2aqJf1M26Y8oEjuk2K48FNnMrBpj_Ls','recht'=>'pers'],
    'praktikum'=>['titel'=>'Praktikumsvertrag','id'=>'1S-pcycKNd_QSypYs2Hv91rENjZLS12BNbtXpw3sPbfw','recht'=>'praktika'],
    'praktikumsbestaetigung'=>['titel'=>'Praktikumsbestätigung','id'=>'15RWiI94EB1EGqZNnX-h95awljtHBt_Krrute35UWhkA','recht'=>'praktika'],
    'nebenjob'=>['titel'=>'Nebenjobfreigabe','id'=>'1Xrr8Sz4zNxYU1TY0Tk_OjBVeAq0muuw7ty3xkILENVM','recht'=>'pers']
];
/** Private server-only configuration; never inside the public/ document root. */
function googlePrivateConfigFile(): string {
    $dir=trim((string)(getenv('IDV_TEMPLATE_DIR')?:''));
    $base=$dir!==''?$dir:dirname(__DIR__).'/private/google-templates';
    if(!str_starts_with($base,'/'))throw new \RuntimeException('Privater Vorlagenpfad ist ungültig');
    return rtrim($base,'/').'/.google-oauth-credentials.json';
}
function googleCredentialPair(?string $id,?string $secret): ?array {
    if(!is_string($id)||!is_string($secret)||
       !preg_match('/^[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$/D',$id)||
       strlen($secret)<10||strlen($secret)>512||preg_match('/[\\x00-\\x20\\x7f]/',$secret))return null;
    return ['id'=>$id,'secret'=>$secret];
}
function googlePrivateCredentials(): ?array {
    $path=googlePrivateConfigFile();
    if(is_link($path)||!is_file($path))return null;
    $bytes=@file_get_contents($path);
    if(!is_string($bytes)||strlen($bytes)>2048)return null;
    $data=json_decode($bytes,true);
    if(!is_array($data))return null;
    return googleCredentialPair($data['id']??null,$data['secret']??null);
}
function googleCredentialsSource(): string {
    $env=googleCredentialPair(getenv('GOOGLE_OAUTH_CLIENT_ID')?:null,getenv('GOOGLE_OAUTH_CLIENT_SECRET')?:null);
    if($env!==null)return 'environment';
    return googlePrivateCredentials()!==null?'admin':'missing';
}
function googleCredentials(): ?array {
    $env=googleCredentialPair(getenv('GOOGLE_OAUTH_CLIENT_ID')?:null,getenv('GOOGLE_OAUTH_CLIENT_SECRET')?:null);
    return $env??googlePrivateCredentials();
}
/** Persist administrator-provided credentials only in a private chmod-0600 file. */
function googleSavePrivateCredentials(string $id,string $secret): void {
    $pair=googleCredentialPair(trim($id),trim($secret));
    if($pair===null)fail(400,'Ungültige Google OAuth Client-ID oder Client-Secret');
    $path=googlePrivateConfigFile();
    $dir=dirname($path);
    if(!is_dir($dir)||is_link($dir)||!is_writable($dir))
        fail(503,'Privater Vorlagenordner ist nicht beschreibbar');
    if(is_link($path))fail(503,'Unsicherer Konfigurationspfad');
    $tmp=$dir.'/.google-oauth-'.bin2hex(random_bytes(12)).'.tmp';
    $handle=@fopen($tmp,'x');
    if($handle===false)fail(503,'Private OAuth-Konfiguration konnte nicht vorbereitet werden');
    try {
        @chmod($tmp,0600);
        $bytes=json_encode($pair,JSON_THROW_ON_ERROR);
        if(fwrite($handle,$bytes)!==strlen($bytes)||!fflush($handle))
            fail(503,'OAuth-Konfiguration konnte nicht vollständig geschrieben werden');
    }finally{fclose($handle);}
    try {
        if(!@rename($tmp,$path))fail(503,'Private OAuth-Konfiguration konnte nicht aktiviert werden');
        @chmod($path,0600);
    }finally{@unlink($tmp);}
}
function dispatchGoogleAdminSettings(array $user,string $method,string $uri): bool {
    if($uri!=='/api/system/google-oauth')return false;
    if(($user['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren dürfen Google OAuth einrichten');
    if($method==='GET'){
        $creds=googleCredentials();
        respond(200,['eingerichtet'=>$creds!==null,
            'clientId'=>$creds['id']??'',
            'quelle'=>googleCredentialsSource(),
            'origin'=>googlePortalOrigin()]);
    }
    if($method!=='POST')fail(405,'Methode nicht erlaubt');
    // Require an explicit browser Origin; cross-origin requests cannot update secrets.
    if(!secureRequest()||($_SERVER['HTTP_ORIGIN']??'')!==googlePortalOrigin())
        fail(403,'Google OAuth darf nur über die sichere Portal-Adresse eingerichtet werden');
    $data=body();
    $id=$data['clientId']??null;
    $secret=$data['clientSecret']??null;
    if(!is_string($id)||!is_string($secret)||strlen($id)>256||strlen($secret)>512)
        fail(400,'Client-ID und Client-Secret sind erforderlich');
    if($secret==='')$secret=googlePrivateCredentials()['secret']??'';
    googleSavePrivateCredentials($id,$secret);
    sql('INSERT INTO log(user_id,aktion,art) VALUES(?,?,?)',
        [(int)$user['id'],'Private Google OAuth-Konfiguration aktualisiert','system']);
    respond(200,['ok'=>true,'eingerichtet'=>googleCredentials()!==null,
        'clientId'=>googleCredentials()['id']??'',
        'quelle'=>googleCredentialsSource(),'origin'=>googlePortalOrigin()]);
}
function googlePortalOrigin(): ?string {
    $value=trim((string)(getenv('IDV_GOOGLE_ORIGIN')?:IDV_GOOGLE_PRODUCTION_ORIGIN));
    if($value===''||strlen($value)>253)return null;
    $url=parse_url($value);
    if(!is_array($url)||($url['scheme']??null)!=='https'||
       !is_string($url['host']??null)||$url['host']===''||
       isset($url['user'])||isset($url['pass'])||isset($url['path'])||
       isset($url['query'])||isset($url['fragment']))
       return null;
    $host=strtolower((string)$url['host']);
    if($host!=='localhost'&&!str_contains($host,'.'))return null;
    return $value;
}
/** Safe diagnostics for authenticated users; never return the OAuth secret. */
function googleSetupHint(): ?string {
    if(googleCredentials()===null)
        return 'Google OAuth ist auf dem neuen Server noch nicht vollständig eingerichtet: GOOGLE_OAUTH_CLIENT_ID und/oder GOOGLE_OAUTH_CLIENT_SECRET fehlen oder sind ungültig.';
    if(googlePortalOrigin()===null)
        return 'IDV_GOOGLE_ORIGIN ist ungültig. Bitte eine HTTPS-Adresse ohne Pfad hinterlegen.';
    return null;
}
function googleOrigin(): string {
    $expected=googlePortalOrigin();
    if($expected===null)fail(503,'Google-OAuth-Portalursprung fehlt oder ist ungültig');
    $origin=(string)($_SERVER['HTTP_ORIGIN']??'');
    $host=(string)($_SERVER['HTTP_HOST']??'');
    $parsed=parse_url($origin);
    $originHost=strtolower((string)($parsed['host']??'')).(isset($parsed['port'])?':'.$parsed['port']:'');
    if(!is_array($parsed)||($parsed['scheme']??'')!=='https'||$originHost!==strtolower($host)||
        $origin!==('https://'.$host)||$origin!==$expected||
        ($_SERVER['HTTP_X_REQUESTED_WITH']??'')!=='XMLHttpRequest')
        fail(403,'Ungültiger Anmeldeursprung');
    return $origin;
}
function googleRequest(string $url,string $method='GET',?string $token=null,
    string|array|null $payload=null,?string $contentType=null,int $seconds=30): array {
    if(!function_exists('curl_init'))fail(503,'PHP-Erweiterung curl fehlt auf dem neuen Hoster');
    $parts=parse_url($url);
    if(!is_array($parts)||($parts['scheme']??'')!=='https'||
        !in_array(strtolower((string)($parts['host']??'')),['www.googleapis.com','oauth2.googleapis.com'],true))
        throw new \LogicException('Google API URL not allowed');
    $c=curl_init($url);
    $headers=['Accept: application/json'];
    if($token!==null)$headers[]='Authorization: Bearer '.$token;
    if($contentType!==null)$headers[]='Content-Type: '.$contentType;
    curl_setopt_array($c,[
        CURLOPT_RETURNTRANSFER=>true,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>$headers,
        CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>$seconds,CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_MAXREDIRS=>0
    ]);
    if($payload!==null)curl_setopt($c,CURLOPT_POSTFIELDS,
        is_array($payload)?http_build_query($payload,'','&',PHP_QUERY_RFC3986):$payload);
    $bytes=curl_exec($c);$http=(int)curl_getinfo($c,CURLINFO_HTTP_CODE);
    $error=curl_error($c);curl_close($c);
    if($bytes===false)throw new \RuntimeException('Google API-Verbindung fehlgeschlagen: '.$error);
    return ['code'=>$http,'body'=>$bytes];
}
function googleCodeForSession(string $code,string $origin,array $config): string {
    if(strlen($code)<15||strlen($code)>2048)fail(400,'Persönliche Google-Anmeldung fehlt');
    $r=googleRequest('https://oauth2.googleapis.com/token','POST',null,[
        'code'=>$code,'client_id'=>$config['id'],'client_secret'=>$config['secret'],
        'grant_type'=>'authorization_code','redirect_uri'=>$origin
    ],'application/x-www-form-urlencoded',20);
    $body=json_decode($r['body'],true);
    if($r['code']!==200||!is_array($body)||empty($body['access_token']))
        fail(401,'Google-Anmeldung fehlgeschlagen. Bitte erneut auswählen.');
    return (string)$body['access_token'];
}
// Source templates are now loaded from the private local DOCX bundle.
// The personal user OAuth token is never used to read original Drive files.
function docxRewrite(string $bytes,callable $rewrite): string {
    if(!class_exists(\ZipArchive::class))fail(503,'PHP-ZIP-Erweiterung für Word-Dokumente fehlt');
    $temporary=tempnam(sys_get_temp_dir(),'idvdoc_');
    if($temporary===false)throw new \RuntimeException('Temporäres Dokument kann nicht erzeugt werden');
    try {
        if(file_put_contents($temporary,$bytes,LOCK_EX)===false)
            throw new \RuntimeException('Vorlage konnte nicht geöffnet werden');
        $zip=new \ZipArchive();
        if($zip->open($temporary)!==true)fail(422,'Word-Datei ist beschädigt');
        try {
            $xml=$zip->getFromName('word/document.xml');
            if(!is_string($xml))fail(422,'Word-Inhalt in Vorlage fehlt');
            $fixed=$rewrite($xml);
            if(!$zip->addFromString('word/document.xml',$fixed))
                throw new \RuntimeException('Word-Inhalt konnte nicht aktualisiert werden');
        }finally{$zip->close();}
        $output=file_get_contents($temporary);
        if($output===false||strlen($output)<1000)fail(422,'Kein bearbeitbares Word-Dokument erzeugt');
        return $output;
    }finally{@unlink($temporary);}
}
function xmlValue(string $text): string {
    return htmlspecialchars($text,ENT_XML1|ENT_QUOTES,'UTF-8');
}
function docxReplace(string $xml,string $needle,array $values,bool $mandatory=false): string {
    $marker=xmlValue($needle);$count=substr_count($xml,$marker);
    if($mandatory&&$count!==count($values))
        fail(422,'Vorlage geändert: '.$needle.' ('.$count.' statt '.count($values).')');
    if($count===0)return $xml;
    if(count($values)===1)$values=array_fill(0,$count,$values[0]);
    if(count($values)!==$count)fail(422,'Vorlage: '.$needle.' ist nicht eindeutig');
    foreach($values as $value){
        $pos=strpos($xml,$marker);
        if($pos===false)fail(422,'Vorlagen-Platzhalter fehlt: '.$needle);
        $xml=substr_replace($xml,xmlValue((string)$value),$pos,strlen($marker));
    }
    return $xml;
}
function germanDocumentDate(string $day): string {
    return substr($day,8,2).'.'.substr($day,5,2).'.'.substr($day,0,4);
}
function googleUploadDocx(string $token,string $title,string $docx): string {
    if(strlen($docx)>8000000)fail(422,'Word-Dokument zu groß');
    $boundary='idv_document_'.bin2hex(random_bytes(10));
    $body='--'.$boundary."\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".
        json_encode(['name'=>$title,'mimeType'=>'application/vnd.google-apps.document'],JSON_THROW_ON_ERROR).
        "\r\n--".$boundary."\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n".
        $docx."\r\n--".$boundary."--\r\n";
    $r=googleRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType',
        'POST',$token,$body,'multipart/related; boundary='.$boundary,35);
    if($r['code']!==200)fail(422,'Google Drive hat die Speicherung abgelehnt (HTTP '.$r['code'].')');
    $file=json_decode($r['body'],true);
    if(!is_array($file)||empty($file['id'])||($file['mimeType']??'')!=='application/vnd.google-apps.document')
        fail(422,'Kein bearbeitbares Google-Dokument erstellt');
    return $file['id'];
}
function googleDeleteCreated(string $token,string $id): void {
    if(!preg_match('/^[A-Za-z0-9_-]{8,160}$/D',$id))return;
    try{googleRequest('https://www.googleapis.com/drive/v3/files/'.rawurlencode($id),
        'DELETE',$token,null,null,15);}catch(\Throwable $e){
        error_log('IDV: Google-Dokument nach abgebrochenem Schreibvorgang nicht gelöscht');
    }
}
