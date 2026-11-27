<?php
declare(strict_types=1);
require __DIR__.'/../php/AusbildungStatistik.php';
function statCheck(bool $ok,string $label): void {if(!$ok)throw new RuntimeException($label);}
$tz=new DateTimeZone('Europe/Berlin');$today=new DateTimeImmutable('2026-11-27',$tz);
statCheck(IDV\ausbildungStatistikTage('2026-11-20',$today)===7,'seven days');
statCheck(IDV\ausbildungStatistikTage('2026-11-28',$today)===null,'future rejected');
statCheck(IDV\ausbildungStatistikProzent(0,0)===null,'empty denominator');
$r=['status'=>'freigegeben','art'=>'pm','ergebnis'=>8,'grenze'=>75,'fragen'=>'[{"punkte":10}]','datum'=>'2026-11-27 12:00:00'];
statCheck(IDV\ausbildungStatistikErgebnis($r)['bestanden'],'theory threshold');
$practice=$r;$practice['art']='praxis';$practice['fragen']='{"schema":"pm-praxis-v1"}';$practice['ergebnis']=79;$practice['grenze']=80;
statCheck(!IDV\ausbildungStatistikErgebnis($practice)['bestanden'],'practice threshold');
$e=IDV\ausbildungStatistikPruefungen([$r,$practice],$today->modify('-6 days'),$today,7);
statCheck($e['anzahl']===2&&$e['bestanden']===1&&$e['quote']===50.0,'aggregate');
$empty=IDV\ausbildungStatistikAktuell([],$today);statCheck($empty['gesamt']===0&&$empty['quote']===null,'empty current');
$a=['laufbahn'=>'PKA','beginn'=>'2026-11-22','fortschritt'=>['bereit'=>false,'moduleFertig'=>4,'moduleGesamt'=>4,'dgl'=>['pruefungMoeglich'=>true,'pruefung'=>true],'mindestzeit'=>['erfuellt'=>false,'tage'=>5],'module'=>[]]];
$c=IDV\ausbildungStatistikAktuell([$a],$today);
statCheck($c['gesamt']===1&&$c['bereit']===0&&$c['tage']===5.0,'current rank duration');
statCheck(array_sum(array_column($c['huerden'],'anzahl'))===1,'minimum time hurdle');
echo "Training statistics OK\n";

statCheck(IDV\statistikTestName('TeStperson'),'case insensitive test');
statCheck(IDV\statistikTestPerson(['vorname'=>'Max','nachname'=>'Testmann']),'test surname');
statCheck(!IDV\statistikTestPerson(['kandidat'=>'Max Muster','titel'=>'Einstellungstest']),'ordinary test title retained');
$test=$a;$test['name']='TEST Anwärter';
statCheck(IDV\ausbildungStatistikAktuell([$a,$test],$today)['gesamt']===1,'test trainee excluded from all current aggregates');
$test=$r;$test['kandidat']='Test Kandidat';
statCheck(IDV\ausbildungStatistikPruefungen([$r,$test],$today->modify('-6 days'),$today,7)['anzahl']===1,'test exam excluded from all outcomes');
