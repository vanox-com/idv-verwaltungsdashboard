<?php
declare(strict_types=1);
namespace IDV;

/** Shared dashboard character configuration; no external text service required. */
function dashboardFigurPersonen(): array {
    return ['jonas-schulz','tobias-schneider','tobias-renner','lou-beckenbauer'];
}
function dashboardFigurKategorien(): array {
    return ['humor','philosophie','fakten','motivation','dienst','polizei'];
}
function dashboardFigurStandardPool(): array {
    return json_decode('[{"id":"standard-humor-1","kategorie":"humor","text":"Ich wollte heute produktiv sein. Dann hat jemand eine Besprechung angesetzt.","aktiv":true},{"id":"standard-philosophie-1","kategorie":"philosophie","text":"Wenn der Weg das Ziel ist, warum gibt es dann Navigationsgeräte?","aktiv":true},{"id":"standard-fakten-1","kategorie":"fakten","text":"Ein Oktopus hat drei Herzen.","aktiv":true},{"id":"standard-motivation-1","kategorie":"motivation","text":"Auch kleine Fortschritte zählen.","aktiv":true},{"id":"standard-dienst-1","kategorie":"dienst","text":"Der Dienstplan ist eine Empfehlung des Universums. Die Realität hat Einspruch eingelegt.","aktiv":true},{"id":"standard-polizei-1","kategorie":"polizei","text":"Die Funkdisziplin beginnt dort, wo der Monolog endet.","aktiv":true},{"id":"standard-humor-2","kategorie":"humor","text":"Mein Kaffee hat heute mehr Dienstjahre als ich.","aktiv":true},{"id":"standard-philosophie-2","kategorie":"philosophie","text":"Wer immer recht haben will, hat selten Zeit, etwas Neues zu lernen.","aktiv":true},{"id":"standard-fakten-2","kategorie":"fakten","text":"Bananen sind botanisch gesehen Beeren, Erdbeeren dagegen nicht.","aktiv":true},{"id":"standard-motivation-2","kategorie":"motivation","text":"Ein guter Dienst beginnt mit einem guten Miteinander.","aktiv":true},{"id":"standard-dienst-2","kategorie":"dienst","text":"Wer den Funk hört, aber nichts versteht, hat immerhin Empfang.","aktiv":true},{"id":"standard-polizei-2","kategorie":"polizei","text":"Einsatzbereit? Erst mal prüfen, ob der Kaffee auch bereit ist.","aktiv":true},{"id":"standard-humor-3","kategorie":"humor","text":"Wer früher aufsteht, ist länger müde.","aktiv":true},{"id":"standard-philosophie-3","kategorie":"philosophie","text":"Nicht jede offene Frage braucht sofort eine Antwort. Manche brauchen Kaffee.","aktiv":true},{"id":"standard-fakten-3","kategorie":"fakten","text":"Die Venus benötigt für eine Umdrehung um ihre Achse länger als für einen Umlauf um die Sonne.","aktiv":true},{"id":"standard-motivation-3","kategorie":"motivation","text":"Heute musst du nicht perfekt sein. Heute reicht Fortschritt.","aktiv":true},{"id":"standard-dienst-3","kategorie":"dienst","text":"Der Kaffee ist einsatzbereit. Die Motivation wird nachgeführt.","aktiv":true},{"id":"standard-polizei-3","kategorie":"polizei","text":"Blaulicht ersetzt keine gute Kommunikation.","aktiv":true},{"id":"standard-humor-4","kategorie":"humor","text":"Wenn Plan A nicht klappt, gibt es noch 25 Buchstaben.","aktiv":true},{"id":"standard-philosophie-4","kategorie":"philosophie","text":"Auch Umwege können dich an den richtigen Ort bringen.","aktiv":true},{"id":"standard-fakten-4","kategorie":"fakten","text":"Wombats produzieren würfelförmigen Kot.","aktiv":true},{"id":"standard-motivation-4","kategorie":"motivation","text":"Mach eine Sache richtig, bevor du zehn Dinge gleichzeitig anfängst.","aktiv":true},{"id":"standard-dienst-4","kategorie":"dienst","text":"Der Bericht schreibt sich nicht von allein. Wir haben es getestet.","aktiv":true},{"id":"standard-polizei-4","kategorie":"polizei","text":"Die beste Verfolgungsjagd ist die nach der richtigen Akte.","aktiv":true},{"id":"standard-humor-5","kategorie":"humor","text":"Ich bin nicht langsam. Ich arbeite im Energiesparmodus.","aktiv":true},{"id":"standard-philosophie-5","kategorie":"philosophie","text":"Ein leerer Schreibtisch ist entweder Ordnung oder ein sehr guter Trick.","aktiv":true},{"id":"standard-fakten-5","kategorie":"fakten","text":"Haie existierten bereits, bevor die ersten Bäume entstanden.","aktiv":true},{"id":"standard-motivation-5","kategorie":"motivation","text":"Das Team ist stärker, wenn alle einander unterstützen.","aktiv":true},{"id":"standard-dienst-5","kategorie":"dienst","text":"Eine kurze Lagebesprechung ist eine Besprechung, die kurz geplant war.","aktiv":true},{"id":"standard-polizei-5","kategorie":"polizei","text":"Das Präsidium hat viele Türen. Der schnellste Weg führt trotzdem oft über die Kollegen.","aktiv":true},{"id":"standard-humor-6","kategorie":"humor","text":"Die wichtigste Taste im Büro? Die Kaffeemaschine.","aktiv":true},{"id":"standard-philosophie-6","kategorie":"philosophie","text":"Wer den roten Faden verliert, kann immer noch einen neuen knüpfen.","aktiv":true},{"id":"standard-fakten-6","kategorie":"fakten","text":"Pinguine haben Knie, auch wenn man sie kaum sieht.","aktiv":true},{"id":"standard-motivation-6","kategorie":"motivation","text":"Jede Frage ist eine Chance, etwas zu lernen.","aktiv":true},{"id":"standard-dienst-6","kategorie":"dienst","text":"Ein freier Parkplatz am Präsidium ist ein seltenes Naturereignis.","aktiv":true},{"id":"standard-polizei-6","kategorie":"polizei","text":"Dienstnummer bekannt, Kaffeesorte unbekannt. Ermittlungen laufen.","aktiv":true},{"id":"standard-humor-7","kategorie":"humor","text":"Mein Zeitmanagement ist hervorragend. Nur die Zeit hält sich nicht dran.","aktiv":true},{"id":"standard-philosophie-7","kategorie":"philosophie","text":"Manchmal ist der kürzeste Weg eine gute Pause.","aktiv":true},{"id":"standard-fakten-7","kategorie":"fakten","text":"Die Haut eines Eisbären ist schwarz.","aktiv":true},{"id":"standard-motivation-7","kategorie":"motivation","text":"Bleib neugierig, fair und konzentriert.","aktiv":true},{"id":"standard-dienst-7","kategorie":"dienst","text":"Die Akte ist nicht weg. Sie ist nur auf Erkundung.","aktiv":true},{"id":"standard-polizei-7","kategorie":"polizei","text":"Ein guter Streifenpartner kennt nicht nur die Karte, sondern auch die Pausenzeiten.","aktiv":true},{"id":"standard-humor-8","kategorie":"humor","text":"Ich bin multitaskingfähig: Ich kann gleichzeitig arbeiten und an Feierabend denken.","aktiv":true},{"id":"standard-philosophie-8","kategorie":"philosophie","text":"Ein kluger Mensch weiß, wann er nachfragen sollte.","aktiv":true},{"id":"standard-fakten-8","kategorie":"fakten","text":"Honig kann bei trockener, sauberer Lagerung sehr lange haltbar bleiben.","aktiv":true},{"id":"standard-motivation-8","kategorie":"motivation","text":"Gute Entscheidungen brauchen manchmal einen zweiten Blick.","aktiv":true},{"id":"standard-dienst-8","kategorie":"dienst","text":"Der Feierabend ist in Bearbeitung.","aktiv":true},{"id":"standard-polizei-8","kategorie":"polizei","text":"Die Lage ist übersichtlich. Die Anzahl offener Tabs nicht.","aktiv":true},{"id":"standard-humor-9","kategorie":"humor","text":"Heute ist ein guter Tag, um morgen anzufangen.","aktiv":true},{"id":"standard-philosophie-9","kategorie":"philosophie","text":"Wer nichts verändert, verändert immerhin nichts.","aktiv":true},{"id":"standard-fakten-9","kategorie":"fakten","text":"Ein ausgewachsener Mensch hat normalerweise 206 Knochen.","aktiv":true},{"id":"standard-motivation-9","kategorie":"motivation","text":"Du musst nicht alles wissen, aber wissen, wen du fragen kannst.","aktiv":true},{"id":"standard-dienst-9","kategorie":"dienst","text":"Status 2: Kaffee verfügbar.","aktiv":true},{"id":"standard-polizei-9","kategorie":"polizei","text":"Das Funkgerät hat heute wieder mehr geredet als ich.","aktiv":true},{"id":"standard-humor-10","kategorie":"humor","text":"Geduld ist eine Tugend. WLAN-Ausfälle sind ihr Endgegner.","aktiv":true},{"id":"standard-philosophie-10","kategorie":"philosophie","text":"Die Kunst besteht darin, Wichtiges von Dringendem zu unterscheiden.","aktiv":true},{"id":"standard-fakten-10","kategorie":"fakten","text":"Die Zunge eines Blauwals kann mehrere Tonnen wiegen.","aktiv":true},{"id":"standard-motivation-10","kategorie":"motivation","text":"Der nächste kleine Schritt ist oft der wichtigste.","aktiv":true},{"id":"standard-dienst-10","kategorie":"dienst","text":"Das Wort ‚kurz‘ in einer Besprechung ist nicht immer wörtlich zu nehmen.","aktiv":true},{"id":"standard-polizei-10","kategorie":"polizei","text":"Eine ordentliche Übergabe ist der wahre Endgegner jeder Schicht.","aktiv":true}]',true,512,JSON_THROW_ON_ERROR);
}
function dashboardFigurDefault(string $legacy): array {
    $manual=$legacy!==dashboardSpruchDefault();
    return ['figurModus'=>$manual?'fest':'taeglich','person'=>'jonas-schulz',
        'textModus'=>$manual?'manuell':'gemischt','spruch'=>$legacy,
        'kategorie'=>'humor','kategorien'=>['humor','philosophie','fakten'],
        'intervall'=>'taeglich','nameAnzeigen'=>true,'rolleAnzeigen'=>true,
        'bubble'=>'normal','pool'=>dashboardFigurStandardPool(),'revision'=>0];
}
function dashboardFigurLoad(?string $raw,string $legacy): array {
    if($raw===null)return dashboardFigurDefault($legacy);
    $v=json_decode($raw,true);
    if(!is_array($v)||!is_array($v[0]??null))throw new \RuntimeException('Ungültige Dashboard-Figur-Konfiguration');
    return $v[0];
}
function dashboardFigurRead(): array {
    $rows=sql("SELECT schluessel,werte FROM system_optionen WHERE schluessel IN ('dashboard_figur_v1','dashboard_jonas_spruch')");
    $map=array_column($rows,'werte','schluessel');
    return dashboardFigurLoad($map['dashboard_figur_v1']??null,dashboardSpruchDecode($map['dashboard_jonas_spruch']??null));
}
function dashboardFigurText($value): bool {
    return is_string($value)&&trim($value)!==''&&preg_match('/\A.{1,180}\z/us',trim($value))===1;
}
/** Strict validation of the administrator-supplied configuration. */
function dashboardFigurValidate(array $v): array {
    $enums=['figurModus'=>['fest','taeglich','rotation','login'],
        'person'=>dashboardFigurPersonen(),'textModus'=>['manuell','kategorie','gemischt'],
        'kategorie'=>dashboardFigurKategorien(),'intervall'=>['taeglich','halbtag','login','fest'],
        'bubble'=>['normal','denken','kompakt']];
    $out=[];
    foreach($enums as $key=>$values){
        if(!in_array($v[$key]??null,$values,true))fail(400,'Ungültige Dashboard-Einstellung: '.$key);
        $out[$key]=$v[$key];
    }
    foreach(['nameAnzeigen','rolleAnzeigen'] as $key){
        if(!is_bool($v[$key]??null))fail(400,'Ungültige Anzeigeoption');
        $out[$key]=$v[$key];
    }
    if(!dashboardFigurText($v['spruch']??null))fail(400,'Der Standardspruch muss 1 bis 180 Zeichen enthalten');
    $out['spruch']=trim($v['spruch']);
    $cats=$v['kategorien']??null;
    if(!is_array($cats)||!array_is_list($cats)||count($cats)>6)fail(400,'Ungültige Kategorien');
    foreach($cats as $cat)if(!in_array($cat,dashboardFigurKategorien(),true))fail(400,'Unbekannte Kategorie');
    $out['kategorien']=array_values(array_unique($cats));
    $pool=$v['pool']??null;
    if(!is_array($pool)||!array_is_list($pool)||count($pool)>250)fail(400,'Maximal 250 Inhalte erlaubt');
    $seen=[];$out['pool']=[];
    foreach($pool as $row){
        if(!is_array($row)||!is_string($row['id']??null)||!preg_match('/\A[a-zA-Z0-9_-]{1,64}\z/D',$row['id'])
            ||isset($seen[$row['id']])||!in_array($row['kategorie']??null,dashboardFigurKategorien(),true)
            ||!dashboardFigurText($row['text']??null)||!is_bool($row['aktiv']??null))fail(400,'Ungültiger Inhalt im Spruchpool');
        $seen[$row['id']]=true;
        $out['pool'][]=['id'=>$row['id'],'kategorie'=>$row['kategorie'],'text'=>trim($row['text']),'aktiv'=>$row['aktiv']];
    }
    return $out;
}
function dashboardFigurDay(\DateTimeImmutable $now): int {
    $date=$now->setTimezone(new \DateTimeZone('Europe/Berlin'))->format('Y-m-d');
    return intdiv((new \DateTimeImmutable($date,new \DateTimeZone('UTC')))->getTimestamp(),86400);
}
function dashboardFigurIndex(string $seed,int $count): int {
    return (int)hexdec(substr(hash('sha256',$seed),0,7))%max(1,$count);
}
/** Same daily/half-day content for all users; login mode is stable per authenticated session. */
function dashboardFigurResolve(array $cfg,\DateTimeImmutable $now,string $session): array {
    $day=dashboardFigurDay($now);$people=dashboardFigurPersonen();$person=$cfg['person'];
    switch($cfg['figurModus']){
        case 'taeglich': $order=['jonas-schulz','lou-beckenbauer','tobias-schneider','tobias-renner'];$person=$order[($day+2)%4];break;
        case 'rotation': $person=$people[$day%4];break;
        case 'login': $person=$people[dashboardFigurIndex('figure:'.$session,count($people))];break;
    }
    $text=$cfg['spruch'];$cat=null;
    if($cfg['textModus']!=='manuell'){
        $cats=$cfg['textModus']==='kategorie'?[$cfg['kategorie']]:$cfg['kategorien'];
        $pool=array_values(array_filter($cfg['pool'],static fn($r)=>$r['aktiv']&&in_array($r['kategorie'],$cats,true)));
        if($pool){
            $slot=match($cfg['intervall']){
                'halbtag'=>$day*2+(int)((int)$now->setTimezone(new \DateTimeZone('Europe/Berlin'))->format('G')>=12),
                'login'=>dashboardFigurIndex('text:'.$session,count($pool)),
                'fest'=>0,
                default=>$day
            };
            $entry=$pool[$slot%count($pool)];$text=$entry['text'];$cat=$entry['kategorie'];
        }
    }
    return ['person'=>$person,'spruch'=>$text,'kategorie'=>$cat,'nameAnzeigen'=>$cfg['nameAnzeigen'],
        'rolleAnzeigen'=>$cfg['rolleAnzeigen'],'bubble'=>$cfg['bubble'],'revision'=>$cfg['revision']];
}
function dashboardFigurPublic(?array $cfg=null): array {
    return dashboardFigurResolve($cfg??dashboardFigurRead(),new \DateTimeImmutable('now'),(string)($_COOKIE['session']??''));
}
function dashboardFigurDispatch(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/dashboard-figur')respond(200,dashboardFigurPublic());
    if($uri!=='/api/dashboard-figur/verwaltung')return false;
    needAdmin($u);
    if($method==='GET')respond(200,['config'=>dashboardFigurRead()]);
    if($method!=='PUT')return false;
    $body=body();$revision=$body['revision']??null;$incoming=$body['config']??null;
    if(!is_int($revision)||$revision<0||!is_array($incoming))fail(400,'Ungültige Konfiguration');
    $next=dashboardFigurValidate($incoming);
    db()->beginTransaction();
    try{
        $legacy=dashboardSpruchRead();
        sql("INSERT IGNORE INTO system_optionen(schluessel,werte) VALUES('dashboard_figur_v1',?)",
            [json_encode([dashboardFigurDefault($legacy)],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        $row=sql("SELECT werte FROM system_optionen WHERE schluessel='dashboard_figur_v1' FOR UPDATE");
        $current=dashboardFigurLoad($row[0]['werte']??null,$legacy);
        if($current['revision']!==$revision){db()->rollBack();fail(409,'Die Konfiguration wurde bereits geändert. Bitte neu öffnen und erneut bearbeiten.');}
        $next['revision']=$revision+1;
        sql("UPDATE system_optionen SET werte=?,aktualisiert=UTC_TIMESTAMP(6) WHERE schluessel='dashboard_figur_v1'",
            [json_encode([$next],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        auditAction($u,'Dashboard-Figuren und Sprechblasen-Konfiguration geändert');
        db()->commit();
    }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
    respond(200,['config'=>$next,'anzeige'=>dashboardFigurPublic($next)]);
}
