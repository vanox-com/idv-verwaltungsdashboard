<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Api.php';
require dirname(__DIR__).'/php/Ausbildung.php';
function checkAus(bool $ok,string $message): void {
    if(!$ok)throw new RuntimeException('Ausbildung regression failed: '.$message);
}
$role=['id'=>2,'rolle'=>'Ausbilder'];
$leiter=['id'=>3,'rolle'=>'Ausbildungsleitung'];
checkAus(IDV\hasPanelLoginRole('Ausbilder'),'trainer login enabled');
checkAus(IDV\hasPanelLoginRole('Ausbildungsleitung'),'lead login enabled');
checkAus(!IDV\hasPanelLoginRole('Mitarbeiter'),'normal staff still cannot sign in');
checkAus(IDV\rights($role)===['ausbildung'=>1],'trainer must have only Ausbildung read/write rights');
checkAus(IDV\rights($leiter)===['ausbildung'=>2],'lead must have only Ausbildung management rights');
$modules=['PM.0','PM.1','PM.2','PM.3','PM.4','PM.5','PM.6'];
$votes=[['stimme'=>'Ja','gewicht'=>2.0],['stimme'=>'Ja','gewicht'=>0.5]];
$ready=IDV\ausbildungStatus('PMA',$modules,$modules,$votes);
checkAus($ready['bereit']===true&&$ready['stimmenSaldo']===2.5,'PMA exact threshold');
$notEnough=IDV\ausbildungStatus('PMA',$modules,$modules,[['stimme'=>'Ja','gewicht'=>2.0]]);
checkAus($notEnough['status']==='Nicht bereit','PMA below threshold');
$negative=IDV\ausbildungStatus('PMA',$modules,$modules,[...$votes,['stimme'=>'Nein','gewicht'=>1.0]]);
checkAus($negative['status']==='Nicht bereit'&&$negative['stimmenSaldo']===1.5,'negative votes count');
$incomplete=IDV\ausbildungStatus('PMA',$modules,array_slice($modules,0,6),$votes);
checkAus($incomplete['status']==='Module unvollständig','no admission without all seven modules');
$pk=['PK.1','PK.2','PK.3','PK.4'];
foreach(['PKA','KKA'] as $track){
 $pass=IDV\ausbildungStatus($track,$pk,$pk,[]);
 checkAus($pass['bereit']===true&&$pass['schwelle']===null,$track.' four modules sufficient');
 $miss=IDV\ausbildungStatus($track,$pk,['PK.1','PK.2','PK.3'],[]);
 checkAus(!$miss['bereit'],$track.' missing module blocks admission');
}
checkAus(IDV\ausbildungStufe('Ausbildungsleitung')===2.0,'lead weight');
checkAus(IDV\ausbildungStufe('Leitungsdienst')===1.5,'Leitungsdienst weight');
checkAus(IDV\ausbildungStufe('stv. Ausbildungsleitung')===2.0,'deputy lead weight');
checkAus(IDV\ausbildungStufe('Ausbilder gehobener Dienst')===1.0,'regular GD weight');
checkAus(IDV\ausbildungStufe('Ausbilder mittlerer Dienst')===1.0,'regular MD weight');
checkAus(IDV\ausbildungStufe('Ausbilder auf Probe')===0.5,'probation weight');
checkAus(IDV\ausbildungStufe('Ausbilder')===1.0,'normal trainer weight');
checkAus(IDV\ausbildungStimmgewicht(['funktion'=>'Ausbilder mittlerer Dienst','gewicht'=>0.5])===1.0,
  'old vote stored as 0.5 must count as 1 for normal trainer without changing record');
checkAus(IDV\ausbildungStimmgewicht(['funktion'=>'Ausbilder auf Probe','gewicht'=>1.0])===0.5,
  'role function always determines current weight');
checkAus(IDV\ausbildungStimmgewicht(['rolle'=>'Leitungsdienst','gewicht'=>2.0])===1.5,
  'Leitungsdienst account without own trainer profile');
$weighted=IDV\ausbildungStatus('PMA',$modules,$modules,[
  ['stimme'=>'Ja','gewicht'=>2.0],
  ['stimme'=>'Ja','gewicht'=>1.0],
  ['stimme'=>'Nein','gewicht'=>0.5]
]);
checkAus($weighted['stimmenSaldo']===2.5 && $weighted['jaPunkte']===3.0 &&
 $weighted['neinPunkte']===0.5 && $weighted['stimmenJa']===2 && $weighted['stimmenNein']===1,
 'PMA weight sum and counts displayed separately');
echo "Ausbildung: isolated roles, PMA votes, PKA/KKA module rules OK\n";
