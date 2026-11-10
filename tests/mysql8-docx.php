<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Api.php';
require dirname(__DIR__).'/php/RoutineArchive.php';
require dirname(__DIR__).'/php/GoogleDocuments.php';
require dirname(__DIR__).'/php/DocumentTemplates.php';

function assertDoc(bool $value,string $message): void {
    if(!$value)throw new RuntimeException('Synthetic DOCX compatibility failed: '.$message);
}
assertDoc(class_exists(ZipArchive::class),'php-zip extension missing');
assertDoc(function_exists('curl_init'),'php-curl extension missing');
assertDoc(function_exists('openssl_encrypt'),'php-openssl extension missing');

$xmlHead='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
$xmlTail='</w:body></w:document>';
$t=static fn(string $s):string=>'<w:p><w:r><w:t>'.
    htmlspecialchars($s,ENT_XML1|ENT_QUOTES,'UTF-8').'</w:t></w:r></w:p>';

$xml=$xmlHead;
foreach(array_fill(0,3,'<Vorname>') as $x)$xml.=$t($x);
foreach(array_fill(0,3,'<Name>') as $x)$xml.=$t($x);
foreach(['<Geburtsdatum>','<Unterschrift>','<1., 2., 3.>',
         '< evtl. genaue Beschreibung >','<Datum>'] as $x)$xml.=$t($x);
$xml.=$xmlTail;

$fields=IDV\documentFields('abmahnung',[
    'datum'=>'2026-11-10','unterzeichner'=>'Max Mustermann',
    'rang'=>'Polizeirat','sachverhalt'=>'Synthetischer Testfall',
    'paragraphen'=>'Paragraf A','stufe'=>'1'
]);
$person=['vorname'=>'Alex','nachname'=>'Beispiel','geburtsdatum'=>'2000-02-03'];
$rewritten=IDV\documentFillXml($xml,'abmahnung',$person,$fields);
assertDoc(!str_contains($rewritten,'&lt;Vorname&gt;'),'first name placeholders remain');
assertDoc(!str_contains($rewritten,'&lt;Name&gt;'),'last name placeholders remain');
assertDoc(str_contains($rewritten,'Synthetischer Testfall'),'case description missing');
assertDoc(str_contains($rewritten,'Max Mustermann'),'signatory missing');

$temp=tempnam(sys_get_temp_dir(),'idv_fixture_');
assertDoc($temp!==false,'temporary fixture missing');
try{
    $zip=new ZipArchive();
    assertDoc($zip->open($temp,ZipArchive::CREATE|ZipArchive::OVERWRITE)===true,'fixture ZipArchive open failed');
    $zip->addFromString('word/document.xml',$xml);
    $zip->addFromString('random.bin',random_bytes(3000));
    $zip->close();
    $source=file_get_contents($temp);
    assertDoc($source!==false&&strlen($source)>1000,'synthetic ZIP too small');
    $repacked=IDV\docxRewrite($source,fn($before)=>IDV\documentFillXml($before,'abmahnung',$person,$fields));
    assertDoc(strlen($repacked)>1000&&substr($repacked,0,2)==='PK','DOCX archive not preserved');
    file_put_contents($temp,$repacked);
    $zip2=new ZipArchive();
    assertDoc($zip2->open($temp)===true,'repacked DOCX cannot be opened');
    $inside=$zip2->getFromName('word/document.xml');
    $zip2->close();
    assertDoc(is_string($inside)&&$inside===$rewritten,'DOCX XML content mismatch');
}finally{@unlink($temp);}

$certificate=$xmlHead.$t('<Vorname>').$t('<Name>').$t('<Geburtsdatum>').
    $t('<Datum>').$t('<Datum>').$xmlTail;
$filled=IDV\certificateFillXml($certificate,$person,'2026-10-01','2026-11-10');
assertDoc(str_contains($filled,'01.10.2026')&&str_contains($filled,'10.11.2026'),
    'two certificate dates not preserved');
$signatures=$xmlHead.$t('<Unterschrift>').$t('<Unterschrift>').$xmlTail;
$contract=IDV\documentSignature($signatures,'hauptvertrag','Max Mustermann');
assertDoc(substr_count($contract,'&lt;Unterschrift&gt;')===1&&
    substr_count($contract,'Max Mustermann')===1,
    'only second contract signature may be replaced');
try {
    IDV\googleRequest('https://untrusted.example.test/test');
    throw new RuntimeException('External Google API host bypass accepted');
}catch(LogicException $e){
    assertDoc(str_contains($e->getMessage(),'not allowed'),'unexpected external host rejection');
}
echo "Synthetic editable DOCX, placeholders, certificates, split signatures and Google-host allowlist OK\n";
