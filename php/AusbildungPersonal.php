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
function ausbildungPersonalQuelleGueltig(array $a): bool {
    $source=(string)($a['personal_quelle']??'');
    if($source===''||!isset($a['personalnummer']))return false;
    $rows=sql("SELECT p.dienstgrad,p.status,p.administrativ_geloescht_am,
            COALESCE((SELECT COUNT(*) FROM personalnummer_neubelegungen h
                     WHERE h.personalnummer=p.personalnummer),0) AS belegungen
        FROM personal p WHERE p.personalnummer=? LIMIT 1",[(int)$a['personalnummer']]);
    if(!$rows)return false;
    $p=$rows[0];
    return $p['administrativ_geloescht_am']===null
        &&in_array($p['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true)
        &&ausbildungPersonalQuelle((int)$a['personalnummer'],(int)$p['belegungen'])===$source
        &&ausbildungPersonalLaufbahn((string)$p['dienstgrad'])===(string)$a['laufbahn'];
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
            $rsa=(int)($p['rsa']??0);
            $matched=sql('SELECT id,name,laufbahn,personalnummer FROM ausbildung_anwaerter WHERE personal_quelle=? LIMIT 1',[$quelle]);
            if($matched) {
                sql('UPDATE ausbildung_anwaerter SET name=?,laufbahn=?,nebenberuf=?,beginn=?,rsa=?,
                    revision=IF(name<>? OR laufbahn<>? OR nebenberuf<>? OR NOT(beginn <=> ?) OR rsa<>?,revision+1,revision)
                    WHERE id=?',
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
