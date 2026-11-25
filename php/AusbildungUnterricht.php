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
    $expires=(new \DateTimeImmutable((string)$room['ablauf'],new \DateTimeZone('UTC')))->getTimestamp();
    if((int)$room['beendet']===1 || $expires<=time())
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
/** Snapshot the assigned person's name and service number, not a mutable DN reference. */
function unterrichtTeilnehmerListe(array $u): array {
    $trainer=ausbildungTrainer($u);
    $codes=json_decode((string)($trainer['kompetenzen']??'[]'),true);
    $codes=is_array($codes)?$codes:[];
    if(ausbildungLeitung($u))$codes=array_column(sql("SELECT code FROM ausbildung_module WHERE aktiv=1"),'code');
    $wb=in_array('WB',$codes,true);$pm=false;$pk=false;
    foreach($codes as $code){if(str_starts_with((string)$code,'PM.'))$pm=true;if(str_starts_with((string)$code,'PK.'))$pk=true;}
    $result=[];
    foreach(ausbildungPersonalZeilen() as $p){
        if(!in_array($p['status'],['Aktiv','Abgemeldet'],true))continue;
        $nr=(int)$p['personalnummer'];$name=trim((string)$p['vorname'].' '.(string)$p['nachname']);
        if($nr<1||$name===''||trim((string)$p['vorname'])===''||trim((string)$p['nachname'])===''||in_array(trim((string)$p['vorname']),['-','–'],true)||in_array(trim((string)$p['nachname']),['-','–'],true))continue;
        $track=ausbildungPersonalLaufbahn((string)$p['dienstgrad']);
        if(!$wb&&!(($track==='PMA'&&$pm)||(in_array($track,['PKA','KKA'],true)&&$pk)))continue;
        $result[]=['key'=>ausbildungPersonalQuelle($nr,(int)$p['belegungen']),'dn'=>$nr,'name'=>$name,'laufbahn'=>$track];
    }
    return $result;
}
function unterrichtTeilnehmerPasst(string $code,?string $track): bool {
    return $code==='WB'||(str_starts_with($code,'PM.')&&$track==='PMA')||(str_starts_with($code,'PK.')&&in_array($track,['PKA','KKA'],true));
}
function unterrichtLogPrefix(array $room): string {
    return 'Unterricht für '.$room['modul_code'].' gestartet; Sitzungs-ID '.(int)$room['id'].'; ';
}
function unterrichtZuordnung(array $room): string {
    $prefix=unterrichtLogPrefix($room);
    $rows=sql('SELECT aktion FROM log WHERE aktion LIKE ? ORDER BY id ASC LIMIT 1',[$prefix.'%']);
    return $rows?substr((string)$rows[0]['aktion'],strlen($prefix)):'Teilnehmer nicht erfasst (Altbestand)';
}
function unterrichtLog(?int $uid,string $message,string $art='edit'): void {
    sql('INSERT INTO log(user_id,aktion,art) VALUES(?,?,?)',[$uid,$message,$art]);
}
function unterrichtGastRaum(array $input, bool $join=false): array {
    $hash=unterrichtToken($input);
    $client=unterrichtClient($input);
    $rooms=sql('SELECT * FROM ausbildung_unterricht WHERE einladung_hash=? LIMIT 1',[$hash]);
    if(!$rooms)fail(404,'Einladung nicht gefunden');
    $room=$rooms[0];unterrichtAktiv($room);
    if($room['teilnehmer_hash']===null && $join){
        // Record the first successful claim exactly once, in the same transaction.
        $pdo=db();$pdo->beginTransaction();
        try{
            $room=sql('SELECT * FROM ausbildung_unterricht WHERE id=? FOR UPDATE',[$room['id']])[0];
            unterrichtAktiv($room);
            if($room['teilnehmer_hash']===null){
                sql('UPDATE ausbildung_unterricht SET teilnehmer_hash=?,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',[$client,$room['id']]);
                $room['teilnehmer_hash']=$client;
                unterrichtLog(null,'Unterrichtssitzung '.(int)$room['id'].' · Einladungsplatz belegt; '.unterrichtZuordnung($room).' (Identität nicht verifiziert)');
            }
            $pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
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
    if(!ausbildungSchemaStatus()['unterrichtBereit'])
        fail(503,'Die Unterrichtsdatenbank fehlt. Bitte als Administrator zuerst eine verschlüsselte Sicherung erstellen und anschließend im Ausbildungsbereich die Ergänzung einrichten.');
    if($uri==='/api/ausbildung/unterricht'&&$method==='GET'){
        $leitung=ausbildungVerwaltungsleitung($u);
        $rows=sql("SELECT i.id,i.modul_code,m.titel,i.erstellt,i.ablauf,
                    COALESCE(NULLIF(TRIM(ersteller.anzeigename),''),'Unbekannter Ausbilder') AS erstellt_von,
                    CASE WHEN i.teilnehmer_hash IS NOT NULL THEN 1 ELSE 0 END AS teilnehmer,
                    CASE WHEN i.beendet=0 AND i.ablauf>UTC_TIMESTAMP() THEN 1 ELSE 0 END AS aktiv
                FROM ausbildung_unterricht i
                JOIN ausbildung_materialien m ON m.id=i.material_id
                LEFT JOIN users ersteller ON ersteller.id=i.ausbilder_user_id
                WHERE i.ausbilder_user_id=? AND i.beendet=0 AND i.ablauf>UTC_TIMESTAMP()
                ORDER BY i.erstellt DESC LIMIT 40",[(int)$u['id']]);
        foreach($rows as &$row){
            $row['zuordnung']=unterrichtZuordnung($row);
            if(!$leitung){unset($row['erstellt_von'],$row['erstellt']);}
        }unset($row);
        $history=$leitung?sql("SELECT l.id,l.zeit,l.aktion,COALESCE(NULLIF(u.anzeigename,''),IF(l.user_id IS NULL,'System / Einladungslink','Unbekannt')) AS benutzer
            FROM log l LEFT JOIN users u ON u.id=l.user_id
            WHERE l.aktion LIKE 'Unterricht für % gestartet; Sitzungs-ID %' OR l.aktion LIKE 'Unterrichtssitzung %'
            ORDER BY l.zeit DESC,l.id DESC LIMIT 500"):[];
        respond(200,['raeume'=>$rows,'protokollErlaubt'=>$leitung,'raumProtokoll'=>$history,'teilnehmerAuswahl'=>unterrichtTeilnehmerListe($u)]);
    }
    if($uri==='/api/ausbildung/unterricht'&&$method==='POST'){
        $input=body();
        $code=$input['modul_code']??null;$materialId=$input['material_id']??null;
        if(!is_string($code)||!preg_match('/^(?:(?:PM|PK)\.[0-9]+|WB)$/D',$code)
            ||!is_int($materialId)||$materialId<1)
            fail(400,'Gültiges Ausbildungsmodul und Präsentation erforderlich');
        ausbildungDarfModul($u,$code);
        $material=sql("SELECT id,url,titel FROM ausbildung_materialien
            WHERE id=? AND modul_code=? AND aktiv=1 AND url LIKE 'https://docs.google.com/presentation/%'
            LIMIT 1",[$materialId,$code]);
        if(!$material)fail(409,'Für dieses Modul ist keine Google-Präsentation verknüpft');
        $participantKey=$input['teilnehmer']??null;$participant=null;
        if(is_string($participantKey))foreach(unterrichtTeilnehmerListe($u) as $candidate)
            if($candidate['key']===$participantKey&&unterrichtTeilnehmerPasst($code,$candidate['laufbahn'])){$participant=$candidate;break;}
        if(!$participant)fail(400,'Bitte einen gültigen Teilnehmer aus dem Personalstamm für dieses Modul auswählen.');
        $snapshot='Teilnehmer: DN '.$participant['dn'].' · '.$participant['name'].'; Thema: '.$material[0]['titel'];
        $token=bin2hex(random_bytes(32));$pdo=db();$pdo->beginTransaction();
        try{
        sql('INSERT INTO ausbildung_unterricht
            (modul_code,material_id,ausbilder_user_id,einladung_hash,ablauf)
            VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 HOUR))',
            [$code,$materialId,(int)$u['id'],hash('sha256',$token)]);
        $id=(int)db()->lastInsertId();
        unterrichtLog((int)$u['id'],unterrichtLogPrefix(['id'=>$id,'modul_code'=>$code]).$snapshot,'add');
        $pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        respond(201,['id'=>$id,'einladung'=>'/unterricht.html#'.$token,'zuordnung'=>$snapshot,
            'modul_code'=>$code,'titel'=>$material[0]['titel'],'url'=>$material[0]['url']]);
    }
    if(!preg_match('#^/api/ausbildung/unterricht/([1-9][0-9]*)/(status|angebot|beenden|details)$#D',$uri,$m))
        fail(404,'Unterrichtssitzung nicht gefunden');
    $id=(int)$m[1];$action=$m[2];
    $room=unterrichtRaum($id,(int)$u['id']);
    if($action==='beenden'&&$method==='POST'){
        $pdo=db();$pdo->beginTransaction();
        try{
            $room=sql('SELECT * FROM ausbildung_unterricht WHERE id=? AND ausbilder_user_id=? FOR UPDATE',[$id,(int)$u['id']])[0];
            if((int)$room['beendet']===0){
                sql('UPDATE ausbildung_unterricht SET beendet=1,angebot=NULL,antwort=NULL,
                     aktualisiert=UTC_TIMESTAMP(6) WHERE id=? AND ausbilder_user_id=?',[$id,(int)$u['id']]);
                unterrichtLog((int)$u['id'],'Unterrichtssitzung '.$id.' beendet; '.unterrichtZuordnung($room).'; '.($room['teilnehmer_hash']!==null?'Einladungsplatz belegt':'Kein Beitritt erfasst'));
            }
            $pdo->commit();
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        respond(200,['ok'=>true]);
    }
    unterrichtAktiv($room);
    if($action==='details'&&$method==='GET'){
        $material=sql('SELECT titel,url FROM ausbildung_materialien WHERE id=? AND aktiv=1 LIMIT 1',
            [$room['material_id']]);
        if(!$material)fail(404,'Präsentation nicht mehr vorhanden');
        respond(200,['modul_code'=>$room['modul_code'],
            'titel'=>$material[0]['titel'],'url'=>$material[0]['url']]);
    }
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
