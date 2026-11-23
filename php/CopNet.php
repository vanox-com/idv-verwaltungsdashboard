<?php
declare(strict_types=1);
namespace IDV;

/**
 * The original Node.js/PHP AES-GCM records have no prefix and require the
 * original COPNET_ENCRYPTION_KEY. Never derive that key from another secret.
 *
 * On PHP hosts without that environment setting, new entries use a randomly
 * generated, server-local v2 key. It lives outside public/ and must be included
 * in encrypted server backups; it is never returned to the browser or Git.
 */
function copNetLegacyKey(): ?string {
    $hex=getenv('COPNET_ENCRYPTION_KEY');
    if($hex===false||$hex==='')return null;
    if(!preg_match('/^[a-f0-9]{64}$/iD',$hex))
        fail(503,'Ungültiger CopNet-Verschlüsselungsschlüssel in der Serverkonfiguration');
    return hex2bin($hex);
}

function copNetLocalKey(bool $create): string {
    $dir=getenv('IDV_COPNET_KEY_DIRECTORY') ?: dirname(__DIR__).'/private';
    if(!str_starts_with($dir,DIRECTORY_SEPARATOR))
        fail(503,'CopNet-Schlüsselverzeichnis muss ein absoluter privater Pfad sein');
    if(!is_dir($dir)){
        if(!$create||!@mkdir($dir,0700,true))
            fail(503,'Privates CopNet-Schlüsselverzeichnis nicht verfügbar');
    }
    $real=realpath($dir);
    $public=realpath(dirname(__DIR__).'/public');
    $documentRoot=(string)($_SERVER['DOCUMENT_ROOT']??'');
    $webRoot=$documentRoot!==''?realpath($documentRoot):false;
    foreach([$public,$webRoot] as $exposed){
        if($real===false||($exposed!==false&&($real===$exposed||str_starts_with($real,$exposed.DIRECTORY_SEPARATOR))))
            fail(503,'CopNet-Schlüsselverzeichnis darf nicht öffentlich erreichbar sein');
    }

    $path=$real.'/copnet-v2.key';
    $lockPath=$real.'/copnet-v2.lock';
    if(is_link($path)||is_link($lockPath))
        fail(503,'Unsicherer CopNet-Schlüsselpfad');
    $lock=@fopen($lockPath,'c');
    if($lock===false)fail(503,'CopNet-Schlüsselspeicher nicht beschreibbar');
    @chmod($lockPath,0600);
    if(!flock($lock,LOCK_EX)){
        fclose($lock);
        fail(503,'CopNet-Schlüsselspeicher gesperrt');
    }
    try{
        if(!is_file($path)){
            if(!$create)fail(503,'CopNet-Schlüsseldatei fehlt – Sicherung wiederherstellen');
            // Never silently replace a lost key when v2 records already exist.
            if(sql('SELECT 1 FROM copnet_zugaenge WHERE passwort_verschluesselt LIKE ? LIMIT 1',['v2:%']))
                fail(503,'CopNet-Schlüsseldatei fehlt – vorhandenen Schlüssel aus Sicherung wiederherstellen');
            $key=bin2hex(random_bytes(32));
            $handle=@fopen($path,'x');
            if($handle===false)fail(503,'CopNet-Schlüsseldatei konnte nicht angelegt werden');
            @chmod($path,0600);
            $written=@fwrite($handle,$key);
            $flushed=@fflush($handle);
            fclose($handle);
            if($written!==64||!$flushed){
                @unlink($path);
                fail(503,'CopNet-Schlüsseldatei konnte nicht gespeichert werden');
            }
        }
        if(is_link($path))fail(503,'Unsicherer CopNet-Schlüsselpfad');
        $hex=@file_get_contents($path);
        if(!is_string($hex)||!preg_match('/^[a-f0-9]{64}$/iD',$hex))
            fail(503,'CopNet-Schlüsseldatei beschädigt oder nicht lesbar');
        return hex2bin($hex);
    }finally{
        flock($lock,LOCK_UN);
        fclose($lock);
    }
}

