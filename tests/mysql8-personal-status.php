<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Personnel.php';
require dirname(__DIR__).'/php/Bootstrap.php';

foreach(['Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten'] as $status){
  if(!IDV\personnelStatusAllowed($status))
      throw new RuntimeException('Legitimate personnel status rejected: '.$status);
}
foreach(['Hauptberuf','Nebenberuf','',null,'Aktiv ','frei'] as $bad){
  if(IDV\personnelStatusAllowed($bad))
      throw new RuntimeException('Employment or malformed label accepted as personnel status');
}
if(IDV\personnelStatusAllowed('Gekündigt',true))
    throw new RuntimeException('New personnel cannot be immediately terminated');
if(!IDV\personnelStatusAllowed('Aktiv',true))
    throw new RuntimeException('Active personnel creation blocked');

$plan=['tage'=>['10.11.2026','17.11.2026'],'personen'=>[]];
$mark=['personalnummer'=>48,'vorname'=>'Mark','nachname'=>'Clark',
       'status'=>'Aktiv','eintrittsdatum'=>'2026-11-10'];
$rows=IDV\routineRoster($plan,[$mark]);
if(count($rows)!==1||(int)$rows[0]['nr']!==48||
   $rows[0]['vorname']!=='Mark'||$rows[0]['nachname']!=='Clark'||
   $rows[0]['anwesend']!==[null,null]||$rows[0]['_aktuell']!==true)
    throw new RuntimeException('Active Mark Clark missing from MySQL/PHP routine roster');
$invalid=$mark;
$invalid['status']='Hauptberuf';
if(IDV\routineRoster($plan,[$invalid])!==[])
    throw new RuntimeException('Invalid status was incorrectly interpreted as active');
echo "PHP personnel status whitelist and auto routine participant DN48 OK\n";
