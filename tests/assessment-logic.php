<?php
declare(strict_types=1);
namespace IDV;
require_once __DIR__.'/../php/Assessment.php';
require_once __DIR__.'/../php/Pruefungen.php';
function fail(int $code,string $message): never {throw new \RuntimeException($message,$code);}
function checkAssessment(bool $ok,string $label): void {if(!$ok)throw new \RuntimeException($label);}
foreach(['Polizeirat','Administrator'] as $role)checkAssessment(assessmentVerwaltung(['rolle'=>$role]),$role);
foreach(['Ausbilder','Ausbildungsleitung','Leitungsdienst','Polizeimeister',''] as $role)checkAssessment(!assessmentVerwaltung(['rolle'=>$role]),'blocked '.$role);
checkAssessment(count(ASSESSMENT_ARTEN)===3,'three types');
foreach(array_keys(ASSESSMENT_ARTEN) as $art){
 $q=['typ'=>'single','titel'=>'Test','punkte'=>1,'optionen'=>['A','B'],'richtig'=>[0]];
 [$type,$title,$minutes,$threshold,$questions]=assessmentVorlage(['art'=>$art,'minuten'=>10,'grenze'=>50,'fragen'=>[$q],'bestaetigt'=>true]);
 checkAssessment($type===$art&&assessmentAuto($questions[0],[0])===1.0,'grading');
 checkAssessment(!isset(assessmentPublicFragen($questions)[0]['richtig']),'no public key');
}
try{assessmentVorlage(['art'=>'pm']);throw new \LogicException('training type accepted');}catch(\RuntimeException $e){checkAssessment($e->getCode()===400,'training type rejected');}
echo "Assessment logic OK\n";
