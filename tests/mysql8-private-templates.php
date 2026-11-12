<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Api.php';
require dirname(__DIR__).'/php/GoogleTemplates.php';

$root=sys_get_temp_dir().'/idv_templates_test_'.bin2hex(random_bytes(6));
if(!mkdir($root,0700))throw new RuntimeException('Testverzeichnis konnte nicht erstellt werden');
$dir=$root.'/store';
putenv('IDV_TEMPLATE_DIR='.$dir);
$pack=$root.'/templates.zip';
$outer=new ZipArchive();
if($outer->open($pack,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true)
    throw new RuntimeException('Test-ZIP konnte nicht geöffnet werden');
try {
    foreach(IDV\IDV_TEMPLATE_KEYS as $key) {
        $tmp=$root.'/'.$key.'.docx';
        $doc=new ZipArchive();
        if($doc->open($tmp,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true)
            throw new RuntimeException('Test-DOCX konnte nicht geöffnet werden');
        $doc->addFromString('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
        $doc->addFromString('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'.$key.str_repeat('x',200).'</w:document>');
        $doc->addFromString('word/styles.xml',base64_encode(random_bytes(2048)));
        $doc->close();
        // The test intentionally creates a valid ZIP-shaped DOCX; production
        // templates are genuine Google Docs DOCX exports.
        $outer->addFile($tmp,$key.'.docx');
    }
}finally{$outer->close();}
if(IDV\idvTemplatesReady())throw new RuntimeException('Templates should be initially missing');
IDV\idvInstallTemplatePack($pack);
if(!IDV\idvTemplatesReady())throw new RuntimeException('Template import failed');
foreach(IDV\IDV_TEMPLATE_KEYS as $key){
    if(!str_starts_with(IDV\idvTemplateBytes($key),'PK'))
        throw new RuntimeException('Unusable template '.$key);
}
foreach(glob($dir.'/*')?:[] as $path)unlink($path);
rmdir($dir);
foreach(glob($root.'/*')?:[] as $path)if(is_file($path))unlink($path);
rmdir($root);
echo "Private template import, validation and availability OK\n";
