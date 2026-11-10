<?php
declare(strict_types=1);
namespace IDV;

function copNetKey(): string {
    $hex=(string)(getenv('COPNET_ENCRYPTION_KEY')?:'');
    if(!preg_match('/^[a-f0-9]{64}$/iD',$hex))fail(503,'Verschlüsselungsschlüssel nicht konfiguriert');
    return hex2bin($hex);
}
function copNetDecode(?string $encoded): string {
    if(!$encoded)return '';
    $parts=explode('.',$encoded);
    if(count($parts)!==3)fail(500,'Ungültiges Verschlüsselungsformat');
    $iv=base64_decode($parts[0],true);
    $tag=base64_decode($parts[1],true);
    $cipher=base64_decode($parts[2],true);
    if($iv===false||$tag===false||$cipher===false||strlen($iv)!==12||strlen($tag)!==16)
        fail(500,'Ungültiges Verschlüsselungsformat');
    $plain=openssl_decrypt($cipher,'aes-256-gcm',copNetKey(),OPENSSL_RAW_DATA,$iv,$tag);
    if($plain===false)fail(503,'CopNet-Entschlüsselung fehlgeschlagen');
    return $plain;
}
function copNetEncode(string $value): string {
    if($value==='')return '';
    $iv=random_bytes(12);$tag='';
    $cipher=openssl_encrypt($value,'aes-256-gcm',copNetKey(),OPENSSL_RAW_DATA,$iv,$tag,'',16);
    if($cipher===false)fail(503,'CopNet-Verschlüsselung fehlgeschlagen');
    return implode('.',array_map('base64_encode',[$iv,$tag,$cipher]));
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
