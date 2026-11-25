<?php
declare(strict_types=1);
namespace IDV;
require dirname(__DIR__).'/php/Pruefungen.php';
require dirname(__DIR__).'/php/PruefungenPraxis.php';
function fail(int $code,string $message): never {throw new \RuntimeException($message,$code);}
function checkPraxis(bool $ok,string $msg): void {if(!$ok)throw new \RuntimeException($msg);}
$s=praxisSchema();$f=praxisNormalize([]);
foreach($s['sections'] as $k=>$groups)foreach($groups as $g)foreach($g['criteria'] as $q)$f['sections'][$k]['answers'][$q['id']]=array_key_first($q['options']);
foreach($f['drive']['rounds'] as &$r){$r['seconds']=107;foreach($s['drive'] as $q)$r[$q['id']]=array_key_first($q['options']);}unset($r);
$theory=['punkte'=>75,'max'=>100];
$result=praxisCalculate($f,$theory);checkPraxis($result['total']===90.0,'weighted total');checkPraxis($result['best']===0,'best round');
$f['drive']['rounds'][1]['seconds']=113;$f['drive']['selected']=1;
$result=praxisCalculate($f,$theory);checkPraxis($result['rounds'][1]['score']===88.0,'time penalty');checkPraxis($result['total']===88.2,'manual round');
$f['drive']['selected']=null;$f['sections']['traffic']['answers']['id']='Nein';
$result=praxisCalculate($f,$theory);checkPraxis($result['modules']['traffic']['percent']===96.5,'category weighting');
$f['drive']['rounds'][2]['seconds']=null;checkPraxis(praxisCalculate($f,$theory)['total']===null,'incomplete round');
checkPraxis(praxisStatus(80.0)==='Bestanden'&&praxisStatus(70.0)==='Nachprüfung erforderlich','threshold boundaries');
echo "PM-Praxisprüfung OK\n";
