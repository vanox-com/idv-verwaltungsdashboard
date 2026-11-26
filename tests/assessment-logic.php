<?php
declare(strict_types=1);
namespace IDV;
require_once __DIR__.'/../php/Assessment.php';
require_once __DIR__.'/../php/Pruefungen.php';
function fail(int $code,string $message): never {throw new \RuntimeException($message,$code);}
function checkAssessment(bool $ok,string $label): void {if(!$ok)throw new \RuntimeException($label);}
foreach(['Polizeirat','Leitungsdienst','Administrator'] as $role)checkAssessment(assessmentVerwaltung(['rolle'=>$role]),$role);
foreach(['Ausbilder','Ausbildungsleitung','Polizeimeister',''] as $role)checkAssessment(!assessmentVerwaltung(['rolle'=>$role]),'blocked '.$role);
checkAssessment(count(ASSESSMENT_ARTEN)===3,'three types');
foreach(array_keys(ASSESSMENT_ARTEN) as $art){
 $q=['typ'=>'single','titel'=>'Test','punkte'=>1,'optionen'=>['A','B'],'richtig'=>[0]];
 [$type,$title,$minutes,$threshold,$questions]=assessmentVorlage(['art'=>$art,'minuten'=>10,'grenze'=>50,'fragen'=>[$q],'bestaetigt'=>true]);
 checkAssessment($type===$art&&assessmentAuto($questions[0],[0])===1.0,'grading');
 checkAssessment(!isset(assessmentPublicFragen($questions)[0]['richtig']),'no public key');
}
try{assessmentVorlage(['art'=>'pm']);throw new \LogicException('training type accepted');}catch(\RuntimeException $e){checkAssessment($e->getCode()===400,'training type rejected');}
foreach(['bereit','laufend','abgegeben','erstkorrigiert','zweitkorrigiert','freigegeben','annulliert'] as $status){
 $p=['status'=>$status,'erst'=>12,'zweit'=>99,'protokoll'=>'[]'];
 checkAssessment(assessmentSichtbar($p,42,true),'all council records '.$status);
 checkAssessment(!assessmentSichtbar($p,12,false),'no access through assignment '.$status);
 $r=assessmentKorrekturRechte($p,42,true);
 checkAssessment($r['erst']===in_array($status,['abgegeben','erstkorrigiert','zweitkorrigiert'],true)&&!$r['zweit'],'single review '.$status);
 checkAssessment(!assessmentKorrekturRechte($p,12,false)['erst'],'no correction through assignment '.$status);
}
echo "Assessment logic OK\n";

// Deletion is restricted to administrators and genuinely archived records.
$deleteNow=strtotime('2026-11-27T00:00:00Z');
$oldExam=['status'=>'freigegeben','protokoll'=>[['aktion'=>'freigabe','am'=>'2026-11-25T00:00:00Z']]];
$freshExam=['status'=>'freigegeben','protokoll'=>[['aktion'=>'freigabe','am'=>'2026-11-26T23:00:00Z']]];
foreach(['Administrator','Leitungsdienst','Polizeirat','Ausbildungsleitung','Ausbilder',''] as $role){
 checkAssessment(assessmentLoeschenDarf(['rolle'=>$role],$oldExam,$deleteNow)===($role==='Administrator'),'archive deletion role '.$role);
 checkAssessment(!assessmentLoeschenDarf(['rolle'=>$role],$freshExam,$deleteNow),'unarchived release protected '.$role);
 foreach(['bereit','laufend','abgegeben','erstkorrigiert','zweitkorrigiert'] as $status)checkAssessment(!assessmentLoeschenDarf(['rolle'=>$role],['status'=>$status],$deleteNow),'active exam protected '.$status);
}
checkAssessment(assessmentLoeschenDarf(['rolle'=>'Administrator'],['status'=>'annulliert'],$deleteNow),'cancelled exam can be deleted');

foreach(['Administrator','Leitungsdienst','Polizeirat','Ausbildungsleitung','Ausbilder',''] as $role){
 checkAssessment(assessmentVorlageLoeschenDarf(['rolle'=>$role],0)===($role==='Administrator'),'template deletion role '.$role);
 checkAssessment(!assessmentVorlageLoeschenDarf(['rolle'=>$role],1),'referenced template protected '.$role);
}
