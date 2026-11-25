<?php
declare(strict_types=1);
namespace IDV;

/** Der Dienstgrad im PERSONAL-Stamm ist die einzige Quelle für die Laufbahn. */
function ausbildungPersonalLaufbahn(string $dienstgrad): ?string {
    $r=strtolower(trim(strtr($dienstgrad,['Ä'=>'Ae','Ö'=>'Oe','Ü'=>'Ue','ä'=>'ae','ö'=>'oe','ü'=>'ue','ß'=>'ss'])));
    $r=preg_replace('/[^a-z]+/','',$r)??'';
    return match(true) {
        $r==='pma' || str_contains($r,'polizeimeisteranwaerter') => 'PMA',
        $r==='pka' || str_contains($r,'polizeikommissaranwaerter') => 'PKA',
        $r==='kka' || str_contains($r,'kriminalkommissaranwaerter') => 'KKA',
        default => null
    };
}
/** Vergibt selbst bei wiederverwendeten Dienstnummern einen anderen Schlüssel. */
function ausbildungPersonalQuelle(int $nummer,int $belegungen): string {
    return 'personal:'.$nummer.':'.$belegungen;
}
/** Quelle: lebende Personaldatensätze, nicht separat erfasste Ausbildungspersonen. */
function ausbildungPersonalZeilen(): array {
    return sql("SELECT p.personalnummer,p.vorname,p.nachname,p.dienstgrad,p.eintrittsdatum,
            p.beschaeftigungsart,p.status,p.rsa,
            COALESCE(h.anzahl,0) AS belegungen
        FROM personal p
        LEFT JOIN (SELECT personalnummer,COUNT(*) AS anzahl
                   FROM personalnummer_neubelegungen GROUP BY personalnummer) h
          ON h.personalnummer=p.personalnummer
        WHERE p.administrativ_geloescht_am IS NULL
          AND p.status IN ('Aktiv','Abgemeldet','Inaktiv','Suspendiert')
        ORDER BY p.personalnummer");
}
/** Personal uses text ('Erhalten'/'Offen'), training uses a boolean mirror. */
function ausbildungRsaErhalten($wert): bool {
    return in_array(strtolower(trim((string)$wert)),['erhalten','1','ja','true'],true);
}
function ausbildungPersonalQuelleLesen(array $a,bool $lock=false): ?array {
    $source=(string)($a['personal_quelle']??'');
    if($source===''||!isset($a['personalnummer']))return null;
    $rows=sql("SELECT p.dienstgrad,p.status,p.rsa,p.administrativ_geloescht_am,
            COALESCE((SELECT COUNT(*) FROM personalnummer_neubelegungen h
                     WHERE h.personalnummer=p.personalnummer),0) AS belegungen
        FROM personal p WHERE p.personalnummer=? LIMIT 1".($lock?' FOR UPDATE':''),[(int)$a['personalnummer']]);
    if(!$rows)return null;
    $p=$rows[0];
    $valid=$p['administrativ_geloescht_am']===null
        &&in_array($p['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true)
        &&ausbildungPersonalQuelle((int)$a['personalnummer'],(int)$p['belegungen'])===$source
        &&ausbildungPersonalLaufbahn((string)$p['dienstgrad'])===(string)$a['laufbahn'];
    return $valid?$p:null;
}
function ausbildungPersonalQuelleGueltig(array $a): bool {
    return ausbildungPersonalQuelleLesen($a)!==null;
}
/**
 * Synchronisiert automatisch beim Öffnen der Monitore.
 * Nie DELETE, keine Übertragung interner Bewertungen an die Personalverwaltung.
 * Altdatensätze werden nur bei eindeutig identischer Person übernommen.
 * GET_LOCK + UNIQUE(personal_quelle) verhindern doppelte Datensätze.
 */
function ausbildungSynchronisierePersonal(): array {
    $lock=sql("SELECT GET_LOCK('idv_ausbildung_personal_sync',5) AS ok");
    if((int)($lock[0]['ok']??0)!==1)
        fail(503,'Personalabgleich läuft bereits, bitte erneut laden');
    $created=0;$updated=0;$linked=0;
    try {
        db()->beginTransaction();
        $rows=ausbildungPersonalZeilen();
        foreach($rows as $p) {
            $laufbahn=ausbildungPersonalLaufbahn((string)$p['dienstgrad']);
            if($laufbahn===null)continue;
            $nummer=(int)$p['personalnummer'];
            $quelle=ausbildungPersonalQuelle($nummer,(int)$p['belegungen']);
            $name=trim((string)$p['vorname'].' '.(string)$p['nachname']);
            $beginn=$p['eintrittsdatum']??null;
            $neben=(string)($p['beschaeftigungsart']??'');
            $rsa=ausbildungRsaErhalten($p['rsa']??null)?1:0;
            $matched=sql('SELECT id,name,laufbahn,personalnummer FROM ausbildung_anwaerter WHERE personal_quelle=? LIMIT 1',[$quelle]);
            if($matched) {
                sql('UPDATE ausbildung_anwaerter SET
                    revision=IF(name<>? OR laufbahn<>? OR nebenberuf<>? OR NOT(beginn <=> ?) OR rsa<>?,revision+1,revision),
                    name=?,laufbahn=?,nebenberuf=?,beginn=?,rsa=? WHERE id=?',
                    [$name,$laufbahn,$neben,$beginn,$rsa,$name,$laufbahn,$neben,$beginn,$rsa,$matched[0]['id']]);
                $updated++;
                continue;
            }
            // Verknüpft bestehende Ausbildungsakten nur nach exakt passender Identität
            // und ohne dokumentierte Neubelegung. Uneindeutige Altbestände bleiben unangetastet.
            $legacy=($p['belegungen']==0)?sql('SELECT id FROM ausbildung_anwaerter
                WHERE personal_quelle IS NULL AND personalnummer=? AND name=? AND laufbahn=?
                  AND (beginn IS NULL OR beginn <=> ?) ORDER BY id LIMIT 2',
                [$nummer,$name,$laufbahn,$beginn]):[];
            if(count($legacy)===1) {
                sql('UPDATE ausbildung_anwaerter SET personal_quelle=?,nebenberuf=?,beginn=?,rsa=? WHERE id=? AND personal_quelle IS NULL',
                    [$quelle,$neben,$beginn,$rsa,$legacy[0]['id']]);
                $linked++;
                continue;
            }
            sql('INSERT INTO ausbildung_anwaerter
                (personalnummer,personal_quelle,name,laufbahn,nebenberuf,beginn,rsa)
                VALUES(?,?,?,?,?,?,?)',[$nummer,$quelle,$name,$laufbahn,$neben,$beginn,$rsa]);
            $created++;
        }
        db()->commit();
    }catch(\Throwable $e) {
        if(db()->inTransaction())db()->rollBack();
        throw $e;
    }finally{
        sql("SELECT RELEASE_LOCK('idv_ausbildung_personal_sync')");
    }
    return ['neu'=>$created,'angepasst'=>$updated,'verknuepft'=>$linked];
}
/** Nach einem Personalabgleich werden nur noch aktuelle, gebundene Personen gelistet. */
function ausbildungAktuelleAnwaerter(): array {
    $people=ausbildungPersonalZeilen();
    $current=[];
    foreach($people as $p){
        if(ausbildungPersonalLaufbahn((string)$p['dienstgrad'])===null)continue;
        $current[ausbildungPersonalQuelle((int)$p['personalnummer'],(int)$p['belegungen'])]=true;
    }
    $rows=sql("SELECT * FROM ausbildung_anwaerter
         WHERE personal_quelle IS NOT NULL ORDER BY laufbahn,name,id");
    return array_values(array_filter($rows,
        static fn($row)=>isset($current[(string)$row['personal_quelle']])));
}

/**
 * Öffentliche AuLK-Monitore: die Anwärter-NAMEN und die explizit gewünschten
 * Modulstände und Gesamtpunkte. Keine Dienstnummern, Berichte, Ausbilderidentitäten,
 * Einzelstimmen, vertraulichen Notizen oder internen Datensatz-IDs.
 *
 * Für neu eingestellte Anwärter wird direkt aus dem Hauptpersonalstamm gelesen.
 * Ein eventuell noch nicht synchronisierter Ausbildungsdatensatz zeigt somit
 * alle Module als offen. Dieser öffentliche GET schreibt nichts in die Datenbank.
 */
function ausbildungOeffentlicheMonitore(): never {
    $schema=ausbildungSchemaStatus();
    if(!$schema['bereit'] || !$schema['personalbindungBereit'])
        fail(503,'Ausbildungsmonitore werden eingerichtet');

    $tracks=['PMA','PKA','KKA'];
    $required=[];
    $completed=[];
    $votes=[];
    $tracked=[];
    $output=[];
    foreach($tracks as $track){
        $required[$track]=ausbildungModule($track);
        $output[$track]=[
            'laufbahn'=>$track,'anzahl'=>0,
            'moduleProPerson'=>count($required[$track]),
            'moduleAbgeschlossen'=>0,
            'zurPruefungZugelassen'=>0,
            'fortschrittProzent'=>0,
            'personen'=>[]
        ];
    }

    // Nur aktive Anwärter aus der NORMALEN Personaltabelle bestimmen die Liste.
    // Nach einer Wiedervergabe der Dienstnummer ist der Schlüssel ein neuer.
    $people=ausbildungPersonalZeilen();
    foreach($people as $person){
        $track=ausbildungPersonalLaufbahn((string)$person['dienstgrad']);
        if(!isset($output[$track]))continue;
        $key=ausbildungPersonalQuelle((int)$person['personalnummer'],(int)$person['belegungen']);
        $tracked[$key]=[
            'laufbahn'=>$track,
            'rsa'=>ausbildungRsaErhalten($person['rsa']??null),
            'name'=>trim((string)$person['vorname'].' '.(string)$person['nachname'])
        ];
    }

    // Historische Daten bleiben archiviert, werden aber nur über einen
    // gültigen und aktuell zugewiesenen Personen-Identitätsschlüssel gelesen.
    $records=sql("SELECT id,personal_quelle,laufbahn FROM ausbildung_anwaerter
        WHERE personal_quelle IS NOT NULL");
    $activeIds=[];$dglRows=[];
    foreach($records as $record){
        $key=(string)$record['personal_quelle'];
        if(isset($tracked[$key]) && $tracked[$key]['laufbahn']===$record['laufbahn'])
            $activeIds[(int)$record['id']]=$key;
    }
    if($activeIds){
        if(ausbildungDglSchemaBereit())foreach(sql('SELECT anwaerter_id,dgl_am,assistenz_am,pruefung_am,punkte,prozent FROM ausbildung_dgl') as $row){
            $id=(int)$row['anwaerter_id'];
            if(isset($activeIds[$id]))$dglRows[$activeIds[$id]]=$row;
        }
        $moduleRows=sql("SELECT a.id,c.modul_code FROM ausbildung_abschluesse c
            JOIN ausbildung_anwaerter a ON a.id=c.anwaerter_id
            WHERE a.personal_quelle IS NOT NULL AND c.abgeschlossen=1");
        foreach($moduleRows as $row){
            $id=(int)$row['id'];
            if(isset($activeIds[$id]))$completed[$activeIds[$id]][(string)$row['modul_code']]=true;
        }

        // Keine individuellen Stimmabgaben in der öffentlichen Antwort.
        // Gewichtung entspricht der internen PMA-Abstimmung und wird aus
        // der aktuellen Ausbilderfunktion statt altem DB-Score abgeleitet.
        $voteRows=sql("SELECT a.id,s.stimme,s.gewicht AS gespeichert_gewicht,
                u.rolle,t.funktion
            FROM ausbildung_stimmen s
            JOIN ausbildung_anwaerter a ON a.id=s.anwaerter_id
            JOIN users u ON u.id=s.ausbilder_user_id
            LEFT JOIN ausbildung_ausbilder t ON t.user_id=s.ausbilder_user_id
            WHERE a.personal_quelle IS NOT NULL AND a.laufbahn='PMA'");
        foreach($voteRows as $row){
            $id=(int)$row['id'];
            if(!isset($activeIds[$id]))continue;
            $key=$activeIds[$id];
            $votes[$key][]=[
                'stimme'=>$row['stimme'],
                'gewicht'=>ausbildungStimmgewicht($row)
            ];
        }
    }

    foreach($tracked as $key=>$person){
        $track=$person['laufbahn'];
        $requiredCodes=array_column($required[$track],'code');
        $doneCodes=array_keys($completed[$key]??[]);
        $result=ausbildungStatus($track,$requiredCodes,$doneCodes,$votes[$key]??[],$person['rsa'],$dglRows[$key]??[]);
        $modulesFinished=$result['moduleGesamt']>0
            && $result['moduleFertig']===$result['moduleGesamt'];
        $admitted=$result['bereit'];

        $status=$admitted?'Zur Prüfung zugelassen':(!$modulesFinished?'Module ausstehend':
            ($track==='PMA'&&$person['rsa']?'Module abgeschlossen – Stimmen fehlen':$result['status']));

        $modules=[];
        foreach($required[$track] as $module){
            $modules[]=[
                'code'=>(string)$module['code'],
                'titel'=>(string)$module['titel'],
                'abgeschlossen'=>isset(($completed[$key]??[])[(string)$module['code']])
            ];
        }
        $entry=[
            'name'=>$person['name'],
            'status'=>$status,
            'moduleFertig'=>$result['moduleFertig'],
            'moduleGesamt'=>$result['moduleGesamt'],
            'moduleAbgeschlossen'=>$modulesFinished,
            'zurPruefungZugelassen'=>$admitted,
            'module'=>$modules
        ];
        if($track==='PMA'){
            // Öffentliche Ansicht: nur Anzahl der Stimmen. Punkte, Stimmeninhalt
            // und verantwortliche Ausbilder werden NIEMALS ausgegeben.
            $entry['stimmenAnzahl']=$result['stimmenJa']+$result['stimmenNein'];
            $entry['rsa']=$person['rsa'];
        }else $entry['dgl']=$result['dgl'];
        $output[$track]['personen'][]=$entry;
        $output[$track]['anzahl']++;
        $output[$track]['moduleAbgeschlossen']+=$result['moduleFertig'];
        if($admitted)$output[$track]['zurPruefungZugelassen']++;
    }

    foreach($tracks as $track){
        $data=&$output[$track];
        $denom=$data['anzahl']*$data['moduleProPerson'];
        $data['fortschrittProzent']=$denom>0
            ?round($data['moduleAbgeschlossen']/$denom*100):0;
        usort($data['personen'],static fn($a,$b)=>
            strcasecmp((string)$a['name'],(string)$b['name']));
        unset($data);
    }

    header('X-Robots-Tag: noindex, nofollow');
    respond(200,[
        'monitore'=>array_values($output),
        'aktualisiert'=>gmdate('c'),
        'hinweis'=>'Öffentlich: Namen, Modulstände, PMA-Stimmenanzahl und Zulassungsstatus; keine Punktzahlen, Dienstnummern oder Einzelstimmen.'
    ]);
}
