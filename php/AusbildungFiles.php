<?php
declare(strict_types=1);
namespace IDV;

/**
 * Private Ausbildungsunterlagen: niemals in public/ oder GitHub speichern.
 * Authenticated download only; uploaded files are never executed or rendered inline.
 */
function ausbildungDateiverzeichnis(): string {
    $directory=(string)(getenv('IDV_AUSBILDUNG_FILES_DIR')?:dirname(__DIR__).'/private/ausbildung-files');
    if(!str_starts_with($directory,DIRECTORY_SEPARATOR))
        fail(503,'Das Ausbildungsdateiverzeichnis muss absolut und privat sein');
    if(!is_dir($directory)&&!@mkdir($directory,0700,true))
        fail(503,'Das private Ausbildungsdateiverzeichnis ist nicht beschreibbar');
    $real=realpath($directory);
    if($real===false)fail(503,'Dateiverzeichnis nicht verfügbar');
    $docRoot=(string)($_SERVER['DOCUMENT_ROOT']??'');
    foreach([dirname(__DIR__).'/public',$docRoot] as $candidate){
        $exposed=$candidate!==''?realpath($candidate):false;
        if($exposed!==false&&($real===$exposed||str_starts_with($real,$exposed.DIRECTORY_SEPARATOR)))
            fail(503,'Private Ausbildungsunterlagen dürfen nicht im Webroot liegen');
    }
    return $real;
}
function ausbildungDateiDownload(array $u,int $id): never {
    ausbildungRecht($u);
    $r=sql('SELECT dateipfad,titel FROM ausbildung_materialien WHERE id=? AND aktiv=1 LIMIT 1',[$id]);
    if(!$r||!is_string($r[0]['dateipfad']??null))
        fail(404,'Unterlage nicht verfügbar');
    $file=$r[0]['dateipfad'];
    if(!preg_match('/^[a-f0-9]{32}\.(?:pdf|pptx|docx|xlsx)$/D',$file))
        fail(500,'Ungültige Unterlagenreferenz');
    $path=ausbildungDateiverzeichnis().DIRECTORY_SEPARATOR.$file;
    if(!is_file($path)||!is_readable($path))fail(404,'Unterlage fehlt am Hoster');
    // No document name, contents or storage path are exposed as a public URL.
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="ausbildungsunterlage.'.pathinfo($file,PATHINFO_EXTENSION).'"');
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('Content-Length: '.(string)filesize($path));
    readfile($path);
    exit;
}
function ausbildungDateiUpload(array $u): never {
    ausbildungRecht($u,2);
    $file=$_FILES['datei']??null;
    if(!is_array($file)||!isset($file['error'],$file['tmp_name'],$file['name'])||is_array($file['error']))
        fail(400,'Keine gültige Datei hochgeladen (PHP-Uploadlimits prüfen)');
    if((int)$file['error']!==UPLOAD_ERR_OK)
        fail(400,'Dateiupload fehlgeschlagen: Servergrößenlimit oder Verbindungsfehler');
    $size=(int)($file['size']??0);
    if($size<1||$size>40*1024*1024)fail(413,'Pro Datei sind maximal 40 MB erlaubt');
    $tmp=(string)$file['tmp_name'];
    if(!is_uploaded_file($tmp))fail(400,'Unzulässiger Datei-Upload');
    $original=(string)$file['name'];
    $ext=strtolower(pathinfo($original,PATHINFO_EXTENSION));
    if(!in_array($ext,['pdf','docx','pptx','xlsx'],true))
        fail(400,'Nur PDF-, DOCX-, PPTX- oder XLSX-Dateien erlaubt');
    $signature=file_get_contents($tmp,false,null,0,8);
    if(!is_string($signature))fail(400,'Datei nicht lesbar');
    if($ext==='pdf'){
        if(!str_starts_with($signature,'%PDF-'))fail(400,'Keine gültige PDF-Datei');
    }else {
        if(!str_starts_with($signature,'PK'))fail(400,'Keine gültige Office-Datei');
        $zip=new \ZipArchive();
        if($zip->open($tmp)!==true)fail(400,'Office-Datei ist beschädigt');
        $valid=$zip->locateName('[Content_Types].xml')!==false;
        $zip->close();
        if(!$valid)fail(400,'Keine gültige Office-Datei');
    }
    $title=ausbildungString($_POST['titel']??'',200,'Titel',true);
    $typ=ausbildungString($_POST['typ']??'Unterlage',50,'Typ',true);
    $code=$_POST['modul_code']??null;
    if($code==='')$code=null;
    if($code!==null&&(!is_string($code)||!in_array($code,array_column(sql('SELECT code FROM ausbildung_module'),'code'),true)))
        fail(400,'Unbekanntes Ausbildungsmodul');

    $name=bin2hex(random_bytes(16)).'.'.$ext;
    $target=ausbildungDateiverzeichnis().DIRECTORY_SEPARATOR.$name;
    if(file_exists($target)||!move_uploaded_file($tmp,$target))
        fail(503,'Ausbildungsunterlage konnte nicht privat gespeichert werden');
    @chmod($target,0600);
    try{
        sql('INSERT INTO ausbildung_materialien(modul_code,titel,typ,url,dateipfad) VALUES(?,?,?,?,?)',[$code,$title,$typ,'',$name]);
        $id=(int)db()->lastInsertId();
        auditAction($u,'Private Ausbildungsunterlage hochgeladen: ID '.$id,'add');
        respond(200,['ok'=>true,'id'=>$id]);
    }catch(\Throwable $e){
        @unlink($target);
        throw $e;
    }
}
