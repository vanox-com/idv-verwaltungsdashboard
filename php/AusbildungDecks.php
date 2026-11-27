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
        ['WB','Weiterbildung – Kradstaffel','1dc3nVs8uHk7KFnzqJosAur0FN0g1KwSHSVz9m9CFD5A'],
        ['WB','Weiterbildung – Langwaffen','1NxuqaZnddimtJKp83r-vyZwxKB3fHVGEeisttklf2O8'],
        ['WB','Zusatzwissen – StPO & polizeiliches Handeln','1Z8NLENX5VyJnQVTbUgLLWqPvu8AnLpvQ0Yrl-IcrVcc'],
    ];
}

/** Targeted, one-time replacement/addition; don't restore removed links on subsequent page loads. */
function ausbildungFortbildungsDecks(): array {
    return [
        ['Weiterbildung – Taucher / Wasserschutzpolizei','10N4qSdER6y7qLKGPlDf4qFQI7fDi1lc8eWIBvgYC75U','1KnlKoGzRI12J2J6ltGndiBa2CS5JEU1CtXLM8t-zF0s','/wasserschutz|taucher|\\bwapo\\b/iu'],
        ['Weiterbildung – Fliegerstaffel','1OF_AHUD5lPD2yxlUCTuBv-Qja7Pbz_2MNqujqOTkISM','','/fliegerstaffel/iu'],
        ['Weiterbildung – Autobahnpolizei','1AqXgOrLXX7dogqjQEbS10qaqdEyglpno60WQ00a6a_I','','/autobahnpolizei/iu'],
    ];
}
function ausbildungDeckId(string $url): string {
    return preg_match('#^https://docs\\.google\\.com/presentation/d/([A-Za-z0-9_-]+)(?:/|$)#D',$url,$m)?$m[1]:'';
}
function ausbildungSeedZipDecks(array $u): int {
    if(!ausbildungLeitung($u))return 0;
    $marker='ausbildung_decks_v20261127';
    $done=sql('SELECT werte FROM system_optionen WHERE schluessel=?',[$marker]);
    if(json_decode((string)($done[0]['werte']??''),true)===[true])return 0;
    $count=0;$changed=0;
    db()->beginTransaction();
    try{
        // A persistent marker prevents automatic seeds from undoing later manual edits.
        sql('INSERT IGNORE INTO system_optionen(schluessel,werte) VALUES(?,?)',[$marker,'[false]']);
        $m=sql('SELECT werte FROM system_optionen WHERE schluessel=? FOR UPDATE',[$marker]);
        if(json_decode((string)($m[0]['werte']??''),true)===[true]){db()->commit();return 0;}
        foreach(ausbildungZipDecks() as [$code,$title,$driveId]){
            $url='https://docs.google.com/presentation/d/'.$driveId.'/edit';
            $prefix='https://docs.google.com/presentation/d/'.$driveId.'/';
            if(sql('SELECT id FROM ausbildung_materialien WHERE LEFT(url,CHAR_LENGTH(?))=? OR (modul_code=? AND titel=?) LIMIT 1',[$prefix,$prefix,$code,$title]))continue;
            sql('INSERT INTO ausbildung_materialien(modul_code,titel,typ,url,public_aktiv,aktiv) VALUES(?,?,?,?,0,1)',
                [$code,$title,$code==='WB'?'Weiterbildung':'Präsentation',$url]);
            $count++;
        }
        foreach(ausbildungFortbildungsDecks() as [$title,$driveId,$oldId,$pattern]){
            $url='https://docs.google.com/presentation/d/'.$driveId.'/edit';
            $rows=sql("SELECT id,modul_code,titel,url,aktiv FROM ausbildung_materialien
                WHERE dateipfad IS NULL AND (modul_code='WB' OR typ='Weiterbildung' OR modul_code IS NULL)
                ORDER BY aktiv DESC,id FOR UPDATE");
            $exact=[];$old=[];$named=[];
            foreach($rows as $r){
                $id=ausbildungDeckId((string)$r['url']);
                if($id===$driveId)$exact[]=$r;
                elseif($oldId!==''&&$id===$oldId)$old[]=$r;
                elseif($id!==''&&preg_match($pattern,(string)$r['titel']))$named[]=$r;
            }
            $active=fn($r)=>(int)$r['aktiv']===1;
            // Keep the existing record and historical room references wherever possible.
            $candidate=array_values(array_filter($exact,$active))[0]??array_values(array_filter($old,$active))[0]??array_values(array_filter($named,$active))[0]??$exact[0]??null;
            if($candidate){
                if(ausbildungDeckId((string)$candidate['url'])!==$driveId||(int)$candidate['aktiv']!==1||$candidate['modul_code']!=='WB'){
                    sql("UPDATE ausbildung_materialien SET modul_code='WB',url=?,aktiv=1,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?",[$url,$candidate['id']]);
                    $changed++;
                }
                // Only retire the precisely identified obsolete WaPo link, not other materials.
                foreach($old as $r)if((int)$r['aktiv']===1&&(int)$r['id']!==(int)$candidate['id']){
                    sql('UPDATE ausbildung_materialien SET aktiv=0,public_aktiv=0,aktualisiert=UTC_TIMESTAMP(6) WHERE id=?',[$r['id']]);$changed++;
                }
            }else{
                sql("INSERT INTO ausbildung_materialien(modul_code,titel,typ,url,public_aktiv,aktiv) VALUES('WB',?,'Weiterbildung',?,0,1)",[$title,$url]);$count++;
            }
        }
        sql('UPDATE system_optionen SET werte=?,aktualisiert=UTC_TIMESTAMP(6) WHERE schluessel=?',['[true]',$marker]);
        if($count||$changed)auditAction($u,'AuLK-Fortbildungen aktualisiert: '.$count.' neue, '.$changed.' geänderte Verweise','edit');
        db()->commit();
    }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
    return $count+$changed;
}
