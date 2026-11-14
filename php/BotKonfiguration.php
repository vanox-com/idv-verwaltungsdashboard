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
 */
require_once __DIR__.'/Abmeldungen.php';

function botcfgLabels(array $data, array $paths): string {
    $labels=[];
    foreach(($data['felder']??[]) as $f)
        if(is_array($f)&&in_array($f['path']??null,$paths,true))$labels[]=(string)($f['label']??$f['path']);
    $s=implode(', ',$labels?:$paths);
    return mb_strlen($s)>900?mb_substr($s,0,900).' …':$s;
}
function dispatchBotKonfiguration(array $u,string $method,string $uri): bool {
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
