<?php
declare(strict_types=1);
namespace IDV;
require_once __DIR__.'/Pruefungen.php';
require_once __DIR__.'/PruefungenKI.php';

function assessmentKiEndpoint(array $u,string $method,int $id): never {
    if($method!=='POST')fail(405,'Nicht erlaubt');
    require_once __DIR__.'/PruefungenKIConfig.php';
    try{$key=examAiKey();}catch(\Throwable $e){fail(503,'KI-Verbindung nicht lesbar. Administrator muss die Verbindung im Prüfungszentrum neu einrichten.');}
    if($key===''||!function_exists('curl_init'))fail(503,'KI noch nicht eingerichtet. Administrator: Assessment Center → KI-Einstellungen.');
    $p=assessmentRow($id);assessmentAccess($p,$u);
    if($p['art']==='praxis'||$p['status']!=='abgegeben'||((int)$p['erst']!==(int)$u['id']&&!assessmentVerwaltung($u)))fail(403,'KI-Vorschläge nur für berechtigte Erstkorrektur.');
    $b=body();if(($b['revision']??null)!==(int)$p['revision'])fail(409,'Prüfung wurde geändert. Neu laden.');
    $i=$b['frage']??null;$q=pruefungRead($p['fragen']);$answers=pruefungRead($p['antworten']);
    if(!is_int($i)||!isset($q[$i])||$q[$i]['typ']!=='text'||!is_string($answers[$i]??null))fail(400,'Nur Freitextfragen werden per KI vorbewertet.');
    if(!empty($q[$i]['bilder']))fail(422,'Bildfrage bitte manuell bewerten; die KI erhält keine Bilder.');
    // Serialize calls for this reviewer to prevent accidental parallel billing.
    $lock='idv_exam_ai_'.(int)$u['id'];
    $got=sql('SELECT GET_LOCK(?,0) AS ok',[$lock]);if((int)($got[0]['ok']??0)!==1)fail(429,'Ein KI-Vorschlag läuft bereits.');
    try{$result=pruefungKiVorschlag($q[$i],$answers[$i],$key);}finally{sql('SELECT RELEASE_LOCK(?)',[$lock]);}
    $current=assessmentRow($id);if((int)$current['revision']!==(int)$p['revision']||$current['status']!=='abgegeben')fail(409,'Prüfung wurde während der KI-Bewertung geändert.');
    respond(200,['frage'=>$i,'vorschlag'=>$result]);
}
