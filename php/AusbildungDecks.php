<?php
declare(strict_types=1);
namespace IDV;

/**
 * Einmalige, additive Zuordnung der in der hochgeladenen AUSBILDER-ZIP enthaltenen
 * PM-/PK-Präsentationen zu den bereits existierenden nativen Google-Slides-Dateien.
 * Die Google-IDs wurden mit Drive abgeglichen; es wird kein ZIP auf dem Hoster
 * benötigt und niemals die Freigabe einer bereits hinterlegten Unterlage geändert.
 *
 * Zusätzliche in der ZIP vorkommende Schulungen sind als "Weiterbildung" gelistet.
 * Entwürfe/Blankovorlagen und Prüfungen werden bewusst nicht veröffentlicht.
 */
function ausbildungZipDecks(): array {
    return [
        ['PM.0','PM.0 – Onboarding (EXTERN)','1qwrE5Irm08rV1iymltkkKwPJ496vlT_-BKP7z4oHTb8'],
        ['PM.1','PM.1 – Funkwesen, Funkstatus & Einsatztablet','1jZi3VDJLnL-R2NcneUvj8xQSR8HavLLw3gTS5nb_Nbo'],
        ['PM.2','PM.2 – CopNet & EDV (EXTERN)','1Gxrw6gMwoo6pyXK9PPTfhH9gxUsNYbdz8PX_KEEsZ1I'],
        ['PM.3','PM.3 – Verkehrskontrolle (EXTERN)','1CJNBXLwkx5vtxpAZ0Vnt4kWoV0AbkKtpwWrKvOUeakY'],
        ['PM.4','PM.4 – Verfolgungsfahrt (EXTERN)','1kz-9LUMco9ikU_k-R4dM7z6YUmNXubz5G-b51Dm28XE'],
        ['PM.5','PM.5 – Einsatzstellen (EXTERN)','1eH9KMPM5SX7nsSQuELRINk5FRoRx9JdzM2YNk_SbAkk'],
        ['PM.6','PM.6 – ED-Behandlung (EXTERN)','1IcTGAfdNhIJotuutEVi9sN7dBkqF1-d9tHV0UopjSgs'],
        ['PK.1','PK.1 – Grundlagen Einsatztaktik','1hlRUaH728eTF1_VxiiFivbrq-OwluKye9p4aEsjInLQ'],
        ['PK.2','PK.2 – Einsatzleitung','1pxnnkPYUp7CHhtC-P16o5Wg5Nd6ID6kbFa-_drmn9NY'],
        ['PK.3','PK.3 – Verhandlungsführung','18Cup0TsHA_oL9eLdd0Rsw_vxDD040RfYp5DJpGlOjRU'],
        ['PK.4','PK.4 – Best Practice DGL','1tnrHHe9wJgedbS25E3ZEl_sEsjGn07JsRCrDS08fr9c'],
        [null,'Weiterbildung – Kradstaffel','1dc3nVs8uHk7KFnzqJosAur0FN0g1KwSHSVz9m9CFD5A'],
        [null,'Weiterbildung – Langwaffen','1NxuqaZnddimtJKp83r-vyZwxKB3fHVGEeisttklf2O8'],
        [null,'Weiterbildung – Taucher / Wasserschutzpolizei','1KnlKoGzRI12J2J6ltGndiBa2CS5JEU1CtXLM8t-zF0s'],
        [null,'Zusatzwissen – StPO & polizeiliches Handeln','1Z8NLENX5VyJnQVTbUgLLWqPvu8AnLpvQ0Yrl-IcrVcc'],
    ];
}

/**
 * Wird ausschließlich beim Laden des Ausbildungsbereichs durch eine Leitung
 * ausgeführt. Überschreibt keine Daten, erstellt keine neuen Google-Dateien,
 * gibt nichts öffentlich frei. 16 feste, geprüfte Google-IDs.
 */
function ausbildungSeedZipDecks(array $u): int {
    if(!ausbildungLeitung($u))return 0;
    $count=0;
    foreach(ausbildungZipDecks() as [$code,$title,$driveId]){
        $url='https://docs.google.com/presentation/d/'.$driveId.'/edit';
        $prefix='https://docs.google.com/presentation/d/'.$driveId.'/';
        if(sql('SELECT id FROM ausbildung_materialien
            WHERE LEFT(url,CHAR_LENGTH(?))=? LIMIT 1',[$prefix,$prefix]))continue;
        // Bei gleichzeitigem Laden doppeltes Einfügen durch Datenbank-Lock vermeiden.
        $cursor=sql("SELECT GET_LOCK('idv_decks_".substr(hash('sha256',$driveId),0,24)."',3) AS ok");
        if((int)($cursor[0]['ok']??0)!==1)continue;
        try{
            if(sql('SELECT id FROM ausbildung_materialien
                WHERE LEFT(url,CHAR_LENGTH(?))=? LIMIT 1',[$prefix,$prefix]))continue;
            sql('INSERT INTO ausbildung_materialien
                (modul_code,titel,typ,url,public_aktiv,aktiv) VALUES(?,?,?,?,0,1)',
                [$code,$title,$code===null?'Weiterbildung':'Präsentation',$url]);
            $count++;
        }finally{
            sql("SELECT RELEASE_LOCK('idv_decks_".substr(hash('sha256',$driveId),0,24)."')");
        }
    }
    if($count>0)auditAction($u,'Präsentationslinks aus AuLK ZIP automatisch ergänzt: '.$count.' neue private Verweise','add');
    return $count;
}
