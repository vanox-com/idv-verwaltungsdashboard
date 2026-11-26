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

$p=['erst'=>10,'zweit'=>20,'status'=>'abgegeben','protokoll'=>'[]'];
assertExam(IDV\pruefungKorrekturRechte($p,30,true)['erst'],'unassigned lead first review');
assertExam(!IDV\pruefungKorrekturRechte($p,30,false)['erst'],'unassigned ordinary reviewer blocked');
$p['status']='erstkorrigiert';$p['protokoll']=json_encode([['aktion'=>'korrektur','stufe'=>'erst','user'=>30,'bewertung'=>[]]]);
assertExam(IDV\pruefungKorrekturRechte($p,40,true)['zweit'],'unassigned lead second review');
assertExam(!IDV\pruefungKorrekturRechte($p,30,true)['zweit'],'actual first reviewer cannot approve own second review');
assertExam(IDV\pruefungKorrekturRechte($p,20,false)['zweit'],'assigned second reviewer');
assertExam(!IDV\pruefungKorrekturRechte($p,10,false)['zweit'],'ordinary first reviewer cannot approve');

foreach(['abgegeben','freigegeben','annulliert'] as $status){
    $p=['art'=>'praxis','erst'=>10,'zweit'=>0,'status'=>$status,'protokoll'=>json_encode([['aktion'=>'Praxisprüfung angelegt','user'=>20]])];
    assertExam(IDV\pruefungSichtbar($p,10,false)===($status==='abgegeben'),'practice assigned reviewer '.$status);
    assertExam(IDV\pruefungSichtbar($p,20,false)===($status==='abgegeben'),'practice creator '.$status);
    assertExam(!IDV\pruefungSichtbar($p,30,false),'practice foreign access blocked '.$status);
    assertExam(IDV\pruefungSichtbar($p,30,true),'practice lead '.$status);
}

$now=time();
foreach(['pm','praxis'] as $art){
    $p=['art'=>$art,'erst'=>10,'zweit'=>$art==='praxis'?0:20,'status'=>'freigegeben','protokoll'=>[
        ['aktion'=>$art==='praxis'?'Praxisprüfung angelegt':'erstellt','user'=>40],
        ['aktion'=>$art==='praxis'?'abschliessen':'freigabe','am'=>gmdate('c',$now-3600),'user'=>50]
    ]];
    assertExam(!IDV\pruefungArchivInfo($p,$now)['archiviert'],'recent result '.$art);
    assertExam(IDV\pruefungSichtbar($p,10,false),'assigned result '.$art);
    assertExam(IDV\pruefungSichtbar($p,40,false),'creator result '.$art);
    assertExam(!IDV\pruefungSichtbar($p,30,false),'foreign result blocked '.$art);
    assertExam(IDV\pruefungArchivInfo($p,$now+82800)['archiviert'],'24h cutoff '.$art);
    $p['protokoll'][]=['aktion'=>'archivieren','am'=>gmdate('c',$now),'user'=>10];
    assertExam(!IDV\pruefungSichtbar($p,10,false),'manual archive blocked '.$art);
    assertExam(IDV\pruefungSichtbar($p,50,true),'lead archive access '.$art);
}

// A regular trainer may create and review their own attempt, but cannot assign another first reviewer.
assertExam(IDV\pruefungZuteilungErlaubt(10,10,false),'trainer self assignment');
assertExam(!IDV\pruefungZuteilungErlaubt(10,20,false),'trainer cannot assign foreign first reviewer');
assertExam(IDV\pruefungZuteilungErlaubt(10,20,true),'lead assignment');
assertExam(!IDV\pruefungZuteilungErlaubt(0,10,true),'no unauthenticated assignment');
assertExam(!IDV\pruefungZuteilungErlaubt(10,0,true),'no empty assignment');
$pending=['art'=>'pm','status'=>'bereit','erst'=>10,'zweit'=>20];
assertExam(IDV\pruefungLinkErneuernDarf($pending,10,false),'first reviewer can renew own link');
assertExam(!IDV\pruefungLinkErneuernDarf($pending,20,false),'second reviewer cannot renew link');
assertExam(IDV\pruefungLinkErneuernDarf($pending,30,true),'lead can renew link');
$pending['status']='laufend';
assertExam(!IDV\pruefungLinkErneuernDarf($pending,10,false),'no renewal after start');
$pending=['art'=>'praxis','status'=>'bereit','erst'=>10];
assertExam(!IDV\pruefungLinkErneuernDarf($pending,10,false),'no external practice link');
$practiceSource=file_get_contents(dirname(__DIR__).'/php/PruefungenPraxis.php');
assertExam(substr_count($practiceSource,'if(!pruefungAnlegenDarf($u))')===2,'practice GET and POST creation capability');
assertExam(str_contains($examSource,"'anlegen'=>\$anlegen"),'separate create permission in bootstrap');
assertExam(str_contains($examUi,"if(data.anlegen)actions.append(createButton)"),'trainer create action');
assertExam(str_contains($examUi,"if(data.anlegen)actions.append(btn('Neue Praxisprüfung'"),'trainer practice action');
assertExam(str_contains($examUi,"if(!data.verwaltung&&['practice-template','archive','release'].includes(view))"),'archive and release remain restricted');

// Deletion is restricted to administrators and genuinely archived records.
$deleteNow=strtotime('2026-11-27T00:00:00Z');
$oldExam=['status'=>'freigegeben','protokoll'=>[['aktion'=>'freigabe','am'=>'2026-11-25T00:00:00Z']]];
$freshExam=['status'=>'freigegeben','protokoll'=>[['aktion'=>'freigabe','am'=>'2026-11-26T23:00:00Z']]];
foreach(['Administrator','Leitungsdienst','Polizeirat','Ausbildungsleitung','Ausbilder',''] as $role){
 assertExam(IDV\pruefungLoeschenDarf(['rolle'=>$role],$oldExam,$deleteNow)===($role==='Administrator'),'archive deletion role '.$role);
 assertExam(!IDV\pruefungLoeschenDarf(['rolle'=>$role],$freshExam,$deleteNow),'unarchived release protected '.$role);
 foreach(['bereit','laufend','abgegeben','erstkorrigiert','zweitkorrigiert'] as $status)assertExam(!IDV\pruefungLoeschenDarf(['rolle'=>$role],['status'=>$status],$deleteNow),'active exam protected '.$status);
}
assertExam(IDV\pruefungLoeschenDarf(['rolle'=>'Administrator'],['status'=>'annulliert'],$deleteNow),'cancelled exam can be deleted');
