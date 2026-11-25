<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Pruefungen.php';
function assertExam(bool $b,string $m): void {if(!$b)throw new RuntimeException($m);}
$q=['typ'=>'multiple','punkte'=>5,'richtig'=>[0,2]];
assertExam(IDV\pruefungAuto($q,[2,0])===5.0,'order independent');
assertExam(IDV\pruefungAuto($q,[0])===0.0,'incomplete selection');
assertExam(IDV\pruefungAuto($q,[0,1,2])===0.0,'extra incorrect selection');
assertExam(IDV\pruefungAuto(['typ'=>'text'], 'text')===null,'manual text review');
echo "Prüfungsbewertung OK\n";

foreach(['abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben'] as $s)assertExam(IDV\pruefungBerichtigungStatus($s),'lead correction '.$s);
foreach(['bereit','laufend','annulliert'] as $s)assertExam(!IDV\pruefungBerichtigungStatus($s),'no correction '.$s);

require dirname(__DIR__).'/php/PruefungenGoogle.php';
assertExam(IDV\pruefungGoogleBildUrl('https://lh3.googleusercontent.com/abc'),'Google CDN image');
assertExam(!IDV\pruefungGoogleBildUrl('https://googleusercontent.com.evil.example/abc'),'reject external domain');
assertExam(!IDV\pruefungGoogleBildUrl('https://lh3.googleusercontent.com@evil.example/abc'),'reject userinfo');
assertExam(!IDV\pruefungGoogleBildUrl('http://lh3.googleusercontent.com/abc'),'reject http');
assertExam(!IDV\pruefungGoogleBildUrl('https://lh3.googleusercontent.com:8443/abc'),'reject alternate port');

$public=IDV\pruefungPublicFragen([['typ'=>'text','titel'=>'Frage','punkte'=>2,'kontext'=>'Hinweis','bilder'=>[],'muster'=>'GEHEIM','richtig'=>[0],'feedback'=>'GEHEIM']]);
assertExam(!isset($public[0]['muster'],$public[0]['richtig'],$public[0]['feedback']),'candidate must not receive solutions');
assertExam($public[0]['kontext']==='Hinweis','public context');
