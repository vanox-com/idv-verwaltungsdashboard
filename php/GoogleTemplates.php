<?php
declare(strict_types=1);
namespace IDV;

/**
 * Private copies of the original Google Docs templates, exported once to DOCX.
 * Never put these files in the public GitHub repository or Apache DocumentRoot.
 * The end user's OAuth token is used ONLY to create a new Google Drive file.
 */
const IDV_TEMPLATE_KEYS = [
    'abmahnung','fristgerecht','fristlos','hauptvertrag','pmavertrag',
    'nebenvertrag','praktikum','praktikumsbestaetigung','nebenjob','urkunde'
];
const IDV_MAX_TEMPLATE_BYTES = 8000000;
const IDV_MAX_TEMPLATE_PACK_BYTES = 20000000;

function idvTemplateDirectory(): string {
    $override=trim((string)(getenv('IDV_TEMPLATE_DIR')?:''));
    $dir=$override!==''?$override:dirname(__DIR__).'/private/google-templates';
    if(!str_starts_with($dir,'/'))throw new \RuntimeException('IDV_TEMPLATE_DIR muss ein absoluter privater Pfad sein');
    return rtrim($dir,'/');
}
function idvTemplatePath(string $key): string {
    if(!in_array($key,IDV_TEMPLATE_KEYS,true))fail(400,'Unbekannte Dokumentvorlage');
    return idvTemplateDirectory().'/'.$key.'.docx';
}
function idvDocxValid(string $path): bool {
    if(!is_file($path)||is_link($path))return false;
    $size=filesize($path);
    if($size===false||$size<1000||$size>IDV_MAX_TEMPLATE_BYTES)return false;
    if(!class_exists(\ZipArchive::class))return false;
    $zip=new \ZipArchive();
    if($zip->open($path)!==true)return false;
    try{
        foreach(['[Content_Types].xml','word/document.xml'] as $name){
            $entry=$zip->statName($name);
            if(!$entry||($entry['size']??0)<10||($entry['size']??0)>2000000)return false;
        }
        return true;
    } finally {$zip->close();}
}
function idvTemplateStatus(): array {
    $status=[];
    foreach(IDV_TEMPLATE_KEYS as $key)$status[$key]=idvDocxValid(idvTemplatePath($key));
    return $status;
}
function idvTemplatesReady(): bool {
    foreach(IDV_TEMPLATE_KEYS as $key)
        if(!idvDocxValid(idvTemplatePath($key)))return false;
    return true;
}
function idvTemplateBytes(string $key): string {
    $path=idvTemplatePath($key);
    if(!idvDocxValid($path))
        fail(503,'Originalvorlage fehlt. Administrator: privates Vorlagenpaket unter /vorlagen.html importieren.');
    $bytes=file_get_contents($path);
    if($bytes===false)fail(503,'Originalvorlage ist momentan nicht lesbar');
    return $bytes;
}
/** Validate and install a 10-template package; never extract arbitrary ZIP paths. */
function idvInstallTemplatePack(string $archivePath): void {
    if(!class_exists(\ZipArchive::class))fail(503,'ZIP-Erweiterung nicht aktiviert');
    if(!is_file($archivePath)||filesize($archivePath)>IDV_MAX_TEMPLATE_PACK_BYTES)
        fail(413,'Vorlagenpaket fehlt oder ist zu groß');
    $archive=new \ZipArchive();
    if($archive->open($archivePath)!==true)fail(422,'Kein gültiges ZIP-Vorlagenpaket');
    $dir=idvTemplateDirectory();
    if(is_link($dir))fail(500,'Unsicheres Vorlagenverzeichnis');
    if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir))
        fail(503,'Privates Vorlagenverzeichnis nicht beschreibbar; Serverrechte prüfen');
    if(!is_writable($dir))fail(503,'Privates Vorlagenverzeichnis nicht beschreibbar');
    @chmod($dir,0700);
    $stage=$dir.'/.idv-import-'.bin2hex(random_bytes(10));
    if(!@mkdir($stage,0700))fail(503,'Vorlagen können nicht vorbereitet werden');
    try{
        $names=[];
        for($i=0;$i<$archive->numFiles;$i++){
            $name=$archive->getNameIndex($i);
            if(!is_string($name))fail(422,'ZIP-Eintrag ungültig');
            $names[]=$name;
        }
        $expected=array_map(fn($key)=>$key.'.docx',IDV_TEMPLATE_KEYS);
        sort($names);sort($expected);
        if($names!==$expected)fail(422,'ZIP muss genau die zehn unveränderten DOCX-Vorlagen enthalten');
        foreach(IDV_TEMPLATE_KEYS as $key){
            $filename=$key.'.docx';
            $entry=$archive->statName($filename);
            if(!$entry||($entry['size']??0)<1000||
                ($entry['size']??0)>IDV_MAX_TEMPLATE_BYTES)fail(422,'Ungültige Vorlagengröße: '.$key);
            $bytes=$archive->getFromName($filename);
            if(!is_string($bytes)||strlen($bytes)!==(int)$entry['size'])
                fail(422,'Vorlage konnte nicht vollständig gelesen werden: '.$key);
            $candidate=$stage.'/'.$filename;
            if(file_put_contents($candidate,$bytes,LOCK_EX)!==strlen($bytes))
                fail(503,'Vorlage konnte nicht gesichert werden: '.$key);
            @chmod($candidate,0600);
            if(!idvDocxValid($candidate))fail(422,'Originalvorlage beschädigt: '.$key);
        }
        // Source files are staged and validated before changing any live template.
        foreach(IDV_TEMPLATE_KEYS as $key){
            $source=$stage.'/'.$key.'.docx';
            $destination=$dir.'/'.$key.'.docx';
            if(is_link($destination))fail(500,'Unsichere bestehende Vorlage');
            if(!@rename($source,$destination))
                fail(503,'Vorlage konnte nicht aktualisiert werden: '.$key);
            @chmod($destination,0600);
        }
    }finally{
        $archive->close();
        foreach(IDV_TEMPLATE_KEYS as $key)@unlink($stage.'/'.$key.'.docx');
        @rmdir($stage);
    }
}
function dispatchGoogleTemplateAdmin(array $user,string $method,string $uri): bool {
    if($uri!=='/api/system/vorlagen')return false;
    if(($user['rolle']??'')!=='Administrator')fail(403,'Nur der Administrator darf die Originalvorlagen verwalten');
    if($method==='GET')respond(200,['bereit'=>idvTemplatesReady(),'vorlagen'=>idvTemplateStatus()]);
    if($method!=='POST')fail(405,'Methode nicht erlaubt');
    $file=$_FILES['paket']??null;
    if(!is_array($file)||($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK||
       !is_string($file['tmp_name']??null)||!is_uploaded_file($file['tmp_name']))
        fail(422,'Bitte das IDV-Originalvorlagen-ZIP hochladen');
    if(($file['size']??0)>IDV_MAX_TEMPLATE_PACK_BYTES)
        fail(413,'Vorlagenpaket zu groß');
    idvInstallTemplatePack($file['tmp_name']);
    sql('INSERT INTO log(user_id,aktion,art) VALUES(?,?,?)',
        [(int)$user['id'],'Originalvorlagen für Google Drive importiert','system']);
    respond(200,['ok'=>true,'bereit'=>idvTemplatesReady(),'vorlagen'=>idvTemplateStatus()]);
}
