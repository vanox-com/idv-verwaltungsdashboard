<?php
declare(strict_types=1);
namespace IDV;

/* A separately managed encryption key lives outside the document root.
 * Only authenticated ciphertext is stored in MySQL, never the API secret. */
const EXAM_AI_OPTION='pruefung_ki_secret_v1';
function examAiKeyFile(bool $create): string {
    $dir=dirname(__DIR__).'/private';
    if(!is_dir($dir)&&(!$create||!@mkdir($dir,0700,true))&&!is_dir($dir))
        throw new \RuntimeException('Privates Serververzeichnis nicht verfügbar.');
    $real=realpath($dir);$public=realpath(dirname(__DIR__).'/public');
    $doc=(string)($_SERVER['DOCUMENT_ROOT']??'');$web=$doc!==''?realpath($doc):false;
    if($real===false||is_link($dir))throw new \RuntimeException('Unsicherer privater Speicher.');
    foreach([$public,$web] as $root)if($root!==false&&($real===$root||str_starts_with($real,$root.DIRECTORY_SEPARATOR)))
        throw new \RuntimeException('Privater Speicher liegt im öffentlichen Webverzeichnis.');
    $path=$real.'/exam-ai-v1.key';$lockPath=$real.'/exam-ai-v1.lock';
    if(is_link($path)||is_link($lockPath))throw new \RuntimeException('Unsicherer Schlüsselpfad.');
    $lock=@fopen($lockPath,'c');
    if($lock===false)throw new \RuntimeException('Privater Schlüsselspeicher nicht beschreibbar.');
    @chmod($lockPath,0600);
    try{
        if(!flock($lock,LOCK_EX))throw new \RuntimeException('Schlüsselspeicher gesperrt.');
        if(!is_file($path)){
            if(!$create)throw new \RuntimeException('Lokaler KI-Verschlüsselungsschlüssel fehlt.');
            if(sql('SELECT 1 FROM system_optionen WHERE schluessel=?',[EXAM_AI_OPTION]))throw new \RuntimeException('Lokaler KI-Verschlüsselungsschlüssel fehlt. Erst gespeicherte Verbindung entfernen.');
            $new=bin2hex(random_bytes(32));$h=@fopen($path,'x');
            if($h===false)throw new \RuntimeException('Schlüsseldatei nicht beschreibbar.');
            @chmod($path,0600);$ok=fwrite($h,$new)===64&&fflush($h);fclose($h);
            if(!$ok){@unlink($path);throw new \RuntimeException('Schlüsseldatei konnte nicht gespeichert werden.');}
        }
        $hex=@file_get_contents($path);
        if(!is_string($hex)||!preg_match('/^[a-f0-9]{64}$/D',$hex))throw new \RuntimeException('KI-Schlüsseldatei ungültig.');
        return hex2bin($hex);
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}
function examAiValidKey(string $key): bool {return preg_match('/^sk-[A-Za-z0-9_-]{16,480}$/D',$key)===1;}
function examAiEncrypt(string $key,string $master): string {
    $iv=random_bytes(12);$tag='';
    $cipher=openssl_encrypt($key,'aes-256-gcm',$master,OPENSSL_RAW_DATA,$iv,$tag,EXAM_AI_OPTION,16);
    if($cipher===false)throw new \RuntimeException('Verschlüsselung fehlgeschlagen.');
    return base64_encode($iv.$tag.$cipher);
}
function examAiDecrypt(string $encoded,string $master): string {
    $raw=base64_decode($encoded,true);
    if($raw===false||strlen($raw)<29)throw new \RuntimeException('KI-Konfiguration beschädigt.');
    $key=openssl_decrypt(substr($raw,28),'aes-256-gcm',$master,OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16),EXAM_AI_OPTION);
    if(!is_string($key)||!examAiValidKey($key))throw new \RuntimeException('KI-Konfiguration nicht entschlüsselbar.');
    return $key;
}
function examAiStored(): ?string {
    $r=sql('SELECT werte FROM system_optionen WHERE schluessel=?',[EXAM_AI_OPTION]);
    if(!$r)return null;
    $v=json_decode((string)$r[0]['werte'],true);
    if(!is_array($v)||!is_string($v['cipher']??null))throw new \RuntimeException('KI-Konfiguration ungültig.');
    return $v['cipher'];
}
function examAiKey(): string {
    $cipher=examAiStored();
    if($cipher!==null)return examAiDecrypt($cipher,examAiKeyFile(false));
    return trim((string)getenv('OPENAI_API_KEY'));
}
function examAiStatus(): array {
    try{
        $saved=examAiStored()!==null;
        $configured=examAiKey()!=='';
        return ['bereit'=>$configured&&function_exists('curl_init'),'quelle'=>$saved?'panel':($configured?'hoster':'keine'),'hinweis'=>!function_exists('curl_init')?'PHP-curl fehlt auf dem Hoster.':null];
    }catch(\Throwable $e){return ['bereit'=>false,'quelle'=>'fehler','hinweis'=>'Gespeicherte KI-Konfiguration nicht lesbar. Verbindung entfernen und neu einrichten.'];}
}
function examAiConfigEndpoint(array $u,string $method): never {
    if(!pruefungImportAdmin($u))fail(403,'Nur Administratoren dürfen die KI-Verbindung verwalten.');
    if($method==='GET')respond(200,examAiStatus());
    if($method!=='POST')fail(405,'Nicht erlaubt');
    if(!secureRequest())fail(403,'KI-Schlüssel dürfen nur über HTTPS übertragen werden.');
    $b=body();$action=$b['aktion']??'';
    if($action==='entfernen'){
        sql('DELETE FROM system_optionen WHERE schluessel=?',[EXAM_AI_OPTION]);
        auditAction($u,'KI-Verbindung des Prüfungszentrums entfernt');
        respond(200,examAiStatus());
    }
    if($action!=='speichern')fail(400,'Unbekannte Aktion');
    $key=$b['apiKey']??null;
    if(!is_string($key)||!examAiValidKey(trim($key)))fail(400,'Gültigen OpenAI-Projektschlüssel eingeben (sk-…).');
    if(!function_exists('curl_init')||!function_exists('openssl_encrypt'))fail(503,'PHP-curl oder OpenSSL fehlt.');
    $key=trim($key);
    try{$master=examAiKeyFile(true);}catch(\Throwable $e){fail(503,'Privater KI-Schlüsselspeicher nicht verfügbar. Hoster muss PHP Schreibzugriff außerhalb public erlauben.');}
    require_once __DIR__.'/PruefungenKI.php';
    // Explicit administrator test, no real exam data.
    pruefungKiVorschlag(['punkte'=>1,'titel'=>'Test: 1 + 1?','muster'=>'2'],'2',$key);
    try{$cipher=examAiEncrypt($key,$master);}catch(\Throwable $e){fail(503,'API-Schlüssel konnte nicht verschlüsselt werden.');}
    sql('INSERT INTO system_optionen(schluessel,werte) VALUES(?,?) ON DUPLICATE KEY UPDATE werte=VALUES(werte),aktualisiert=UTC_TIMESTAMP(6)',[EXAM_AI_OPTION,pruefungJson(['cipher'=>$cipher])]);
    auditAction($u,'KI-Verbindung des Prüfungszentrums eingerichtet');
    respond(200,examAiStatus());
}