// Retained for migration/preflight callers: the legacy key must remain exact.
function copNetKey(): string {
    return copNetLegacyKey()??copNetLocalKey(true);
}
function copNetDecode(?string $encoded): string {
    if(!$encoded)return '';
    $managed=str_starts_with($encoded,'v2:');
    $payload=$managed?substr($encoded,3):$encoded;
    $parts=explode('.',$payload);
    if(count($parts)!==3)fail(500,'Ungültiges Verschlüsselungsformat');
    $iv=base64_decode($parts[0],true);
    $tag=base64_decode($parts[1],true);
    $cipher=base64_decode($parts[2],true);
    if($iv===false||$tag===false||$cipher===false||strlen($iv)!==12||strlen($tag)!==16)
        fail(500,'Ungültiges Verschlüsselungsformat');
    // Unprefixed legacy records must NEVER be decrypted using the new key.
    $key=$managed?copNetLocalKey(false):copNetLegacyKey();
    if($key===null)fail(503,'Alter CopNet-Verschlüsselungsschlüssel fehlt am Hoster');
    $plain=openssl_decrypt($cipher,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag);
    if($plain===false)fail(503,'CopNet-Entschlüsselung fehlgeschlagen');
    return $plain;
}
function copNetEncode(string $value): string {
    if($value==='')return '';
    $legacy=copNetLegacyKey();
    $key=$legacy??copNetLocalKey(true);
    $iv=random_bytes(12);$tag='';
    $cipher=openssl_encrypt($value,'aes-256-gcm',$key,OPENSSL_RAW_DATA,$iv,$tag,'',16);
    if($cipher===false)fail(503,'CopNet-Verschlüsselung fehlgeschlagen');
    $encoded=implode('.',array_map('base64_encode',[$iv,$tag,$cipher]));
    return $legacy===null?'v2:'.$encoded:$encoded;
}
function copNetSensitive(array $u): void {
    $r=sql('SELECT sensibel FROM roles WHERE name=?',[$u['rolle']]);
    if((int)($r[0]['sensibel']??0)!==1)fail(403,'Zugriff auf Zugangsdaten nicht erlaubt');
}
function dispatchCopNet(array $u,string $method,string $uri): bool {
    if(!preg_match('#^/api/copnet/([1-9][0-9]*)$#D',$uri,$m))return false;
    $nr=cleanId($m[1]);needRight($u,'pers',$method==='GET'?1:2);copNetSensitive($u);
    if(!sql('SELECT 1 FROM personal WHERE personalnummer=?',[$nr]))fail(404,'Person nicht gefunden');
    if($method==='GET'){
        $r=sql('SELECT dienstnummer,passwort_verschluesselt FROM copnet_zugaenge WHERE personalnummer=?',[$nr]);
        respond(200,['dienstnummer'=>$r[0]['dienstnummer']??'',
            'passwort'=>copNetDecode($r[0]['passwort_verschluesselt']??'')]);
    }
    if($method==='PUT'){
        $b=body();$number=trim((string)($b['dienstnummer']??''));$password=(string)($b['passwort']??'');
        if(strlen($number)>120||strlen($password)>500)fail(400,'Zugangsdaten zu lang');
        $encrypted=copNetEncode($password);
        sql('INSERT INTO copnet_zugaenge(personalnummer,dienstnummer,passwort_verschluesselt)
            VALUES(?,?,?) ON DUPLICATE KEY UPDATE dienstnummer=VALUES(dienstnummer),
            passwort_verschluesselt=VALUES(passwort_verschluesselt),aktualisiert=UTC_TIMESTAMP(6)',
            [$nr,$number,$encrypted]);
        auditAction($u,'CopNet-Zugang bei Personalnummer '.$nr.' aktualisiert');
        respond(200,['ok'=>true]);
    }
    return false;
}
