<?php
declare(strict_types=1);
namespace IDV;

/**
 * Bot-Konfiguration des Polizei-Discord-Bots (Modul „botcfg“).
 * Formular-Editor für die freigegebenen Felder (Google Sheets, Kanäle, To-do-Kanäle, SEK,
 * Kategorie zuordnen, Funkbesetzung). Quelle der Wahrheit ist der Bot (data/config.json);
 * das Panel spricht dessen authentifizierte HTTP-API serverseitig an (POLBOT_API_URL/SECRET,
 * siehe Abmeldungen.php). Geheimnisse des Bots sind über diese API nicht erreichbar.
 *   GET /api/botcfg   Stufe 1: Schema, Werte, Standardwerte, Quelle, Guild-Verzeichnis
 *   PUT /api/botcfg   Stufe 2: { werte: { <pfad>: <wert>|null }, rev } – null = Standard
 *   GET  /api/botcfg/status    Stufe 1: Online-Status des Bots (bereit, gestartetAm)
 *   POST /api/botcfg/neustart  Stufe 2: Neustart über die Pterodactyl-Client-API (power restart).
 *        Eigener Dienst-Account nur mit control.restart auf dem Bot-Server; Key nur als Env
 *        PTERO_RESTART_KEY (+ PTERO_PANEL_URL, PTERO_SERVER_ID). Das Frontend fasst mehrere
 *        Speichervorgänge zusammen (ca. 5 s) und ruft danach einmal neustart auf.
 */
require_once __DIR__.'/Abmeldungen.php';

function botcfgLabels(array $data, array $paths): string {
    $labels=[];
    foreach(($data['felder']??[]) as $f)
        if(is_array($f)&&in_array($f['path']??null,$paths,true))$labels[]=(string)($f['label']??$f['path']);
    $s=implode(', ',$labels?:$paths);
    return mb_strlen($s)>900?mb_substr($s,0,900).' …':$s;
}
/** Kein respond()/fail() bei Nichterreichbarkeit: Status-Abfragen während des Neustarts sind normal. */
function botcfgHealthSafe(): array {
    $base=getenv('POLBOT_API_URL');$secret=getenv('POLBOT_API_SECRET');
    if(!is_string($base)||$base===''||!is_string($secret)||strlen($secret)<32)return ['erreichbar'=>false,'bereit'=>false,'gestartetAm'=>null];
    $ch=curl_init(rtrim($base,'/').'/health');
    curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$secret,'Accept: application/json'],
        CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>4,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS]);
    $raw=curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
    $d=is_string($raw)?json_decode($raw,true):null;
    if($code!==200||!is_array($d))return ['erreichbar'=>false,'bereit'=>false,'gestartetAm'=>null];
    return ['erreichbar'=>true,'bereit'=>($d['bereit']??false)===true,'gestartetAm'=>is_string($d['gestartetAm']??null)?$d['gestartetAm']:null];
}
function botcfgRestart(): array {
    $url=getenv('PTERO_PANEL_URL');$key=getenv('PTERO_RESTART_KEY');$id=getenv('PTERO_SERVER_ID');
    if(!is_string($url)||$url===''||!is_string($key)||strlen($key)<40||!is_string($id)||!preg_match('/^[a-f0-9]{8}$/D',$id))
        fail(503,'Automatischer Neustart ist nicht konfiguriert');
    $ch=curl_init(rtrim($url,'/').'/api/client/servers/'.$id.'/power');
    curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_POSTFIELDS=>'{"signal":"restart"}',
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$key,'Accept: application/json','Content-Type: application/json'],
        CURLOPT_CONNECTTIMEOUT=>4,CURLOPT_TIMEOUT=>15,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
    curl_exec($ch);$code=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
    if($code!==204){error_log('[IDV PHP] Pterodactyl-Neustart fehlgeschlagen ('.$code.')');fail(502,'Neustart über Pterodactyl fehlgeschlagen (HTTP '.$code.')');}
    return ['ok'=>true];
}
function dispatchBotKonfiguration(array $u,string $method,string $uri): bool {
    if($uri==='/api/botcfg/status'&&$method==='GET'){
        needRight($u,'botcfg');
        respond(200,botcfgHealthSafe());
    }
    if($uri==='/api/botcfg/neustart'&&$method==='POST'){
        needRight($u,'botcfg',2);
        $h=botcfgHealthSafe();
        // Zusammenfassen: Läuft der Bot erst seit < 20 s (z. B. Neustart aus anderem Tab), nicht erneut starten.
        if($h['gestartetAm']&&($t=strtotime($h['gestartetAm']))!==false&&time()-$t<20)
            respond(200,['ok'=>true,'neustart'=>false,'grund'=>'Bot wurde gerade erst neu gestartet','vorher'=>$h]);
        botcfgRestart();
        auditAction($u,'Polizei-Bot nach Konfigurationsänderung neu gestartet','edit');
        respond(200,['ok'=>true,'neustart'=>true,'vorher'=>$h]);
    }
    if($uri!=='/api/botcfg')return false;
    if($method==='GET'){
        needRight($u,'botcfg');
        $r=abmBotRequest('GET','/config');
        if($r['code']!==200)fail(502,(string)($r['data']['error']??'Polizei-Bot meldet einen Fehler'));
        $d=$r['data'];unset($d['ok']);
        $d['schreiben']=(rights($u)['botcfg']??0)>=2;
        respond(200,$d);
    }
    if($method==='PUT'){
        needRight($u,'botcfg',2);
        $b=body();
        $werte=$b['werte']??null;
        if(!is_array($werte)||array_is_list($werte)&&$werte!==[])fail(400,'werte muss ein Objekt sein');
        if(count($werte)>80)fail(400,'Zu viele Felder');
        foreach(array_keys($werte) as $k)
            if(!is_string($k)||!preg_match('/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){0,4}$/D',$k))fail(400,'Ungültiger Feldname');
        $rev=$b['rev']??null;
        if($rev!==null&&!is_int($rev))fail(400,'rev muss eine Zahl sein');
        $r=abmBotRequest('PUT','/config',[
            'werte'=>(object)$werte,
            'rev'=>$rev,
            'bearbeiter'=>['name'=>mb_substr(userName($u),0,80),'dienstnummer'=>(string)$u['dienstnummer']],
        ]);
        $d=$r['data'];
        if($r['code']===200&&($d['ok']??false)===true){
            $geaendert=array_values(array_filter((array)($d['geaendert']??[]),'is_string'));
            if($geaendert)auditAction($u,'Polizei-Bot-Konfiguration geändert (Version '.(int)($d['rev']??0).'): '.botcfgLabels($d,$geaendert),'edit');
            unset($d['ok']);
            $d['schreiben']=true;
            respond(200,$d);
        }
        $code=match($r['code']){400,422=>422,409=>412,503=>503,default=>502};
        respond($code,['error'=>(string)($d['error']??'Polizei-Bot meldet einen Fehler'),'fehler'=>is_array($d['fehler']??null)?$d['fehler']:(object)[]]);
    }
    fail(405,'Methode nicht erlaubt');
}
