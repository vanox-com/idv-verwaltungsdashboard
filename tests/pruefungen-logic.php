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
