<?php
declare(strict_types=1);
namespace IDV;

/** Fixed PM assessment, based on Prüfungsdatenbank Muster.xlsx, candidate 1.
 * No personal data or original theory questions are embedded. */
const PRAXIS_SCHEMA='pm-praxis-v1';
function praxisSchema(): array {
    $yn=static fn(string $id,string $label,int $no)=>['id'=>$id,'label'=>$label,'options'=>['Ja'=>0,'Nein'=>$no]];
    $traffic=static fn(string $id,string $label,int $yellow,int $red)=>['id'=>$id,'label'=>$label,'options'=>['grün'=>0,'gelb'=>$yellow,'rot'=>$red]];
    return [
        'version'=>PRAXIS_SCHEMA,'weights'=>['soft'=>5,'drive'=>15,'traffic'=>25,'theory'=>40,'tactics'=>15],
        'labels'=>['soft'=>'Soft Skills','drive'=>'Fahrprüfung','traffic'=>'Verkehrskontrolle','theory'=>'Theorieprüfung','tactics'=>'Taktik'],
        'targetSeconds'=>107,
        'sections'=>[
            'soft'=>[
                ['label'=>'Aktivität','weight'=>50,'criteria'=>[$yn('appearance','Auftreten / Seriösität',20),$traffic('reports','Berichte gepflegt',10,20),$traffic('attendance','An-/Abgemeldet',5,10)]],
                ['label'=>'Verhalten','weight'=>50,'criteria'=>[$yn('suitability','Eignung',100),$yn('interest','Interesse',80),$traffic('orders','Befehle befolgt',20,50),$yn('language','Wortwahl',20)]],
            ],
            'traffic'=>[
                ['label'=>'Theoretisch','weight'=>35,'criteria'=>[$yn('id','Ausweispflicht gekannt?',10),$traffic('personal','Personalien aufgenommen?',10,20),$traffic('objects','3 Gegenstände + Kennzeichen',25,100)]],
                ['label'=>'Sicherheit','weight'=>35,'criteria'=>[$yn('weapons','Waffen griffbereit',30),$yn('safety','Eigensicherung',80),$traffic('persons','Personen durchsucht?',10,30),$yn('vehicle','Fahrzeug durchsucht?',10),$yn('locked','Auto abgeschlossen?',30)]],
                ['label'=>'Kommunikation','weight'=>30,'criteria'=>[$traffic('coord','Absprache',10,20),$traffic('radio','Funken',20,40),$traffic('authority','Autorität',10,20),$traffic('instructions','Anweisungen',20,40)]],
            ],
            'tactics'=>[
                ['label'=>'Sicherheit','weight'=>50,'criteria'=>[$traffic('perimeter','Rundumsicherung',20,40),$traffic('risk','Risikominimierung',15,40),$traffic('safety','Eigensicherung',50,80),$traffic('rooms','Räume gecleant?',20,50),$traffic('movement','Bewegungsmuster',10,30)]],
                ['label'=>'Professionalität','weight'=>20,'criteria'=>[$traffic('authority','Autorität',25,80),$traffic('persons','Umgang mit Personen',30,60)]],
                ['label'=>'Kommunikation','weight'=>20,'criteria'=>[$traffic('coord','Absprache',30,60),$traffic('radio','Funken',25,50)]],
                ['label'=>'Taktik','weight'=>10,'criteria'=>[$traffic('gun','Gun-Point',20,50),$traffic('planning','Einsatzplanung',20,50)]],
            ],
        ],
        'drive'=>[
            ['id'=>'code','label'=>'Code 3 beachtet?','options'=>['Ja'=>0,'Nein'=>100]],
            ['id'=>'defect','label'=>'Defekt?','options'=>['Nein'=>0,'Ja'=>100]],
            ['id'=>'damage','label'=>'Schäden am Wagen?','options'=>['keine'=>0,'leicht'=>7,'mittel'=>15,'schwer'=>20]],
            ['id'=>'route','label'=>'Vom Weg abgekommen?','options'=>['0-3x'=>0,'4-5x'=>20,'6x+'=>30]],
        ],
    ];
}
function praxisMarker(array $p): bool {
    return ($p['art']??'')==='praxis'&&(pruefungRead($p['fragen'])['schema']??null)===PRAXIS_SCHEMA;
}
function praxisStatus(?float $value,bool $theory=false): string {
    if($value===null)return 'Offen';
    return $value>=($theory?75:80)?'Bestanden':($value>=70?'Nachprüfung erforderlich':'Nicht bestanden');
}
function praxisNumber($v,float $max=1000): float {
    if(!is_int($v)&&!is_float($v))fail(400,'Numerische Minuspunkte oder Zeit erforderlich');
    if(!is_finite((float)$v)||$v<0||$v>$max||abs($v*100-round($v*100))>0.00001)fail(400,'Ungültiger Zahlenwert');
    return (float)$v;
}
function praxisText($v): string {return pruefungText($v??'',4000,false);}
function praxisNormalize(array $input): array {
    $schema=praxisSchema();$out=['sections'=>[],'drive'=>['rounds'=>[]],'notes'=>praxisText($input['notes']??'')];
    foreach($schema['sections'] as $key=>$groups){
        $src=$input['sections'][$key]??[];$answers=[];
        foreach($groups as $group)foreach($group['criteria'] as $q){
            $value=$src['answers'][$q['id']]??'';
            if(!is_string($value)||($value!==''&&!array_key_exists($value,$q['options'])))fail(400,'Ungültige Auswahl: '.$q['label']);
            $answers[$q['id']]=$value;
        }
        $out['sections'][$key]=['answers'=>$answers,'extra'=>praxisNumber($src['extra']??0),'notes'=>praxisText($src['notes']??''),'extraNote'=>praxisText($src['extraNote']??'')];
    }
    $src=$input['drive']??[];
    for($i=0;$i<3;$i++){
        $r=$src['rounds'][$i]??[];$seconds=$r['seconds']??null;
        if($seconds!==null&&(!is_int($seconds)||$seconds<1||$seconds>3599))fail(400,'Fahrzeit als ganze Sekunden zwischen 1 und 3599 eingeben');
        $a=['seconds'=>$seconds];
        foreach($schema['drive'] as $q){
            $v=$r[$q['id']]??'';
            if(!is_string($v)||($v!==''&&!array_key_exists($v,$q['options'])))fail(400,'Ungültige Auswahl: '.$q['label']);
            $a[$q['id']]=$v;
        }
        $out['drive']['rounds'][]=$a;
    }
    $selected=$src['selected']??null;
    if($selected!==null&&(!is_int($selected)||$selected<0||$selected>2))fail(400,'Ungültige Rundenauswahl');
    $out['drive']+=['selected'=>$selected,'extra'=>praxisNumber($src['extra']??0),'extraNote'=>praxisText($src['extraNote']??''),'notes'=>praxisText($src['notes']??'')];
    return $out;
}
function praxisCalculate(array $data,?array $theory): array {
    $schema=praxisSchema();$modules=[];$breakdown=[];$rounds=[];
    foreach($schema['sections'] as $key=>$groups){
        $s=$data['sections'][$key];$loss=0;$complete=true;$items=[];
        foreach($groups as $group){
            $sum=0;$done=true;
            foreach($group['criteria'] as $q){
                $v=$s['answers'][$q['id']]??'';
                if($v===''){$complete=false;$done=false;continue;}
                $sum+=$q['options'][$v];
            }
            $deduction=$sum*$group['weight']/100;$loss+=$deduction;
            $items[]=['label'=>$group['label'],'weight'=>$group['weight'],'deduction'=>round($deduction,2),'complete'=>$done];
        }
        $modules[$key]=$complete?round(max(0,100-$loss-$s['extra']),2):null;$breakdown[$key]=$items;
    }
    foreach($data['drive']['rounds'] as $r){
        $complete=$r['seconds']!==null;$safety=0;
        foreach($schema['drive'] as $q){$v=$r[$q['id']]??'';if($v===''){$complete=false;continue;}$safety+=$q['options'][$v];}
        $delta=$r['seconds']===null?null:abs($r['seconds']-$schema['targetSeconds']);
        $time=$delta===null?null:($delta<=2?0:($delta<=5?20:($delta<=8?40:60)));
        $rounds[]=['seconds'=>$r['seconds'],'difference'=>$delta,'timeDeduction'=>$time===null?null:$time*.3,'safetyDeduction'=>$safety*.7,'score'=>$complete?round(max(0,100-$time*.3-$safety*.7),2):null];
    }
    $best=null;foreach($rounds as $i=>$r)if($r['score']!==null&&($best===null||$r['score']>$rounds[$best]['score']))$best=$i;
    $selected=$data['drive']['selected']??$best;
    $modules['drive']=$selected===null||$rounds[$selected]['score']===null?null:round(max(0,$rounds[$selected]['score']-$data['drive']['extra']),2);
    $modules['theory']=$theory===null?null:round((float)$theory['punkte']/(float)$theory['max']*100,2);
    $total=0;$complete=true;$results=[];
    foreach($schema['weights'] as $k=>$weight){$v=$modules[$k]??null;if($v===null)$complete=false;$weighted=$v===null?null:($k==='theory'?(float)$theory['punkte']/(float)$theory['max']*$weight:$v*$weight/100);$total+=$weighted??0;
        $results[$k]=['percent'=>$v,'weight'=>$weight,'weighted'=>$weighted===null?null:round($weighted,2),'status'=>praxisStatus($v,$k==='theory')];}
    // All three rounds must be recorded before completion; the best complete round is preselected.
    foreach($rounds as $r)if($r['score']===null)$complete=false;
    return ['modules'=>$results,'breakdown'=>$breakdown,'rounds'=>$rounds,'best'=>$best,'selected'=>$selected,'total'=>$complete?round($total,2):null,'status'=>praxisStatus($complete?round($total,2):null)];
}
function praxisTheory(int $aid): ?array {
    $rows=sql("SELECT p.id,p.ergebnis,p.abgabe_am,v.fragen FROM ausbildung_pruefungen p JOIN ausbildung_pruefung_vorlagen v ON v.id=p.vorlage_id WHERE p.anwaerter_id=? AND v.art='pm' AND p.status='freigegeben' AND p.ergebnis IS NOT NULL ORDER BY p.id DESC LIMIT 1",[$aid]);
    if(!$rows)return null;$r=$rows[0];$max=array_sum(array_map(fn($q)=>(float)$q['punkte'],pruefungRead($r['fragen'])));
    if($max<=0)return null;return ['id'=>(int)$r['id'],'punkte'=>(float)$r['ergebnis'],'max'=>$max,'abgabe'=>$r['abgabe_am']];
}
function praxisEligible(array $a): bool {return $a['laufbahn']==='PMA'&&ausbildungPersonalQuelleGueltig($a)&&ausbildungFortschritt($a)['bereit'];}
function praxisTemplate(int $uid): int {
    $title='PM-Praxisprüfung · Bewertungsbogen v1';
    $r=sql("SELECT id FROM ausbildung_pruefung_vorlagen WHERE art='praxis' AND JSON_UNQUOTE(JSON_EXTRACT(fragen,'$.schema'))=? ORDER BY id LIMIT 1",[PRAXIS_SCHEMA]);
    if($r)return (int)$r[0]['id'];
    sql("INSERT INTO ausbildung_pruefung_vorlagen(art,titel,minuten,grenze,fragen,erstellt_von) VALUES('praxis',?,0,80,?,?)",[$title,pruefungJson(['schema'=>PRAXIS_SCHEMA]),$uid]);return (int)db()->lastInsertId();
}
function dispatchPraxis(array $u,string $method,string $uri): bool {
    $root='/api/ausbildung/pruefungen/praxis';if($uri!==$root&&!str_starts_with($uri,$root.'/'))return false;
    $uid=(int)$u['id'];$lead=ausbildungLeitung($u);$manager=pruefungVerwaltung($u);
    if($uri===$root&&$method==='GET'){
        ausbildungSynchronisierePersonal();$candidates=[];
        foreach(ausbildungAktuelleAnwaerter() as $a)if(praxisEligible($a)){
            $candidates[]=array_intersect_key($a,array_flip(['id','name','personalnummer']))+['theorie'=>praxisTheory((int)$a['id'])];
        }
        respond(200,['schema'=>praxisSchema(),'anwaerter'=>$candidates]);
    }
    if($uri===$root&&$method==='POST'){
        $b=body();$aid=(int)($b['anwaerter']??0);$first=(int)($b['pruefer']??0);$date=ausbildungDatum($b['termin']??null);
        if(!$date||!pruefungReviewer($first)||(!$lead&&$first!==$uid))fail(400,'Prüfungstermin und einen berechtigten Prüfer auswählen');
        $pdo=db();$pdo->beginTransaction();try{
            $a=ausbildungAnwaerter($aid,true);if(!praxisEligible($a))fail(409,'PMA ist laut aktuellem PMA-Monitor noch nicht zur Prüfung zugelassen.');
            $vid=praxisTemplate($uid);
            $payload=['schema'=>PRAXIS_SCHEMA,'termin'=>$date,'formular'=>praxisNormalize([]),'theorie'=>null];
            sql("INSERT INTO ausbildung_pruefungen(vorlage_id,anwaerter_id,kandidat,laufbahn,erst,zweit,status,token_hash,token_ablauf,antworten,bewertung,protokoll,fokus) VALUES(?,?,?,?,?,0,'abgegeben',?,UTC_TIMESTAMP(6),?,'[]',?,'{\"wechsel\":0,\"events\":[]}')",[$vid,$aid,$a['name'],'PMA',$first,hash('sha256',random_bytes(32)),pruefungJson($payload),pruefungJson([['am'=>gmdate('c'),'aktion'=>'Praxisprüfung angelegt','user'=>$uid]])]);
            $id=(int)$pdo->lastInsertId();$pdo->commit();respond(201,['id'=>$id]);
        }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    if(!preg_match('#^/api/ausbildung/pruefungen/praxis/([1-9][0-9]*)$#D',$uri,$m))fail(404,'Praxisprüfung nicht gefunden');
    $id=(int)$m[1];
    if($method==='GET'){
        $p=pruefungRow($id);pruefungAccess($p,$u);if(!praxisMarker($p))fail(404,'Kein strukturierter Praxisbogen');
        $payload=pruefungRead($p['antworten']);$theory=$p['status']==='abgegeben'?praxisTheory((int)$p['anwaerter_id']):$payload['theorie'];
        $reviewer=sql('SELECT anzeigename FROM users WHERE id=?',[(int)$p['erst']])[0]['anzeigename']??'';
        respond(200,['schema'=>praxisSchema(),'pruefung'=>array_intersect_key($p,array_flip(['id','kandidat','erst','status','revision','ergebnis'])),'pruefer'=>$reviewer,'termin'=>$payload['termin'],'formular'=>$payload['formular'],'theorie'=>$theory,'auswertung'=>praxisCalculate($payload['formular'],$theory),'bearbeiten'=>$p['status']==='abgegeben'&&((int)$p['erst']===$uid||$manager),'berichtigen'=>$manager&&$p['status']==='freigegeben','protokoll'=>pruefungRead($p['protokoll'])]);
    }
    if($method!=='POST')fail(405,'Nicht erlaubt');
    $b=body();$pdo=db();$pdo->beginTransaction();
    try{
        $p=pruefungRow($id,true);pruefungAccess($p,$u);if(!praxisMarker($p))fail(404,'Kein strukturierter Praxisbogen');
        if(($b['revision']??null)!==(int)$p['revision'])fail(409,'Prüfung wurde zwischenzeitlich geändert. Neu laden.');
        $action=$b['aktion']??'';
        if(!in_array($action,['speichern','abschliessen','berichtigen'],true))fail(400,'Unbekannte Aktion');
        $correction=$action==='berichtigen';
        if($correction?(!$manager||$p['status']!=='freigegeben'):($p['status']!=='abgegeben'||((int)$p['erst']!==$uid&&!$manager)))fail(403,'Keine Bearbeitungsberechtigung');
        $reason=praxisText($b['begruendung']??'');if($correction&&$reason==='')fail(400,'Begründung erforderlich');
        $payload=pruefungRead($p['antworten']);$old=$payload;
        $payload['formular']=praxisNormalize($b['formular']??[]);
        $theory=$correction?$payload['theorie']:praxisTheory((int)$p['anwaerter_id']);
        $result=praxisCalculate($payload['formular'],$theory);
        if($action!=='speichern'&&$result['total']===null)fail(400,'Alle Kriterien, drei Fahrversuche und ein freigegebenes PM-Theorieergebnis sind erforderlich.');
        $payload['theorie']=$theory;$status=$action==='speichern'?'abgegeben':'freigegeben';
        $history=pruefungHistorie($p,$action,$uid,$reason);
        if($correction){$history[count($history)-1]['vorher']=$old;$history[count($history)-1]['nachher']=$payload;}
        sql('UPDATE ausbildung_pruefungen SET antworten=?,ergebnis=?,status=?,revision=revision+1,protokoll=?,abgabe_am=IF(?=\'freigegeben\',UTC_TIMESTAMP(6),abgabe_am) WHERE id=?',[pruefungJson($payload),$result['total'],$status,pruefungJson($history),$status,$id]);
        $pdo->commit();respond(200,['ok'=>true,'auswertung'=>$result,'revision'=>(int)$p['revision']+1]);
    }catch(\Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
}
