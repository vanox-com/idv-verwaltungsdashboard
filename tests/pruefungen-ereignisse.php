<?php
declare(strict_types=1);
namespace IDV;
require dirname(__DIR__).'/php/Pruefungen.php';
function checkEvents(bool $ok,string $why): void {if(!$ok)throw new \RuntimeException($why);}
$batch=[
 ['id'=>'session_001','ereignis'=>'paste','frage'=>3,'clipboard'=>'NICHT SPEICHERN'],
 ['id'=>'session_002','ereignis'=>'paste_versuch','frage'=>2],
 ['id'=>'session_003','ereignis'=>'verlassen','frage'=>3],
 ['id'=>'session_004','ereignis'=>'zurueck','frage'=>3],
 ['id'=>'session_005','ereignis'=>'copy','frage'=>999],
];
$f=pruefungFokusMerge(['wechsel'=>0,'events'=>[]],$batch,5);
checkEvents(count($f['events'])===5,'all event types retained');
checkEvents($f['wechsel']===1,'focus count');
checkEvents($f['events'][0]['frage']===3,'question index');
checkEvents(!isset($f['events'][0]['clipboard']),'no clipboard content');
checkEvents(!isset($f['events'][4]['frage']),'invalid question number rejected');
checkEvents(count(pruefungFokusMerge($f,$batch,5)['events'])===5,'retry deduplication');
echo "Prüfungsereignisse OK\n";

$next=pruefungFokusMerge($f,[['id'=>'session_006','ereignis'=>'frage_geoeffnet','frage'=>4]],5);
checkEvents($next['aktuelleFrage']===4,'current question');
checkEvents($next['events'][5]['ereignis']==='frage_geoeffnet','navigation recorded');
