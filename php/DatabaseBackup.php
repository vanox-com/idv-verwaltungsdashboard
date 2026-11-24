<?php
declare(strict_types=1);
namespace IDV;

use PDO;
use ZipArchive;

/**
 * Private encrypted backup of all MySQL 8 InnoDB table rows and schema metadata.
 * Web restore only accepts a verified backup against an identical live schema:
 * this allows a transactional data restore without destructive DDL.
 * Files on the host are NOT included.
 */
const IDV_BACKUP_MAX_ZIP = 268435456;
const IDV_BACKUP_MAX_DATA = 1073741824;
const IDV_BACKUP_MAX_ROWS = 1000000;

function backupAdmin(array $user): void {
    needAdmin($user);
}
function backupDirectory(): string {
    $dir=(string)(getenv('IDV_BACKUP_DIRECTORY')?:dirname(__DIR__).'/private/database-backups');
    if(!str_starts_with($dir,DIRECTORY_SEPARATOR))fail(503,'Backup-Pfad muss absolut sein');
    if(!is_dir($dir)&&!@mkdir($dir,0700,true))fail(503,'Privates Backup-Verzeichnis nicht beschreibbar');
    $real=realpath($dir);
    if($real===false||is_link($dir))fail(503,'Unsicheres Backup-Verzeichnis');
    foreach([dirname(__DIR__).'/public',(string)($_SERVER['DOCUMENT_ROOT']??'')] as $public){
        if($public==='')continue;
        $root=realpath($public);
        if($root!==false&&($real===$root||str_starts_with($real,$root.DIRECTORY_SEPARATOR)))
            fail(503,'Backups dürfen nicht öffentlich zugänglich sein');
    }
    if(!is_writable($real))fail(503,'Privates Backup-Verzeichnis nicht beschreibbar');
    return $real;
}
function backupIdentifier(string $id): string {
    if(!preg_match('/^(?:idv|import|safety)_[0-9]{8}_[0-9]{6}_[a-f0-9]{20}$/D',$id))
        fail(400,'Ungültige Backup-Kennung');
    return $id;
}
function backupFile(string $id): string {
    return backupDirectory().'/'.backupIdentifier($id).'.zip';
}
function backupPassphrase($password): string {
    if(!is_string($password)||strlen($password)<14||strlen($password)>256)
        fail(400,'Backup-Passwort: mindestens 14 Zeichen erforderlich');
    return $password;
}
function backupEncryptedZipSupported(): void {
    if(!class_exists(ZipArchive::class)||!defined('ZipArchive::EM_AES_256')
       ||!method_exists(ZipArchive::class,'setEncryptionName'))
        fail(503,'PHP ZipArchive mit AES-256 ist auf dem Hoster erforderlich');
}
function backupIdentifierSql(string $name): string {
    if(!preg_match('/^[a-zA-Z0-9_]{1,64}$/D',$name))
        throw new \RuntimeException('Unsicherer MySQL-Bezeichner');
    return chr(96).$name.chr(96);
}
function backupDdl(string $sql): string {
    return trim((string)preg_replace('/\sAUTO_INCREMENT=\d+\b/i','',str_replace("\r\n","\n",$sql)));
}
/** Schema is recorded for verification, NEVER executed by in-panel restore. */
function backupSchema(): array {
    $tables=sql("SELECT TABLE_NAME AS name,ENGINE AS engine,TABLE_TYPE AS type
                 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME");
    $items=[];
    foreach($tables as $item){
        $name=(string)$item['name'];$quoted=backupIdentifierSql($name);
        if($item['type']==='VIEW'){
            $ddl=sql('SHOW CREATE VIEW '.$quoted);
            $items[$name]=['type'=>'VIEW','ddl'=>backupDdl((string)($ddl[0]['Create View']??''))];
            continue;
        }
        if($item['type']!=='BASE TABLE'||strcasecmp((string)$item['engine'],'InnoDB')!==0)
            throw new \RuntimeException('Nur InnoDB-Tabellen sind transaktional sicherbar: '.$name);
        $ddl=sql('SHOW CREATE TABLE '.$quoted);
        $columns=sql("SELECT COLUMN_NAME AS name,EXTRA AS extra
                      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
                      AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",[$name]);
        $columnNames=[];
        foreach($columns as $col){
            backupIdentifierSql((string)$col['name']);
            // MySQL generated columns are reconstructed deterministically
            // from their source columns on insert; they must not be assigned.
            if(preg_match('/(?:VIRTUAL|STORED)\s+GENERATED/i',(string)$col['extra']))
                continue;
            $columnNames[]=(string)$col['name'];
        }
        $items[$name]=['type'=>'BASE TABLE','ddl'=>backupDdl((string)($ddl[0]['Create Table']??'')),'columns'=>$columnNames];
    }
    $triggers=sql("SELECT TRIGGER_NAME AS name,EVENT_OBJECT_TABLE AS tab,
                         EVENT_MANIPULATION AS event_type,ACTION_TIMING AS timing,ACTION_STATEMENT AS body
                  FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME");
    $views=sql("SELECT TABLE_NAME AS name,VIEW_DEFINITION AS definition
                FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME");
    $routines=sql("SELECT ROUTINE_NAME AS name,ROUTINE_TYPE AS kind,ROUTINE_DEFINITION AS definition
                   FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()
                   ORDER BY ROUTINE_TYPE,ROUTINE_NAME");
    $events=sql("SELECT EVENT_NAME AS name,EVENT_DEFINITION AS definition
                 FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() ORDER BY EVENT_NAME");
    return ['tables'=>$items,'triggers'=>$triggers,'views'=>$views,'routines'=>$routines,'events'=>$events];
}
function backupSchemaHash(array $schema): string {
    return hash('sha256',json_encode($schema,JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE));
}
function backupNewId(string $type='idv'): string {
    return $type.'_'.gmdate('Ymd_His').'_'.bin2hex(random_bytes(10));
}
function backupTempDir(): string {
    $dir=backupDirectory().'/.work_'.bin2hex(random_bytes(10));
    if(!mkdir($dir,0700))throw new \RuntimeException('Backup-Arbeitsverzeichnis fehlgeschlagen');
    return $dir;
}
function backupRemoveTemp(string $dir): void {
    if(!is_dir($dir))return;
    foreach(new \DirectoryIterator($dir) as $file){
        if(!$file->isDot()&&$file->isFile()&&!$file->isLink())@unlink($file->getPathname());
    }
    @rmdir($dir);
}
function backupSaveIndex(array $metadata): void {
    $dir=backupDirectory();$id=backupIdentifier($metadata['id']);
    $tmp=tempnam($dir,'.backupmeta_');
    if($tmp===false)throw new \RuntimeException('Backupindex nicht verfügbar');
    @chmod($tmp,0600);
    $contents=json_encode($metadata,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
    if(file_put_contents($tmp,$contents,LOCK_EX)===false||!rename($tmp,$dir.'/'.$id.'.json')){
        @unlink($tmp);throw new \RuntimeException('Backupindex nicht gespeichert');
    }
    @chmod($dir.'/'.$id.'.json',0600);
}
function backupEncryptEntry(ZipArchive $zip,string $name,string $password): void {
    if(!$zip->setEncryptionName($name,ZipArchive::EM_AES_256,$password))
        throw new \RuntimeException('Backup kann nicht AES-256-verschlüsselt werden');
}
function backupCreate(string $password,string $label='Manuelle Sicherung',string $type='idv'): array {
    backupEncryptedZipSupported();
    if(strlen($label)>100||!in_array($type,['idv','safety'],true))
        fail(400,'Ungültige Sicherungsbezeichnung');
    @set_time_limit(300);
    $id=backupNewId($type);$path=backupFile($id);
    $work=backupTempDir();$tmpZip=$work.'/encrypted.zip';
    $pdo=db();$active=false;$zip=new ZipArchive();$zipOpened=false;
    try{
        $schema=backupSchema();$schemaHash=backupSchemaHash($schema);
        $tables=array_filter($schema['tables'],fn($v)=>$v['type']==='BASE TABLE');
        if(!$tables)throw new \RuntimeException('Keine MySQL-Tabellen vorhanden');
        $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');$active=true;
        if($zip->open($tmpZip,ZipArchive::CREATE|ZipArchive::EXCL)!==true)
            throw new \RuntimeException('Verschlüsseltes ZIP-Archiv nicht anlegbar');
        $zipOpened=true;
        $entries=[];$rowsTotal=0;$bytesTotal=0;
        foreach($tables as $name=>$info){
            $file=$work.'/'.$name.'.jsonl';
            $out=fopen($file,'wb');
            if($out===false)throw new \RuntimeException('Backup-Tabellendatei nicht beschreibbar');
            $count=0;$bytes=0;$digest=hash_init('sha256');
            try{
                $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,false);
                $quotedColumns=array_map(__NAMESPACE__.'\\backupIdentifierSql',$info['columns']);
                if(!$quotedColumns)throw new \RuntimeException('Tabelle ohne speicherbare Spalten');
                $statement=$pdo->query('SELECT '.implode(',',$quotedColumns).' FROM '.backupIdentifierSql($name));
                if($statement===false)throw new \RuntimeException('Tabellenabfrage fehlgeschlagen');
                while(($row=$statement->fetch(PDO::FETCH_NUM))!==false){
                    if(count($row)!==count($info['columns']))throw new \RuntimeException('Ungültige Tabellenspalten');
                    $encoded=array_map(fn($v)=>$v===null?null:base64_encode((string)$v),$row);
                    $line=json_encode($encoded,JSON_THROW_ON_ERROR)."\n";
                    if(strlen($line)>8*1024*1024||fwrite($out,$line)!==strlen($line))
                        throw new \RuntimeException('Backup-Datenzeile zu groß oder unvollständig');
                    $count++;$bytes+=strlen($line);$rowsTotal++;$bytesTotal+=strlen($line);
                    if($rowsTotal>IDV_BACKUP_MAX_ROWS||$bytesTotal>IDV_BACKUP_MAX_DATA)
                        throw new \RuntimeException('Backup übersteigt die erlaubte Größe dieses Hosters');
                    hash_update($digest,$line);
                }
                $statement->closeCursor();
            }finally{
                $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,true);
                fclose($out);
            }
            $entry='data/'.$name.'.jsonl';
            if(!$zip->addFile($file,$entry))throw new \RuntimeException('Backup-Tabelle nicht zum ZIP hinzugefügt');
            backupEncryptEntry($zip,$entry,$password);
            $entries[$name]=['file'=>$entry,'count'=>$count,'bytes'=>$bytes,'sha256'=>hash_final($digest)];
        }
        $pdo->commit();$active=false;
        if(backupSchemaHash(backupSchema())!==$schemaHash)
            throw new \RuntimeException('Schemaänderung während Sicherung – Archiv verworfen');
        $database=(string)$pdo->query('SELECT DATABASE()')->fetchColumn();
        $manifest=['format'=>'IDV_MYSQL8_BACKUP','version'=>1,'created'=>gmdate('c'),
            'database'=>$database,'schema'=>$schema,'schema_sha256'=>$schemaHash,'entries'=>$entries,
            'rows'=>$rowsTotal,'table_count'=>count($entries),'includes_files'=>false];
        if(!$zip->addFromString('manifest.json',json_encode($manifest,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE)))
            throw new \RuntimeException('Backup-Manifest nicht speicherbar');
        backupEncryptEntry($zip,'manifest.json',$password);
        if(!$zip->close())throw new \RuntimeException('ZIP-Verschlüsselung fehlgeschlagen');
        $zipOpened=false;
        if(filesize($tmpZip)>IDV_BACKUP_MAX_ZIP)throw new \RuntimeException('ZIP-Datei zu groß, Hoster-Backup nötig');
        if(!rename($tmpZip,$path))throw new \RuntimeException('Backup nicht dauerhaft speicherbar');
        @chmod($path,0600);
        $meta=['id'=>$id,'created'=>$manifest['created'],'label'=>$label,'database'=>$database,
            'size'=>(int)filesize($path),'table_count'=>count($entries),'rows'=>$rowsTotal,
            'sha256'=>hash_file('sha256',$path),'encrypted'=>true,'type'=>$type,'includes_files'=>false];
        backupSaveIndex($meta);
        return $meta;
    }catch(\Throwable $ex){
        if($active&&$pdo->inTransaction())$pdo->rollBack();
        if($zipOpened)@$zip->close();
        @unlink($path);@unlink($tmpZip);
        throw $ex;
    }finally{backupRemoveTemp($work);}
}
function backupList(): array {
    $out=[];$dir=backupDirectory();
    foreach(new \DirectoryIterator($dir) as $file){
        if(!$file->isFile()||$file->isLink()||!str_ends_with($file->getFilename(),'.json'))continue;
        $id=substr($file->getFilename(),0,-5);
        if(!preg_match('/^(?:idv|import|safety)_[0-9]{8}_[0-9]{6}_[a-f0-9]{20}$/D',$id))continue;
        $archive=backupFile($id);
        if(!is_file($archive)||is_link($archive))continue;
        $meta=json_decode((string)file_get_contents($file->getPathname()),true);
        if(!is_array($meta)||($meta['id']??'')!==$id)continue;
        $meta['size']=(int)filesize($archive);
        $out[]=$meta;
    }
    usort($out,fn($a,$b)=>strcmp((string)$b['created'],(string)$a['created']));
    return $out;
}
function backupOpen(string $id,string $passphrase): array {
    backupEncryptedZipSupported();
    $path=backupFile($id);
    if(!is_file($path)||is_link($path)||filesize($path)>IDV_BACKUP_MAX_ZIP)
        fail(404,'Backup nicht gefunden');
    $zip=new ZipArchive();
    if($zip->open($path,ZipArchive::RDONLY)!==true)fail(400,'Beschädigtes ZIP-Backup');
    $zip->setPassword($passphrase);
    $raw=$zip->getFromName('manifest.json');
    if(!is_string($raw)||strlen($raw)>2097152){$zip->close();fail(400,'Backup-Passwort falsch oder Manifest beschädigt');}
    try{$manifest=json_decode($raw,true,64,JSON_THROW_ON_ERROR);}
    catch(\Throwable $e){$zip->close();fail(400,'Beschädigtes Backup-Manifest');}
    if(!is_array($manifest)||($manifest['format']??'')!=='IDV_MYSQL8_BACKUP'
      ||($manifest['version']??null)!==1||!is_array($manifest['entries']??null)
      ||!is_array($manifest['schema']??null)){
        $zip->close();fail(400,'Kein unterstütztes IDV-Datenbankbackup');
    }
    return [$zip,$manifest,$path];
}
function backupVerify(string $id,string $password): array {
    @set_time_limit(300);
    [$zip,$m,$path]=backupOpen($id,$password);
    try{
        $database=(string)db()->query('SELECT DATABASE()')->fetchColumn();
        if(($m['database']??'')!==$database)fail(409,'Backup gehört zu einer anderen MySQL-Datenbank');
        if(!hash_equals(backupSchemaHash($m['schema']),(string)($m['schema_sha256']??'')))
            fail(400,'Beschädigte Schema-Prüfsumme');
        $tables=array_keys(array_filter($m['schema']['tables']??[],fn($x)=>is_array($x)&&($x['type']??'')==='BASE TABLE'));
        if(count($tables)!==count($m['entries'])||count($tables)!==(int)($m['table_count']??-1))
            fail(400,'Backup enthält nicht alle Tabellen');
        $totalRows=0;$totalBytes=0;
        foreach($tables as $table){
            backupIdentifierSql($table);
            $info=$m['entries'][$table]??null;
            if(!is_array($info)||($info['file']??'')!=='data/'.$table.'.jsonl'
                ||!preg_match('/^[a-f0-9]{64}$/D',(string)($info['sha256']??'')))
                fail(400,'Ungültiger Backup-Tabelleneintrag');
            $stream=$zip->getStream($info['file']);
            if(!is_resource($stream))fail(400,'Backup-Passwort falsch oder Daten beschädigt');
            $hash=hash_init('sha256');$rows=0;$bytes=0;
            try{
                while(($line=fgets($stream,8*1024*1024+1))!==false){
                    if(strlen($line)>8*1024*1024||!str_ends_with($line,"\n"))
                        fail(400,'Ungültige Backup-Datenzeile');
                    $values=json_decode($line,true);
                    if(!is_array($values)||!array_is_list($values)||
                        count($values)!==count($m['schema']['tables'][$table]['columns']??[]))
                        fail(400,'Ungültige Backup-Zeilenstruktur');
                    foreach($values as $v)if($v!==null&&(!is_string($v)||base64_decode($v,true)===false))
                        fail(400,'Beschädigter Backup-Datenwert');
                    $rows++;$bytes+=strlen($line);$totalRows++;$totalBytes+=strlen($line);
                    if($totalRows>IDV_BACKUP_MAX_ROWS||$totalBytes>IDV_BACKUP_MAX_DATA)
                        fail(413,'Backup-Inhalt überschreitet die Maximalgröße');
                    hash_update($hash,$line);
                }
            }finally{fclose($stream);}
            if($rows!==(int)($info['count']??-1)||$bytes!==(int)($info['bytes']??-1)||
               !hash_equals((string)$info['sha256'],hash_final($hash)))
                fail(400,'Tabellen-Prüfsumme oder Datensatzanzahl ungültig');
        }
        if($totalRows!==(int)($m['rows']??-1))fail(400,'Gesamtanzahl der Datensätze stimmt nicht');
        $current=backupSchemaHash(backupSchema());
        $identical=hash_equals($current,(string)$m['schema_sha256']);
        return ['id'=>$id,'valid'=>true,'created'=>(string)($m['created']??''),'database'=>$database,
            'tables'=>count($tables),'rows'=>$totalRows,'bytes'=>$totalBytes,
            'schema_identisch'=>$identical,'schema_aktuell'=>$current,
            'sha256'=>hash_file('sha256',$path),
            'hinweis'=>$identical?null:'Das Datenbankschema weicht ab. Eine Wiederherstellung im Panel ist nur bei identischer Tabellenstruktur möglich. Schema-Rollbacks müssen über den Hoster erfolgen.'];
    }finally{$zip->close();}
}
function backupApprove(int $user,array $check): string {
    $token=bin2hex(random_bytes(24));$path=backupDirectory().'/.preview_'.$token.'.json';
    $meta=['user'=>$user,'id'=>$check['id'],'sha256'=>$check['sha256'],
        'schema'=>$check['schema_aktuell'],'expires'=>time()+600];
    if(file_put_contents($path,json_encode($meta,JSON_THROW_ON_ERROR),LOCK_EX)===false)
        fail(503,'Wiederherstellungsfreigabe nicht gespeichert');
    @chmod($path,0600);
    return $token;
}
function backupApproved(string $token,int $user): array {
    if(!preg_match('/^[a-f0-9]{48}$/D',$token))fail(403,'Ungültige Freigabe');
    $file=backupDirectory().'/.preview_'.$token.'.json';
    if(!is_file($file)||is_link($file))fail(403,'Freigabe abgelaufen');
    $meta=json_decode((string)file_get_contents($file),true);
    if(!is_array($meta)||($meta['user']??null)!==$user||(int)($meta['expires']??0)<time())
        fail(403,'Freigabe abgelaufen');
    return $meta;
}
function backupRestore(string $id,string $passphrase,string $token,array $user,string $adminPassword): array {
    backupAdmin($user);
    $approved=backupApproved($token,(int)$user['id']);
    if(($approved['id']??'')!==$id)fail(403,'Falsche Wiederherstellungsfreigabe');
    $stored=sql('SELECT passwort_hash FROM users WHERE id=? AND gesperrt=0 LIMIT 1',[(int)$user['id']]);
    if(!$stored||!password_verify($adminPassword,(string)$stored[0]['passwort_hash']))
        fail(403,'Administratorpasswort falsch');
    $preview=backupVerify($id,$passphrase);
    if(!$preview['schema_identisch']||!hash_equals((string)$approved['schema'],$preview['schema_aktuell']))
        fail(409,'Abweichendes Datenbankschema: keine sichere Wiederherstellung möglich');
    if(!hash_equals((string)$approved['sha256'],$preview['sha256']))
        fail(409,'Sicherung wurde seit der Prüfung verändert');
    $pdo=db();
    $lock=sql("SELECT GET_LOCK('idv_backup_restore',3) AS acquired");
    if((int)($lock[0]['acquired']??0)!==1)fail(503,'Eine Wiederherstellung läuft bereits');
    $marker=backupDirectory().'/.restore_maintenance';
    $handle=@fopen($marker,'x');
    if($handle===false){
        sql("SELECT RELEASE_LOCK('idv_backup_restore')");
        fail(503,'Es läuft bereits eine Wiederherstellung');
    }
    @chmod($marker,0600);fwrite($handle,gmdate('c'));fclose($handle);
    @set_time_limit(300);
    $safety=null;$inTransaction=false;
    try{
        // Absolutely no database modification if the safety copy fails.
        $safety=backupCreate($passphrase,'Sicherung unmittelbar vor Wiederherstellung','safety');
        $recheck=backupVerify($id,$passphrase);
        if(!$recheck['schema_identisch'])fail(409,'Schema hat sich während der Wiederherstellung geändert');
        [$zip,$manifest]=backupOpen($id,$passphrase);
        try{
            $pdo->exec('SET @idv_migration=1');
            $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
            $pdo->exec('SET UNIQUE_CHECKS=0');
            $pdo->beginTransaction();$inTransaction=true;
            foreach(array_keys($manifest['entries']) as $table)
                $pdo->exec('DELETE FROM '.backupIdentifierSql($table));
            foreach($manifest['entries'] as $table=>$item){
                $columns=$manifest['schema']['tables'][$table]['columns'];
                $quoted=array_map(__NAMESPACE__.'\backupIdentifierSql',$columns);
                $query='INSERT INTO '.backupIdentifierSql($table).' ('.implode(',',$quoted).') VALUES ('
                    .implode(',',array_fill(0,count($columns),'?')).')';
                $statement=$pdo->prepare($query);
                $input=$zip->getStream($item['file']);
                if(!is_resource($input))throw new \RuntimeException('Backup beim Wiederherstellen nicht lesbar');
                $count=0;
                try{
                    while(($line=fgets($input,8*1024*1024+1))!==false){
                        $value=json_decode($line,true,64,JSON_THROW_ON_ERROR);
                        $decoded=array_map(fn($v)=>$v===null?null:base64_decode($v,true),$value);
                        $statement->execute($decoded);
                        $count++;
                    }
                }finally{fclose($input);}
                if($count!==(int)$item['count'])throw new \RuntimeException('Abweichende Tabellenzeilenzahl');
                if((int)$pdo->query('SELECT COUNT(*) FROM '.backupIdentifierSql($table))->fetchColumn()!==$count)
                    throw new \RuntimeException('Tabelle nicht vollständig wiederhergestellt');
            }
            if(array_key_exists('sessions',$manifest['entries']))$pdo->exec('DELETE FROM sessions');
            $pdo->commit();$inTransaction=false;
        }finally{$zip->close();}
        @unlink(backupDirectory().'/.preview_'.$token.'.json');
        error_log('[IDV Backup] Restore completed, safety archive '.$safety['id']);
        return ['ok'=>true,'safety_backup'=>$safety['id'],'session_beendet'=>true];
    }catch(\Throwable $error){
        if($inTransaction&&$pdo->inTransaction())$pdo->rollBack();
        error_log('[IDV Backup] Restore rolled back or aborted: '.$error::class);
        throw $error;
    }finally{
        try{$pdo->exec('SET FOREIGN_KEY_CHECKS=1');$pdo->exec('SET UNIQUE_CHECKS=1');
            $pdo->exec('SET @idv_migration=NULL');}catch(\Throwable $ignored){}
        @unlink($marker);
        try{sql("SELECT RELEASE_LOCK('idv_backup_restore')");}catch(\Throwable $ignored){}
    }
}
function dispatchDatabaseBackup(array $user,string $method,string $uri): bool {
    if(!str_starts_with($uri,'/api/backup/'))return false;
    backupAdmin($user);
    if($method==='GET'&&$uri==='/api/backup/liste')respond(200,['backups'=>backupList()]);
    if($method==='POST'&&$uri==='/api/backup/erstellen'){
        $body=body();$password=backupPassphrase($body['passwort']??null);
        if(!is_string($body['bezeichnung']??''))fail(400,'Ungültige Bezeichnung');
        $backup=backupCreate($password,trim((string)$body['bezeichnung']));
        auditAction($user,'Verschlüsseltes Datenbankbackup angelegt: '.$backup['id'],'add');
        respond(200,['backup'=>$backup]);
    }
    if($method==='GET'&&preg_match('#^/api/backup/([a-z0-9_]+)/download$#D',$uri,$m)){
        $id=backupIdentifier($m[1]);$file=backupFile($id);
        if(!is_file($file)||is_link($file))fail(404,'Backup nicht gefunden');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="'.$id.'.zip"');
        header('Content-Length: '.(string)filesize($file));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        $fp=fopen($file,'rb');
        if(!$fp)fail(503,'Backup nicht lesbar');
        fpassthru($fp);fclose($fp);exit;
    }
    if($method==='POST'&&preg_match('#^/api/backup/([a-z0-9_]+)/pruefen$#D',$uri,$m)){
        $body=body();$password=backupPassphrase($body['passwort']??null);
        $checked=backupVerify(backupIdentifier($m[1]),$password);
        if($checked['schema_identisch'])$checked['freigabe']=backupApprove((int)$user['id'],$checked);
        respond(200,['pruefung'=>$checked]);
    }
    if($method==='POST'&&$uri==='/api/backup/wiederherstellen'){
        $body=body();$id=backupIdentifier((string)($body['id']??''));
        $database=(string)db()->query('SELECT DATABASE()')->fetchColumn();
        if(($body['bestaetigung']??'')!=='WIEDERHERSTELLEN '.$database)
            fail(400,'Bitte den vollständigen Bestätigungssatz eingeben');
        if(!is_string($body['admin_passwort']??null))fail(400,'Administratorpasswort fehlt');
        $password=backupPassphrase($body['passwort']??null);
        respond(200,backupRestore($id,$password,(string)($body['freigabe']??''),$user,$body['admin_passwort']));
    }
    if($method==='POST'&&$uri==='/api/backup/upload'){
        $f=$_FILES['datei']??null;
        if(!is_array($f)||($f['error']??-1)!==UPLOAD_ERR_OK
            ||!is_uploaded_file((string)($f['tmp_name']??'')))fail(400,'Backup-Upload ungültig');
        $size=(int)($f['size']??0);
        if($size<1||$size>IDV_BACKUP_MAX_ZIP)fail(413,'Backup größer als 256 MiB');
        $id=backupNewId('import');$dest=backupFile($id);
        if(!move_uploaded_file((string)$f['tmp_name'],$dest))fail(503,'Backup konnte nicht privat gespeichert werden');
        @chmod($dest,0600);
        try{
            $zip=new ZipArchive();
            if($zip->open($dest,ZipArchive::RDONLY)!==true||$zip->locateName('manifest.json')===false)
                fail(400,'Ungültiges IDV-Backup-Archiv');
            $zip->close();
            $meta=['id'=>$id,'created'=>gmdate('c'),'label'=>'Hochgeladenes Backup','database'=>'Nach Prüfung',
                'size'=>(int)filesize($dest),'table_count'=>null,'rows'=>null,
                'sha256'=>hash_file('sha256',$dest),'encrypted'=>true,'type'=>'import','includes_files'=>false];
            backupSaveIndex($meta);
        }catch(\Throwable $e){@unlink($dest);throw $e;}
        auditAction($user,'Verschlüsseltes Backup zur Prüfung hochgeladen: '.$id,'add');
        respond(200,['backup'=>$meta]);
    }
    return false;
}