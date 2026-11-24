<?php
declare(strict_types=1);
namespace IDV;

/**
 * Temporäre 1:1-Unterrichtssitzung. PHP dient ausschließlich zur WebRTC-Signalisierung.
 * Weder Videodaten noch Google-Dateiinhalte werden auf dem Server gespeichert.
 * Zuschauer brauchen den zufälligen Einladungslink; nur der erstellende Ausbilder
 * mit gültiger Panel-Sitzung darf den Bildschirm senden.
 */
function unterrichtSdp(mixed $input, string $type): string {
    if(!is_string($input) || strlen($input)<80 || strlen($input)>20000
        || !str_starts_with($input,'v=0') || !str_contains($input,'m=video'))
        fail(400,'Ungültige WebRTC-Verbindungsbeschreibung');
    return $input;
}
function unterrichtRaum(int $id, int $userId): array {
    $found=sql('SELECT * FROM ausbildung_unterricht WHERE id=? AND ausbilder_user_id=? LIMIT 1',
        [$id,$userId]);
    if(!$found)fail(404,'Unterrichtssitzung nicht gefunden');
    return $found[0];
}
function unterrichtAktiv(array $room): void {
    if((int)$room['beendet']===1 || strtotime((string)$room['ablauf'])<=time())
        fail(410,'Die Unterrichtssitzung ist beendet oder abgelaufen');
}
function unterrichtToken(array $input): string {
    $token=$input['token']??null;
    if(!is_string($token)||!preg_match('/^[0-9a-f]{64}$/D',$token))
        fail(404,'Einladung ungültig');
    return hash('sha256',$token);
}
function unterrichtClient(array $input): string {
    $token=$input['client']??null;
    if(!is_string($token)||!preg_match('/^[0-9a-f]{32,64}$/D',$token))
        fail(400,'Teilnehmerkennung ungültig');
    return hash('sha256',$token);
}
function unterrichtGastRaum(array $input, bool $join=false): array {
    $hash=unterrichtToken($input);
    $client=unterrichtClient($input);
    $rooms=sql('SELECT * FROM ausbildung_unterricht WHERE einladung_hash=? LIMIT 1',[$hash]);
    if(!$rooms)fail(404,'Einladung nicht gefunden');
    $room=$rooms[0];unterrichtAktiv($room);
    if($room['teilnehmer_hash']===null && $join){
        // First invitee claims the single learner seat. Parallel joins cannot steal it.
        sql('UPDATE ausbildung_unterricht SET teilnehmer_hash=?,aktualisiert=UTC_TIMESTAMP(6)
             WHERE id=? AND teilnehmer_hash IS NULL',[$client,$room['id']]);
        $room=sql('SELECT * FROM ausbildung_unterricht WHERE id=? LIMIT 1',[$room['id']])[0];
    }
    if(!is_string($room['teilnehmer_hash'])||
        !hash_equals((string)$room['teilnehmer_hash'],$client))
        fail(403,'Der Unterrichtsplatz ist bereits vergeben oder nicht freigeschaltet');
    return $room;
}
function unterrichtGastState(array $room): array {
    return ['aktiv'=>true,'angebot'=>$room['angebot'],
        'teilnehmerAngemeldet'=>$room['teilnehmer_hash']!==null];
}
function dispatchUnterrichtGast(string $method, string $uri): bool {
    if(!str_starts_with($uri,'/api/unterricht/'))return false;
    if($method!=='POST')fail(405,'Methode nicht erlaubt');
    $input=body();
    if($uri==='/api/unterricht/beitreten'){
        $room=unterrichtGastRaum($input,true);
        respond(200,unterrichtGastState($room));
    }
    if($uri==='/api/unterricht/status'){
        $room=unterrichtGastRaum($input);
        respond(200,unterrichtGastState($room));
    }
    if($uri==='/api/unterricht/antwort'){
        $room=unterrichtGastRaum($input);
        if(empty($room['angebot']))fail(409,'Der Ausbilder sendet noch nicht');
        $sdp=unterrichtSdp($input['sdp']??null,'answer');
        sql('UPDATE ausbildung_unterricht SET antwort=?,aktualisiert=UTC_TIMESTAMP(6)
             WHERE id=? AND einladung_hash=? AND beendet=0 AND ablauf>UTC_TIMESTAMP()',
             [$sdp,$room['id'],$room['einladung_hash']]);
        respond(200,['ok'=>true]);
    }
    fail(404,'Unterrichts-Endpunkt unbekannt');
}
function dispatchUnterrichtTrainer(array $u,string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/ausbildung/unterricht'))return false;
    ausbildungRecht($u);
    if($uri==='/api/ausbildung/unterricht'&&$method==='POST'){
        $input=body();
        $code=$input['modul_code']??null;$materialId=$input['material_id']??null;
        if(!is_string($code)||!preg_match('/^(?:PM|PK)\.[0-9]+$/D',$code)
            ||!is_int($materialId)||$materialId<1)
            fail(400,'Gültiges Ausbildungsmodul und Präsentation erforderlich');
        ausbildungDarfModul($u,$code);
        $material=sql("SELECT id,url,titel FROM ausbildung_materialien
            WHERE id=? AND modul_code=? AND aktiv=1 AND url LIKE 'https://docs.google.com/presentation/%'
            LIMIT 1",[$materialId,$code]);
        if(!$material)fail(409,'Für dieses Modul ist keine Google-Präsentation verknüpft');
        $token=bin2hex(random_bytes(32));
        sql('INSERT INTO ausbildung_unterricht
            (modul_code,material_id,ausbilder_user_id,einladung_hash,ablauf)
            VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))',
            [$code,$materialId,(int)$u['id'],hash('sha256',$token)]);
        $id=(int)db()->lastInsertId();
        auditAction($u,'Unterricht für '.$code.' gestartet; Sitzungs-ID '.$id,'add');
        respond(201,['id'=>$id,'einladung'=>'/unterricht.html#'.$token,
            'modul_code'=>$code,'titel'=>$material[0]['titel'],'url'=>$material[0]['url']]);
    }
    if(!preg_match('#^/api/ausbildung/unterricht/([1-9][0-9]*)/(status|angebot|beenden)$#D',$uri,$m))
        fail(404,'Unterrichtssitzung nicht gefunden');
    $id=(int)$m[1];$action=$m[2];
    $room=unterrichtRaum($id,(int)$u['id']);
    if($action==='beenden'&&$method==='POST'){
        sql('UPDATE ausbildung_unterricht SET beendet=1,angebot=NULL,antwort=NULL,
             aktualisiert=UTC_TIMESTAMP(6) WHERE id=? AND ausbilder_user_id=?',
             [$id,(int)$u['id']]);
        auditAction($u,'Unterrichtssitzung '.$id.' beendet','edit');
        respond(200,['ok'=>true]);
    }
    unterrichtAktiv($room);
    if($action==='status'&&$method==='GET')
        respond(200,['aktiv'=>true,'teilnehmerAngemeldet'=>$room['teilnehmer_hash']!==null,
            'antwort'=>$room['antwort']]);
    if($action==='angebot'&&$method==='POST'){
        $input=body();$sdp=unterrichtSdp($input['sdp']??null,'offer');
        sql('UPDATE ausbildung_unterricht SET angebot=?,antwort=NULL,
             aktualisiert=UTC_TIMESTAMP(6)
             WHERE id=? AND ausbilder_user_id=? AND beendet=0 AND ablauf>UTC_TIMESTAMP()',
             [$sdp,$id,(int)$u['id']]);
        respond(200,['ok'=>true]);
    }
    fail(405,'Methode nicht erlaubt');
}
