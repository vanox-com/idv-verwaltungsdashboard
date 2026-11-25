<?php
declare(strict_types=1);
namespace IDV;
function dashboardSpruchDefault(): string {return 'Schon wieder hier? Na dann, ran an die Arbeit!';}
function fail(int $code,string $message): never {throw new \InvalidArgumentException($message,$code);}
require_once dirname(__DIR__).'/php/DashboardFigur.php';
function verify(bool $condition,string $message): void {if(!$condition)throw new \RuntimeException($message);}
$cfg=dashboardFigurDefault(dashboardSpruchDefault());
verify(count($cfg['pool'])===60,'starter content');
verify(count(dashboardFigurPersonen())===4,'four people');
$now=new \DateTimeImmutable('2026-11-25 11:59:00',new \DateTimeZone('Europe/Berlin'));
$a=dashboardFigurResolve($cfg,$now,'a');$b=dashboardFigurResolve($cfg,$now,'b');
verify($a===$b,'shared daily selection');
$c=dashboardFigurResolve($cfg,$now->modify('+1 day'),'a');
verify($a['person']!==$c['person']&&$a['spruch']!==$c['spruch'],'daily change');
$cfg['figurModus']='fest';$cfg['person']='lou-beckenbauer';$cfg['textModus']='manuell';$cfg['spruch']='Hallo!';
verify(dashboardFigurResolve($cfg,$now,'a')['person']==='lou-beckenbauer','fixed figure');
verify(dashboardFigurResolve($cfg,$now,'a')['spruch']==='Hallo!','manual');
$cfg['textModus']='gemischt';$cfg['kategorien']=[];
verify(dashboardFigurResolve($cfg,$now,'a')['spruch']==='Hallo!','empty pool fallback');
$cfg['kategorien']=['fakten'];$cfg['intervall']='halbtag';
verify(dashboardFigurResolve($cfg,$now,'a')['spruch']!==dashboardFigurResolve($cfg,$now->modify('+1 minute'),'a')['spruch'],'Berlin noon boundary');
$cfg['intervall']='login';$cfg['figurModus']='login';
verify(dashboardFigurResolve($cfg,$now,'session')===dashboardFigurResolve($cfg,$now->modify('+2 hours'),'session'),'stable login selection');
verify(dashboardFigurValidate($cfg)['person']==='lou-beckenbauer','validate');
$cfg['pool'][0]['text']=str_repeat('x',181);
try{dashboardFigurValidate($cfg);throw new \RuntimeException('invalid text accepted');}catch(\InvalidArgumentException $e){verify($e->getCode()===400,'invalid text rejected');}
echo "Dashboard figure logic OK\n";
