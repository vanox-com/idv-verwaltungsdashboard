<?php
declare(strict_types=1);
namespace IDV;

/**
 * Guarded, additive installation of the Ausbildung MySQL tables and AuLK public
 * release flag. Nothing runs on ordinary page loads or logins. The administrator
 * must explicitly confirm a backup before invoking this migration.
 */
function ausbildungSchemaStatus(): array {
    $required=[
        'ausbildung_ausbilder','ausbildung_anwaerter','ausbildung_module',
        'ausbildung_abschluesse','ausbildung_stimmen','ausbildung_materialien',
        'ausbildung_unterricht'
    ];
    $found=sql("SELECT TABLE_NAME AS name FROM information_schema.TABLES
                WHERE TABLE_SCHEMA=DATABASE()
                  AND TABLE_NAME IN ('ausbildung_ausbilder','ausbildung_anwaerter',
                  'ausbildung_module','ausbildung_abschluesse','ausbildung_stimmen','ausbildung_materialien',
                  'ausbildung_unterricht')");
    $have=array_column($found,'name');
    $missing=array_values(array_diff($required,$have));
    $column=false;
    if(in_array('ausbildung_materialien',$have,true)){
        $r=sql("SELECT COUNT(*) AS n FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_materialien'
                  AND COLUMN_NAME='public_aktiv'");
        $column=(int)($r[0]['n']??0)>0;
    }
    $moduleCount=0;
    if(in_array('ausbildung_module',$have,true)){
        $r=sql("SELECT COUNT(*) AS n FROM ausbildung_module WHERE aktiv=1");
        $moduleCount=(int)($r[0]['n']??0);
    }
    $roles=sql("SELECT name FROM roles WHERE name IN ('Ausbildungsleitung','Ausbilder')");
    $roleNames=array_column($roles,'name');
    $roomReady=in_array('ausbildung_unterricht',$have,true);
    $binding=sql("SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_anwaerter'
          AND COLUMN_NAME='personal_quelle'");
    $bindingIndex=sql("SELECT COUNT(*) AS n FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_anwaerter'
          AND INDEX_NAME='ausbildung_anwaerter_quelle_uq' AND NON_UNIQUE=0");
    $personalReady=(int)($binding[0]['n']??0)>0
        && (int)($bindingIndex[0]['n']??0)>0;
    $detailCols=sql("SELECT COUNT(DISTINCT COLUMN_NAME) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ausbildung_stimmen'
          AND COLUMN_NAME IN ('anlass','streifenfahrt_datum','bemerkung')");
    $votesReady=(int)($detailCols[0]['n']??0)===3;
    $criticalMissing=array_values(array_diff($missing,['ausbildung_unterricht']));
    $ready=$criticalMissing===[] && $column && $moduleCount>=11
        && in_array('Ausbildungsleitung',$roleNames,true)
        && in_array('Ausbilder',$roleNames,true);
    return [
        'bereit'=>$ready,
        'unterrichtBereit'=>$roomReady,
        'personalbindungBereit'=>$personalReady,
        'stimmenDetailsBereit'=>$votesReady,
        'fehlendeTabellen'=>$missing,
        'oeffentlicheFreigabeSpalte'=>$column,
        'ausbildungsmodule'=>$moduleCount,
        'fehlendeRollen'=>array_values(array_diff(['Ausbildungsleitung','Ausbilder'],$roleNames)),
    ];
}
function ausbildungMigrationsdatei(string $filename): array {
    if(!in_array($filename,['2026-11-24-ausbildung.sql','2026-11-24-aulk-public.sql','2026-11-24-ausbildung-unterricht.sql','2026-11-24-ausbildung-personal.sql','2026-11-24-ausbildung-vote-details.sql'],true))
        throw new \RuntimeException('Unbekannte Ausbildungsmigration');
    $path=dirname(__DIR__).'/scripts/mysql/'.$filename;
    if(!is_file($path)||!is_readable($path))
        throw new \RuntimeException('Ausbildungs-SQL-Datei fehlt auf dem Hoster');
    $file=file_get_contents($path);
    if(!is_string($file)||strlen($file)>100000)
        throw new \RuntimeException('Ausbildungs-SQL-Datei nicht lesbar');
    // Both tracked migrations contain standalone statements. No stored data,
    // credentials or user-provided SQL ever enter this parser.
    $lines=preg_split('/\r?\n/',$file);
    $filtered=[];
    foreach($lines as $line){
        if(preg_match('/^\s*(?:--|#)/',$line))continue;
        $filtered[]=$line;
    }
    $statements=[];
    foreach(explode(';',implode("\n",$filtered)) as $statement){
        $statement=trim($statement);
        if($statement==='')continue;
        if(!preg_match('/^(?:SET|INSERT|CREATE|ALTER|SELECT|PREPARE|EXECUTE|DEALLOCATE)\b/i',$statement))
            throw new \RuntimeException('Unzulässige Anweisung in Ausbildungs-SQL');
        $statements[]=$statement;
    }
    return $statements;
}
function ausbildungSetupAdmin(array $u): void {
    if(($u['rolle']??'')!=='Administrator')fail(403,'Nur Administratoren können die Ausbildungsdatenbank einrichten');
}
function dispatchAusbildungSetup(array $u,string $method,string $uri): bool {
    if(!in_array($uri,['/api/ausbildung/setup-status','/api/ausbildung/setup'],true))return false;
    ausbildungSetupAdmin($u);
    if($uri==='/api/ausbildung/setup-status'&&$method==='GET'){
        respond(200,ausbildungSchemaStatus());
    }
    if($uri==='/api/ausbildung/setup'&&$method==='POST'){
        $b=body();
        if(($b['bestaetigung']??null)!=='BACKUP_ERSTELLT_AUSBILDUNG')
            fail(400,'Vor der Einrichtung muss ein Datenbankbackup bestätigt werden');
        $schemaBefore=ausbildungSchemaStatus();
        if($schemaBefore['bereit'] && $schemaBefore['unterrichtBereit']
            && $schemaBefore['personalbindungBereit'] && $schemaBefore['stimmenDetailsBereit']){
            respond(200,['ok'=>true,'bereitsEingerichtet'=>true,'schema'=>ausbildungSchemaStatus()]);
        }
        // A verbal "I made a backup" is not enough. Require an actual
        // recently created encrypted IDV archive on the private backup disk
        // before changing the existing MySQL database schema.
        require_once __DIR__.'/DatabaseBackup.php';
        $dbName=(string)db()->query('SELECT DATABASE()')->fetchColumn();
        $hasSafetyBackup=false;
        foreach(backupList() as $entry){
            if(($entry['type']??'')!=='idv'||($entry['database']??'')!==$dbName
                ||!($entry['encrypted']??false))continue;
            $created=strtotime((string)($entry['created']??''));
            if($created===false||time()-$created>24*3600||$created>time()+300)continue;
            $path=backupFile((string)$entry['id']);
            if(is_file($path)&&hash_equals((string)($entry['sha256']??''),
                hash_file('sha256',$path))){$hasSafetyBackup=true;break;}
        }
        if(!$hasSafetyBackup)
            fail(428,'Vor der Einrichtung muss eine aktuelle verschlüsselte Datenbanksicherung '
                .'in Administration → Backup-Übersicht erstellt und sicher heruntergeladen werden. '
                .'Für Schema-Rollbacks zusätzlich ein vollständiges SQL-Backup beim Hoster anfertigen.');
        $pdo=db();
        $lock=sql("SELECT GET_LOCK('idv_ausbildung_schema_v1',10) AS ok");
        if((int)($lock[0]['ok']??0)!==1)fail(503,'Ausbildungsdatenbank wird bereits eingerichtet');
        $migrationError=null;
        try {
            // MySQL DDL implicitly commits. Both checked-in scripts are additive
            // and idempotent so a partially completed install can be retried.
            foreach(['2026-11-24-ausbildung.sql','2026-11-24-aulk-public.sql','2026-11-24-ausbildung-unterricht.sql','2026-11-24-ausbildung-personal.sql','2026-11-24-ausbildung-vote-details.sql'] as $file){
                foreach(ausbildungMigrationsdatei($file) as $step=>$statement){
                    try{
                        // EXECUTE aulk_stmt can return a SELECT result for an
                        // already-existing column. Always close every cursor before
                        // the next statement to avoid MySQL HY000/2014.
                        $cursor=$pdo->query($statement);
                        if($cursor instanceof \PDOStatement)$cursor->closeCursor();
                    }
                    catch(\PDOException $ex){
                        // Server-side diagnostic only: never expose SQL/credentials
                        // to the browser.
                        error_log('[IDV Ausbildung] SQL migration step '.
                            basename($file).' #'.($step+1).' MySQL='.
                            (string)($ex->errorInfo[1]??'unknown'));
                        throw $ex;
                    }
                }
            }
            $status=ausbildungSchemaStatus();
            if(!$status['bereit']||!$status['unterrichtBereit']||!$status['personalbindungBereit']||!$status['stimmenDetailsBereit'])throw new \RuntimeException('Schema nach Einrichtung unvollständig');
            auditAction($u,'Ausbildungsdatenbank additiv eingerichtet','add');
        }catch(\Throwable $error){
            $migrationError=$error;
            error_log('[IDV Ausbildung] Einrichtung fehlgeschlagen: '.$error::class.
                ' in '.basename($error->getFile()).':'.$error->getLine());
        }finally{
            sql("SELECT RELEASE_LOCK('idv_ausbildung_schema_v1')");
        }
        if($migrationError!==null)
            fail(503,'Die Ausbildungsdatenbank konnte nicht vollständig eingerichtet werden. '
                .'Der Datenbanknutzer benötigt CREATE/ALTER-Berechtigung; alternativ beide SQL-Skripte '
                .'nach Backup über phpMyAdmin einspielen.');
        respond(200,['ok'=>true,'schema'=>$status]);
    }
    fail(405,'Methode nicht erlaubt');
}