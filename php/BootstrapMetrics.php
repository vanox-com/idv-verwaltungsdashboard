<?php
declare(strict_types=1);
namespace IDV;

/** Match original dashboard aggregates without exposing restricted personnel fields. */
function metricsDate(mixed $x): ?string {
    if(!is_string($x)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$x))return null;
    return $x;
}
function metricsDayOffset(?string $date,\DateTimeImmutable $today): ?int {
    if(!$date)return null;
    try{$d=new \DateTimeImmutable($date,new \DateTimeZone('Europe/Berlin'));}
    catch(\Throwable $e){return null;}
    return (int)$today->diff($d)->format('%r%a');
}
function metricsAnniversary(mixed $date,\DateTimeImmutable $today,int $minimum): ?array {
    $birth=metricsDate($date);if(!$birth)return null;
    $month=(int)substr($birth,5,2);$day=(int)substr($birth,8,2);
    $start=(int)substr($birth,0,4);
    $y=(int)$today->format('Y');
    $next=$today->setDate($y,$month,$day);
    if($next<$today){$y++;$next=$today->setDate($y,$month,$day);}
    $diff=(int)$today->diff($next)->days;
    if($diff<0||$diff>30||$y-$start<$minimum)return null;
    return ['tage'=>$diff,'jahre'=>$y-$start];
}
function bootstrapMetrics(array &$d,array $people,array $current,array $rights): void {
    $has=static fn(string $key):bool=>($rights[$key]??0)>=1;
    if($has('kue')){
        require_once __DIR__.'/TerminationArchive.php';
        $rows=sql('SELECT k.personalnummer,COUNT(*) AS gesamt,
            SUM(CASE WHEN '.terminationCurrentExpr('k').' THEN 1 ELSE 0 END) AS aktuell
            FROM kuendigungen k WHERE k.personalnummer IS NOT NULL GROUP BY k.personalnummer');
        $links=[];
        foreach($rows as $r)$links[(string)$r['personalnummer']]=[
            'gesamt'=>(int)$r['gesamt'],'aktuell'=>(int)$r['aktuell']];
        $d['kuendigungsVerknuepfungen']=$links?:new \stdClass();
    }
    if($has('dis')){
        // Enrich view only, without overwriting immutable original disciplinary text.
        $titles=[];
        foreach(sql("SELECT personalnummer,titel,url FROM generierte_dokumente
            WHERE typ='abmahnung' AND url<>''") as $row)
            $titles[(int)$row['personalnummer'].'|'.$row['url']]=$row['titel'];
        foreach($d['disziplin'] as &$case){
            foreach($case['slots'] as &$slot){
                if(!is_array($slot)||empty($slot['u']))continue;
                $name=$titles[(int)$case['nr'].'|'.$slot['u']]??null;
                if($name!==null)$slot['titel']=$name;
            }unset($slot);
        }unset($case);
    }
    if(!$has('dash'))return;
    $today=new \DateTimeImmutable('today',new \DateTimeZone('Europe/Berlin'));
    $todayIso=$today->format('Y-m-d');
    $sortCounts=static function(array $counts): array{
        $out=[];foreach($counts as $name=>$n)$out[]=['name'=>$name,'anzahl'=>$n];
        usort($out,fn($a,$b)=>$b['anzahl']<=>$a['anzahl']?:strcmp($a['name'],$b['name']));
        return $out;
    };
    $status=[];$groups=[];$new=[];$inactive=[];$holidays=0;
    $matrix=[];
    foreach(['Mittlerer Dienst','Gehobener Dienst','Polizeirat','Leitungsdienst','Nicht zugeordnet'] as $name)
        $matrix[$name]=['gruppe'=>$name,'hauptberuf'=>0,'nebenberuf'=>0,'gesamt'=>0];
    $totals=['hauptberuf'=>0,'nebenberuf'=>0,'gesamt'=>0];
    foreach($current as $p){
        $st=(string)$p['status'];
        $group=(string)($p['gruppe']?:'Nicht zugeordnet');
        $status[$st]=($status[$st]??0)+1;
        $groups[$group]=($groups[$group]??0)+1;
        $key=($p['beschaeftigungsart']??'')==='Nebenberuf'?'nebenberuf':'hauptberuf';
        $keyGroup=isset($matrix[$group])?$group:'Nicht zugeordnet';
        $matrix[$keyGroup][$key]++;$matrix[$keyGroup]['gesamt']++;
        $totals[$key]++;$totals['gesamt']++;
        if($has('pers')){
            $start=metricsDate($p['eintrittsdatum']??null);
            $offset=metricsDayOffset($start,$today);
            if($offset!==null&&$offset<=0&&$offset>=-29)
                $new[]=['name'=>trim(($p['vorname']??'').' '.($p['nachname']??'')),
                    'gruppe'=>$p['gruppe']??'','eintritt'=>$start];
            $begin=metricsDate($p['urlaub_von']??null);$end=metricsDate($p['urlaub_bis']??null);
            if($begin&&$end&&$begin<=$todayIso&&$end>=$todayIso)$holidays++;
            if(in_array($st,['Abgemeldet','Suspendiert','Inaktiv'],true))
                $inactive[]=['nummer'=>$p['personalnummer'],
                    'name'=>trim(($p['vorname']??'').' '.($p['nachname']??'')),
                    'status'=>$st,'dienstgrad'=>$p['dienstgrad']??''];
        }
    }
    usort($new,fn($a,$b)=>strcmp($b['eintritt'],$a['eintritt']));
    $d['dashboard']['neueinstellungen']=array_slice($new,0,8);
    $d['dashboard']['inaktiv']=$inactive;
    $d['dashboard']['statusverteilung']=$sortCounts($status);
    $d['dashboard']['gruppen']=$sortCounts($groups);
    $d['dashboard']['beschaeftigung']=['summen'=>$totals,'gruppen'=>array_values($matrix)];
    $d['dashboard']['summary']['personal']=count($current);
    $d['dashboard']['summary']['aktiv']=$status['Aktiv']??0;
    $d['dashboard']['summary']['neu30']=$has('pers')?count($new):null;
    $d['dashboard']['summary']['urlaub']=$has('pers')?$holidays:null;
    $disciplinary=0;
    if($has('dis')){
        foreach($d['disziplin'] as $case){
            $some=!empty($case['massnahmen']);
            foreach($case['slots'] as $slot)
                if(is_array($slot)&&(!empty($slot['done'])||!empty($slot['t'])||!empty($slot['u'])||!empty($slot['d'])))
                    $some=true;
            if($some)$disciplinary++;
        }
    }
    $d['dashboard']['summary']['disziplinFaelle']=$disciplinary;
    $due=[];$ranks=[];
    if($has('bef')){
        require_once __DIR__.'/PromotionGuidelines.php';
        foreach($d['raenge'] as $rank)$ranks[$rank['name']]=$rank;
        foreach($current as $p){
            $rank=$ranks[$p['dienstgrad']??'']??null;
            $next=$ranks[$rank['naechster_rang']??'']??null;
            if(!$next)continue;
            $code=examForRank((string)$p['dienstgrad']);
            $name=trim(($p['vorname']??'').' '.($p['nachname']??''));
            if($code){
                if($next['name']!==$code['ziel']||empty($p['pruefung_bestanden']))continue;
                $due[]=['nummer'=>$p['personalnummer'],'name'=>$name,'dienstgrad'=>$p['dienstgrad'],
                    'naechsterRang'=>$next['name'],'faellig'=>$todayIso,
                    'pruefungsbasiert'=>true,'pruefungstyp'=>$code['code'],
                    'porStatus'=>$p['por_status']??'offen'];
            }else{
                $days=(int)($rank['tage']??0);if($days<=0)continue;
                $date=metricsDate($p['naechste_befoerderung']??null);
                if(!$date&&($last=metricsDate($p['letzte_befoerderung']??null)))
                    $date=(new \DateTimeImmutable($last,new \DateTimeZone('UTC')))
                        ->modify('+'.$days.' days')->format('Y-m-d');
                if(!$date||$date>$todayIso)continue;
                $due[]=['nummer'=>$p['personalnummer'],'name'=>$name,'dienstgrad'=>$p['dienstgrad'],
                    'naechsterRang'=>$next['name'],'faellig'=>$date,
                    'porStatus'=>$p['por_status']??'offen'];
            }
        }
        usort($due,fn($a,$b)=>strcmp($a['faellig'],$b['faellig']));
    }
    $d['dashboard']['faellige']=array_slice($due,0,8);
    $d['dashboard']['summary']['faelligeBef']=$has('bef')?count($due):null;
    foreach([['geburtstage','geb','geburtsdatum',0],['jubilaeen','jub','eintrittsdatum',1]] as $cfg){
        [$target,$right,$field,$min]=$cfg;$events=[];
        if($has($right))foreach($current as $p){
            $anniversary=metricsAnniversary($p[$field]??null,$today,$min);
            if($anniversary===null)continue;
            $events[]=['nummer'=>$p['personalnummer'],
                'name'=>trim(($p['vorname']??'').' '.($p['nachname']??'')),
                'dienstgrad'=>$p['dienstgrad']??'',
                ...$anniversary];
        }
        usort($events,fn($a,$b)=>$a['tage']<=>$b['tage']?:strcmp($a['name'],$b['name']));
        $d['dashboard'][$target]=$events;
    }
}
