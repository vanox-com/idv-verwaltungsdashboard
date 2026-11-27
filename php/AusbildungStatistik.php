<?php
declare(strict_types=1);
namespace IDV;

require_once __DIR__.'/StatistikFilter.php';

// Only aggregated training data; no answers, tokens, notes or candidate identities.
function ausbildungStatistikProzent($n,$d): ?float {
    return $d>0?round(100*$n/$d,1):null;
}
function ausbildungStatistikErgebnis(array $r): ?array {
    if($r['status']!=='freigegeben'||!is_numeric($r['ergebnis']))return null;
    $q=json_decode((string)$r['fragen'],true);
    if(!is_array($q))return null;
    $max=($r['art']==='praxis'&&($q['schema']??null)==='pm-praxis-v1')?100:array_sum(array_map(static fn($v)=>is_array($v)?(float)($v['punkte']??0):0,$q));
    if($max<=0||!is_numeric($r['grenze']))return null;
    $raw=100*(float)$r['ergebnis']/$max;
    if($raw<0||$raw>100.00001)return null;
    return ['prozent'=>round($raw,2),'bestanden'=>$raw>=(float)$r['grenze']];
}
function ausbildungStatistikTage(?string $date,\DateTimeImmutable $today): ?int {
    if(!$date)return null;
    $d=\DateTimeImmutable::createFromFormat('!Y-m-d',$date,$today->getTimezone());
    return $d&&$d->format('Y-m-d')===$date&&$d<=$today?(int)$d->diff($today)->days:null;
}
function ausbildungStatistikAktuell(array $people,\DateTimeImmutable $today): array {
    $tracks=[];$modules=[];$blocks=[];$ages=['0–6'=>0,'7–13'=>0,'14–29'=>0,'30+'=>0,'Unbekannt'=>0];$ageSum=0;$ageN=0;
    $reasons=['Module'=>'Pflichtmodule offen','RSA'=>'RSA fehlt (PMA)','Stimmen'=>'Stimmenpunkte fehlen (PMA)','DGL Praxis'=>'DGL-Praxis offen','DGL Theorie'=>'DGL-Prüfung offen','Mindestzeit'=>'7-Tage-Mindestzeit offen','Datum'=>'Laufbahnbeginn fehlt'];
    foreach($reasons as $k=>$label)$blocks[$k]=['label'=>$label,'anzahl'=>0];
    foreach(['PMA','PKA','KKA'] as $track)$tracks[$track]=['laufbahn'=>$track,'anzahl'=>0,'bereit'=>0,'moduleFertig'=>0,'moduleGesamt'=>0,'tageSumme'=>0,'tageAnzahl'=>0];
    foreach($people as $a){
        if(statistikTestPerson($a))continue;
        $track=$a['laufbahn'];if(!isset($tracks[$track]))continue;
        $f=$a['fortschritt'];$t=&$tracks[$track];$t['anzahl']++;$t['bereit']+=(int)$f['bereit'];$t['moduleFertig']+=(int)$f['moduleFertig'];$t['moduleGesamt']+=(int)$f['moduleGesamt'];
        $days=ausbildungStatistikTage($a['beginn']??null,$today);
        if($days===null)$ages['Unbekannt']++;else{$ages[$days<7?'0–6':($days<14?'7–13':($days<30?'14–29':'30+'))]++;$ageSum+=$days;$ageN++;$t['tageSumme']+=$days;$t['tageAnzahl']++;}
        unset($t);
        if(!$f['bereit']){
            if($f['moduleGesamt']<1||$f['moduleFertig']<$f['moduleGesamt'])$blocks['Module']['anzahl']++;
            if($track==='PMA'){if(!$f['rsa'])$blocks['RSA']['anzahl']++;if($f['stimmenSaldo']<2.5)$blocks['Stimmen']['anzahl']++;}
            else{
                if(!($f['dgl']['pruefungMoeglich']??false))$blocks['DGL Praxis']['anzahl']++;
                if(!($f['dgl']['pruefung']??false))$blocks['DGL Theorie']['anzahl']++;
                if(!($f['mindestzeit']['erfuellt']??false))$blocks[($f['mindestzeit']['tage']??null)===null?'Datum':'Mindestzeit']['anzahl']++;
            }
        }
        foreach($f['module']??[] as $m){
            $k=$track.'|'.$m['code'];if(!isset($modules[$k]))$modules[$k]=['laufbahn'=>$track,'code'=>$m['code'],'titel'=>$m['titel'],'fertig'=>0,'gesamt'=>0];
            $modules[$k]['gesamt']++;$modules[$k]['fertig']+=(int)$m['abgeschlossen'];
        }
    }
    foreach($tracks as &$t){$t['fortschritt']=ausbildungStatistikProzent($t['moduleFertig'],$t['moduleGesamt']);$t['tage']=$t['tageAnzahl']?round($t['tageSumme']/$t['tageAnzahl'],1):null;unset($t['tageSumme'],$t['tageAnzahl']);}unset($t);
    $total=array_sum(array_column($tracks,'anzahl'));$ready=array_sum(array_column($tracks,'bereit'));
    return ['gesamt'=>$total,'bereit'=>$ready,'quote'=>ausbildungStatistikProzent($ready,$total),'tage'=>$ageN?round($ageSum/$ageN,1):null,'tageAnzahl'=>$ageN,'laufbahnen'=>array_values($tracks),'module'=>array_values($modules),'huerden'=>array_values($blocks),'alter'=>$ages];
}
function ausbildungStatistikPruefungen(array $rows,\DateTimeImmutable $from,\DateTimeImmutable $today,int $days): array {
    $groups=[];foreach(['pm'=>'PM Theorie','pk'=>'Kommissarprüfung','dgl'=>'DGL Theorie','praxis'=>'PM Praxis'] as $k=>$label)$groups[$k]=['label'=>$label,'anzahl'=>0,'bestanden'=>0,'bewertbar'=>0,'summe'=>0];
    $hist=['0–49'=>0,'50–59'=>0,'60–69'=>0,'70–79'=>0,'80–89'=>0,'90–100'=>0];$timeline=[];$step=$days<=30?1:7;
    for($i=0;$i<$days;$i+=$step){$date=$from->modify('+'.$i.' days');$timeline[]=['datum'=>$date->format('Y-m-d'),'bestanden'=>0,'nichtBestanden'=>0,'unbekannt'=>0];}
    $sum=0;$valid=0;$passed=0;$n=0;
    foreach($rows as $r){
        if(statistikTestPerson($r))continue;
        if(!isset($groups[$r['art']]))continue;
        $date=new \DateTimeImmutable($r['datum'],new \DateTimeZone('UTC'));$date=$date->setTimezone($today->getTimezone())->setTime(0,0);
        if($date<$from||$date>$today)continue;
        $idx=intdiv((int)$from->diff($date)->days,$step);
        $g=&$groups[$r['art']];$g['anzahl']++;$n++;$v=ausbildungStatistikErgebnis($r);
        if($v===null){$timeline[$idx]['unbekannt']++;unset($g);continue;}
        $p=$v['prozent'];$g['bewertbar']++;$g['summe']+=$p;$sum+=$p;$valid++;
        if($v['bestanden']){$g['bestanden']++;$passed++;$timeline[$idx]['bestanden']++;}else $timeline[$idx]['nichtBestanden']++;
        $hist[$p<50?'0–49':($p<60?'50–59':($p<70?'60–69':($p<80?'70–79':($p<90?'80–89':'90–100'))))]++;unset($g);
    }
    foreach($groups as &$g){$g['quote']=ausbildungStatistikProzent($g['bestanden'],$g['bewertbar']);$g['schnitt']=$g['bewertbar']?round($g['summe']/$g['bewertbar'],1):null;unset($g['summe']);}unset($g);
    return ['anzahl'=>$n,'bewertbar'=>$valid,'bestanden'=>$passed,'quote'=>ausbildungStatistikProzent($passed,$valid),'schnitt'=>$valid?round($sum/$valid,1):null,'arten'=>array_values($groups),'verteilung'=>$hist,'verlauf'=>$timeline,'intervall'=>$step];
}
function ausbildungStatistikEndpoint(array $u,string $method): never {
    // Level 2 means actual training leadership, including individual leadership grants.
    if(!ausbildungVerwaltungsleitung($u))fail(403,'Ausbildungsstatistiken nur für Ausbildungsleitung, Leitungsdienst und Administratoren.');
    if($method!=='GET')fail(405,'Nicht erlaubt');
    $days=(int)($_GET['tage']??30);if(!in_array($days,[7,30,90,365],true))fail(400,'Ungültiger Zeitraum.');
    $tz=new \DateTimeZone('Europe/Berlin');$today=new \DateTimeImmutable('today',$tz);$from=$today->modify('-'.($days-1).' days');
    $utc=new \DateTimeZone('UTC');$start=$from->setTimezone($utc)->format('Y-m-d H:i:s');$end=$today->modify('+1 day')->setTimezone($utc)->format('Y-m-d H:i:s');
    ausbildungSynchronisierePersonal();
    $people=array_values(array_filter(ausbildungAktuelleAnwaerter(),static fn($a)=>!statistikTestPerson($a)));foreach($people as &$a)$a['fortschritt']=ausbildungFortschritt($a,true);unset($a);
    $current=ausbildungStatistikAktuell($people,$today);
    $trainer=sql("SELECT a.funktion,COUNT(*) AS anzahl FROM ausbildung_ausbilder a JOIN users u ON u.id=a.user_id WHERE a.aktiv=1 AND u.gesperrt=0 AND LOWER(COALESCE(a.name,'')) NOT LIKE '%test%' AND LOWER(COALESCE(u.anzeigename,'')) NOT LIKE '%test%' GROUP BY a.funktion ORDER BY a.funktion");
    $activity=sql("SELECT u.id,u.anzeigename AS name,COALESCE(m.n,0) AS module,COALESCE(s.n,0) AS stimmen,COALESCE(l.n,0) AS unterricht
        FROM users u
        LEFT JOIN (SELECT c.ausbilder_user_id,COUNT(*) n FROM ausbildung_abschluesse c JOIN ausbildung_anwaerter a ON a.id=c.anwaerter_id WHERE c.abgeschlossen=1 AND c.aktualisiert>=? AND c.aktualisiert<? AND LOWER(COALESCE(a.name,'')) NOT LIKE '%test%' GROUP BY c.ausbilder_user_id) m ON m.ausbilder_user_id=u.id
        LEFT JOIN (SELECT s.ausbilder_user_id,COUNT(*) n FROM ausbildung_stimmen s JOIN ausbildung_anwaerter a ON a.id=s.anwaerter_id WHERE s.aktualisiert>=? AND s.aktualisiert<? AND LOWER(COALESCE(a.name,'')) NOT LIKE '%test%' GROUP BY s.ausbilder_user_id) s ON s.ausbilder_user_id=u.id
        LEFT JOIN (SELECT user_id,COUNT(*) n FROM log WHERE zeit>=? AND zeit<? AND aktion LIKE 'Unterricht für % gestartet; Sitzungs-ID %' AND (LOCATE('Teilnehmer: ',aktion)=0 OR LOWER(SUBSTRING_INDEX(SUBSTRING_INDEX(aktion,'Teilnehmer: ',-1),'; Thema:',1)) NOT LIKE '%test%') GROUP BY user_id) l ON l.user_id=u.id
        WHERE LOWER(COALESCE(u.anzeigename,'')) NOT LIKE '%test%' AND NOT EXISTS (SELECT 1 FROM ausbildung_ausbilder t WHERE t.user_id=u.id AND LOWER(COALESCE(t.name,'')) LIKE '%test%') AND COALESCE(m.n,0)+COALESCE(s.n,0)+COALESCE(l.n,0)>0 ORDER BY COALESCE(m.n,0)+COALESCE(s.n,0)+COALESCE(l.n,0) DESC,u.anzeigename",[$start,$end,$start,$end,$start,$end]);
    $exam=null;$statuses=[];$examError=null;
    try{
        require_once __DIR__.'/Pruefungen.php';
        if(pruefungSchema()){
            $rows=sql("SELECT p.kandidat,p.status,p.ergebnis,v.art,v.grenze,v.fragen,COALESCE(p.abgabe_am,p.erstellt_am) AS datum FROM ausbildung_pruefungen p JOIN ausbildung_pruefung_vorlagen v ON v.id=p.vorlage_id WHERE p.status='freigegeben' AND LOWER(COALESCE(p.kandidat,'')) NOT LIKE '%test%' AND COALESCE(p.abgabe_am,p.erstellt_am)>=? AND COALESCE(p.abgabe_am,p.erstellt_am)<?",[$start,$end]);
            $exam=ausbildungStatistikPruefungen($rows,$from,$today,$days);
            $statuses=sql("SELECT status,COUNT(*) AS anzahl FROM ausbildung_pruefungen WHERE LOWER(COALESCE(kandidat,'')) NOT LIKE '%test%' GROUP BY status");
        }else $examError='Prüfungszentrum noch nicht eingerichtet.';
    }catch(\Throwable $e){error_log('IDV Ausbildungsstatistik Prüfungen: '.$e->getMessage());$examError='Prüfungszahlen momentan nicht verfügbar.';}
    respond(200,['stand'=>gmdate('c'),'tage'=>$days,'von'=>$from->format('Y-m-d'),'bis'=>$today->format('Y-m-d'),'aktuell'=>$current,'ausbilder'=>$trainer,'aktivitaet'=>$activity,'pruefungen'=>$exam,'pruefungsstatus'=>$statuses,'pruefungsfehler'=>$examError]);
}
