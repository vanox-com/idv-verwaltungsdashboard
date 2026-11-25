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

assertExam(IDV\pruefungImportAdmin(['rolle'=>'Administrator']),'admin import access');
foreach(['Leitungsdienst','Ausbildungsleitung','Ausbilder','Polizeirat',''] as $role)
    assertExam(!IDV\pruefungImportAdmin(['rolle'=>$role,'rechte'=>['ausbildung'=>2]]),'non-delegable import access '.$role);

$examSource=file_get_contents(dirname(__DIR__).'/php/Pruefungen.php');
$examUi=file_get_contents(dirname(__DIR__).'/public/assets/pruefungszentrum.js');
assertExam(str_contains($examSource, "'vorlagenBearbeiten'=>\$verwaltung,'importAdmin'=>\$importAdmin"),'separate template and import permissions');
assertExam(str_contains($examUi,"if(!data.vorlagenBearbeiten)return;"),'leadership template editor');
assertExam(str_contains($examUi,"if(data.importAdmin&&!practice){"),'admin-only import UI');
assertExam(str_contains($examSource,"str_starts_with(\$uri,\$root.'/google/')&&!\$importAdmin"),'server-side Google import gate');

foreach(['bereit','laufend','abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben','annulliert'] as $status){
    $p=['erst'=>10,'zweit'=>20,'status'=>$status];
    assertExam(IDV\pruefungSichtbar($p,10,false)===in_array($status,['bereit','laufend','abgegeben'],true),'first visibility '.$status);
    assertExam(IDV\pruefungSichtbar($p,20,false)===($status==='erstkorrigiert'),'second visibility '.$status);
    assertExam(!IDV\pruefungSichtbar($p,30,false),'unassigned visibility '.$status);
    assertExam(IDV\pruefungSichtbar($p,30,true),'lead visibility '.$status);
}
