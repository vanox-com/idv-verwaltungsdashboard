<?php
declare(strict_types=1);
namespace IDV;

/**
 * Abmeldungen des Polizei-Discord-Bots.
 * Die Daten liegen beim Bot (Quelle der Wahrheit, inkl. Discord-Nachrichten).
 * Das Panel spricht serverseitig dessen authentifizierte HTTP-API an:
 *   POLBOT_API_URL    z. B. http://192.168.100.60:1028   (nur intern erreichbar)
 *   POLBOT_API_SECRET Shared Secret (nur in den Plesk-PHP-Umgebungsvariablen)
 * Annehmen/Ablehnen löst beim Bot exakt denselben Ablauf aus wie die Discord-Buttons.
 */
const ABM_STATUS = ['offen','angenommen','abgelehnt'];

function abmBotRequest(string $method,string $path,?array $payload=null): array {
    $base=getenv('POLBOT_API_URL');$secret=getenv('POLBOT_API_SECRET');
    if(!is_string($base)||$base===''||!is_string($secret)||strlen($secret)<32)
        fail(503,'Anbindung an den Polizei-Bot ist nicht konfiguriert');
    $url=rtrim($base,'/').$path;
    $headers=['Authorization: Bearer '.$secret,'Accept: application/json'];
    $body=null;
    if($payload!==null){
        $body=json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
        $headers[]='Content-Type: application/json';
    }
    $timeout=$method==='GET'?8:45;
    if(function_exists('curl_init')){
        $ch=curl_init($url);
        curl_setopt_array($ch,[
            CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_RETURNTRANSFER=>true,
            CURLOPT_HTTPHEADER=>$headers,CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>$timeout,
            CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,
        ]);
        if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,$body);
        $raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);
        curl_close($ch);
    }else{
        $ctx=stream_context_create(['http'=>[
            'method'=>$method,'header'=>implode("\r\n",$headers),'content'=>$body??'',
            'timeout'=>$timeout,'ignore_errors'=>true,'follow_location'=>0]]);
        $raw=@file_get_contents($url,false,$ctx);$code=0;
        foreach(($http_response_header??[]) as $h)
            if(preg_match('#^HTTP/\S+\s+(\d{3})#',$h,$m))$code=(int)$m[1];
    }
    if($raw===false||$code===0){
        error_log('[IDV PHP] Polizei-Bot nicht erreichbar');
        fail(502,'Polizei-Bot ist nicht erreichbar');
    }
    try{$data=json_decode((string)$raw,true,32,JSON_THROW_ON_ERROR);}
    catch(\Throwable $e){fail(502,'Ungültige Antwort vom Polizei-Bot');}
    if(!is_array($data))fail(502,'Ungültige Antwort vom Polizei-Bot');
    if($code===401||$code===403){
        error_log('[IDV PHP] Polizei-Bot lehnt Zugriff ab ('.$code.')');
        fail(502,'Polizei-Bot lehnt den Zugriff des Panels ab');
    }
    return ['code'=>$code,'data'=>$data];
}
function abmId(string $raw): string {
    $id=rawurldecode($raw);
    if(!preg_match('/^[a-z0-9_]{3,40}$/D',$id))fail(400,'Ungültige Abmeldungs-ID');
    return $id;
}
function dispatchAbmeldungen(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/abmeldungen'){
        needRight($u,'abm');
        $status=(string)($_GET['status']??'');
        $q=in_array($status,ABM_STATUS,true)?'?status='.$status:'';
        $r=abmBotRequest('GET','/abmeldungen'.$q);
        if($r['code']!==200)fail(502,(string)($r['data']['error']??'Polizei-Bot meldet einen Fehler'));
        respond(200,['abmeldungen'=>array_values($r['data']['abmeldungen']??[]),
            'schreiben'=>(rights($u)['abm']??0)>=2]);
    }
    if($method==='POST'&&preg_match('#^/api/abmeldungen/([^/]+)/entscheidung$#D',$uri,$m)){
        needRight($u,'abm',2);
        $id=abmId($m[1]);$b=body();
        $aktion=$b['aktion']??null;
        if(!in_array($aktion,['annehmen','ablehnen'],true))fail(400,'Aktion muss annehmen oder ablehnen sein');
        $name=userName($u);
        $r=abmBotRequest('POST','/abmeldungen/'.rawurlencode($id).'/entscheidung',[
            'aktion'=>$aktion,
            'bearbeiter'=>['name'=>mb_substr($name,0,80),'dienstnummer'=>(string)$u['dienstnummer']],
        ]);
        $ok=$r['code']===200&&($r['data']['ok']??false)===true;
        $a=$r['data']['abmeldung']??null;
        $info=is_array($a)?' (DN '.mb_substr((string)($a['dienstnummer']??''),0,20).', '.
            mb_substr((string)($a['von']??''),0,10).'–'.mb_substr((string)($a['bis']??''),0,10).')':'';
        if($ok){
            auditAction($u,'Abmeldung '.($aktion==='annehmen'?'angenommen':'abgelehnt').': '.$id.$info,'edit');
            respond(200,['ok'=>true,'abmeldung'=>$a]);
        }
        $code=in_array($r['code'],[400,404,409,422,503],true)?$r['code']:502;
        respond($code,['error'=>(string)($r['data']['error']??'Polizei-Bot meldet einen Fehler'),'abmeldung'=>$a]);
    }
    return false;
}
