<?php
declare(strict_types=1);
namespace IDV;

/* Read-only PHP/MySQL bootstrap pilot.
 * Uses the existing JS data model while preserving module permission checks.
 * All write modules MUST be ported before a productive PHP switch.
 */

function normalizedRows(string $query, array $params=[], array $jsonFields=[]): array {
    $rows=sql($query,$params);
    foreach($rows as &$row){
        foreach($jsonFields as $field){
            if(!array_key_exists($field,$row))continue;
            $v=$row[$field];
            if($v===null)continue;
            if(is_string($v)){
                $decoded=json_decode($v,true);
                if(json_last_error()!==JSON_ERROR_NONE)throw new \RuntimeException('Ungültiger JSON-Wert in '.$field);
                $row[$field]=$decoded;
            }
        }
    }
    unset($row);
    return $rows;
}
function allow(array $rights,string $modul): bool {return ($rights[$modul]??0)>=1;}
function limited(array $row,array $fields): array {
    return array_intersect_key($row,array_fill_keys($fields,true));
}
function routineRoster(array $p,array $staff): array{
    $days=is_array($p['tage']??null)?$p['tage']:[];
    $previous=is_array($p['personen']??null)?$p['personen']:[];
    $old=[];
    foreach($previous as $entry)if(is_array($entry)&&isset($entry['nr']))$old[(int)$entry['nr']]=$entry;
    $now=[];
    foreach($staff as $person){
        if(!in_array($person['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true))continue;
        $nr=(int)$person['personalnummer'];
        $now[$nr]=true;
        $stored=$old[$nr]??null;
        $attendance=is_array($stored['anwesend']??null)&&count($stored['anwesend'])===count($days)
            ?$stored['anwesend']:array_fill(0,count($days),null);
        $result[]=[
            'nr'=>$nr,'vorname'=>$person['vorname']??'','nachname'=>$person['nachname']??'',
            'status'=>$person['status'],
            'eintrittsdatum'=>$person['eintrittsdatum']??'',
            'abgemeldet'=>$stored['abgemeldet']??($person['status']==='Abgemeldet'),
            'anwesend'=>$attendance,'_aktuell'=>true
        ];
    }
    // If the routine has former employees, retain their name and attendance.
    foreach($previous as $entry){
        if(!is_array($entry)||isset($now[(int)($entry['nr']??0)]))continue;
        $name=trim((string)($entry['vorname']??'').' '.(string)($entry['nachname']??''));
        $record=$entry;
        $record['status']='Ehemalig';
        $record['_aktuell']=false;
        $hasEvidence=$name!==''&&$name!=='- -'||
            in_array(true,is_array($entry['anwesend']??null)?$entry['anwesend']:[],true);
        if($hasEvidence)$result[]=$record;
    }
    $result=$result??[];
    usort($result,fn($a,$b)=>((int)$a['nr'])<=>((int)$b['nr']));
    return $result;
}
function handleSystemOptions(array $user): never {
    $result=[];
    foreach(normalizedRows('SELECT schluessel,werte FROM system_optionen ORDER BY schluessel',[],['werte']) as $row)
        $result[(string)$row['schluessel']]=$row['werte'];
    respond(200,$result);
}
function handleBootstrap(array $user): never {
    $rights=rights($user);
    $rolle=(string)$user['rolle'];
    $sensible=sql('SELECT sensibel FROM roles WHERE name=? LIMIT 1',[$rolle]);
    $isSensitive=(bool)($sensible[0]['sensibel']??false);
    $people=normalizedRows('SELECT * FROM personal WHERE administrativ_geloescht_am IS NULL ORDER BY personalnummer');
    $present=array_values(array_filter($people,
        fn($p)=>in_array((string)$p['status'],['Aktiv','Abgemeldet','Inaktiv','Suspendiert'],true)));
    $status=[];
    $groups=[];
    $employment=[];
    foreach($present as $p){
        $st=(string)$p['status'];
        $gr=(string)($p['gruppe']??'Nicht zugeordnet');
        $status[$st]=($status[$st]??0)+1;
        $groups[$gr]=($groups[$gr]??0)+1;
        $art=($p['beschaeftigungsart']??'Hauptberuf')==='Nebenberuf'?'nebenberuf':'hauptberuf';
        $employment[$gr][$art]=($employment[$gr][$art]??0)+1;
    }
    $summary=[
        'personal'=>count($present),'aktiv'=>$status['Aktiv']??0,
        'kuendigungen'=>0,'offeneRueckgaben'=>0,'disziplinFaelle'=>0,
        'neu30'=>null,'urlaub'=>null,'faelligeBef'=>null
    ];
    $statusDistribution=[];
    foreach($status as $k=>$v)$statusDistribution[]=['name'=>$k,'anzahl'=>$v];
    $groupDistribution=[];
    foreach($groups as $k=>$v)$groupDistribution[]=['name'=>$k,'anzahl'=>$v];

    $d=[
        'personal'=>[],
        'raenge'=>[],'funktionsspalten'=>[],'funktionen'=>[],
        'kuendigungen'=>[],'kuendigungsVerknuepfungen'=>new \stdClass(),
        'disziplinSpalten'=>[],'disziplin'=>[],
        'richtlinie'=>['stand'=>'','zeilen'=>[]],
        'checklisten'=>[],'checklistenStatus'=>[],
        'routine'=>[],'sonderzahlungen'=>[],'organigramm'=>[],'befoerderungen'=>[],
        'dashboard'=>[
            'layout'=>['items'=>[],'version'=>0],'bekanntmachungen'=>[],
            'personal'=>[],'vorlagen'=>[],'info'=>[],'links'=>[],
            'summary'=>$summary,'statusverteilung'=>$statusDistribution,
            'gruppen'=>$groupDistribution,'beschaeftigung'=>['gruppen'=>[],'summen'=>[]],
            'inaktiv'=>[],'faellige'=>[],'neueinstellungen'=>[],'geburtstage'=>[],'jubilaeen'=>[]
        ]
    ];

    if(allow($rights,'bef')){
        $d['raenge']=normalizedRows('SELECT * FROM raenge ORDER BY sortierung,name');
        $d['befoerderungen']=normalizedRows('SELECT * FROM befoerderungen ORDER BY nachname');
        $examRows=normalizedRows('SELECT personalnummer,werte FROM sonderfunktionen',[],['werte']);
        $exams=[];
        foreach($examRows as $r)$exams[(int)$r['personalnummer']]=$r['werte']??[];
        foreach($people as &$p){
            $codes=[
                'Polizeimeisteranwärter'=>'PM',
                'Polizeikommissaranwärter'=>'PK',
                'Kriminalkommissaranwärter'=>'KK'
            ];
            $code=$codes[$p['dienstgrad']??'']??null;
            $v=$exams[(int)$p['personalnummer']]??[];
            $p['pruefung_typ']=$code;
            $p['pruefung_bestanden']=$code!==null&&($v[$code]??false)===true;
            $p['pm_pruefung_bestanden']=($v['PM']??false)===true;
        }unset($p);
    }
    if(allow($rights,'sonder')){
        $rows=normalizedRows('SELECT * FROM sonderfunktionen',[],['werte']);
        $d['funktionen']=array_map(fn($r)=>[
            'nr'=>$r['personalnummer'],'leitung'=>$r['leitung']??'',
            'sonstige'=>$r['sonstige']??'','werte'=>$r['werte']??new \stdClass(),
            '_revision'=>(string)($r['row_revision']??'1')
        ],$rows);
        $d['funktionsspalten']=array_column(normalizedRows('SELECT name FROM sonderfunktionsspalten ORDER BY sortierung'),'name');
    }
    if(allow($rights,'dis')){
        $rows=normalizedRows('SELECT * FROM disziplin ORDER BY personalnummer',[],['massnahmen','slots']);
        $d['disziplin']=array_map(fn($r)=>[
            'nr'=>$r['personalnummer'],'massnahmen'=>$r['massnahmen']??[],
            'slots'=>$r['slots']??[],'bemerkung'=>$r['bemerkung']??'',
            '_revision'=>(string)($r['row_revision']??'1')
        ],$rows);
        $d['disziplinSpalten']=array_column(normalizedRows('SELECT name FROM disziplinspalten ORDER BY sortierung'),'name');
        $d['dashboard']['summary']['disziplinFaelle']=count(array_filter($rows,fn($r)=>
            !empty($r['massnahmen'])||!empty($r['slots'])));
    }
    if(allow($rights,'kue')){
        // Latest termination records; date interpretation is provisional.
        $d['kuendigungen']=normalizedRows(
            'SELECT * FROM kuendigungen WHERE COALESCE(kuendigungsdatum,DATE(erfasst_am)) >= DATE_SUB(UTC_DATE(),INTERVAL 59 DAY) ORDER BY nachname,id DESC'
        );
        $d['dashboard']['summary']['kuendigungen']=count($d['kuendigungen']);
        $d['dashboard']['summary']['offeneRueckgaben']=count(array_filter($d['kuendigungen'],function($p){
            foreach(['waffe','copnet','emd','ic','discord','dienstgegenstaende'] as $field)
                if(stripos((string)($p[$field]??''),'offen')!==false)return true;
            return false;
        }));
    }
    if(allow($rights,'rout')){
        $raw=normalizedRows('SELECT * FROM routine ORDER BY sortierung',[],['tage','personen']);
        $d['routine']=array_map(fn($r)=>[
            'id'=>$r['id'],'nr'=>$r['personalnummer']??null,
            'tage'=>$r['tage']??[],'personen'=>routineRoster($r,$people),
            '_revision'=>(string)($r['row_revision']??'1')
        ],$raw);
        $d['sonderzahlungen']=normalizedRows('SELECT * FROM sonderzahlungen ORDER BY nachname');
    }
    if(allow($rights,'chk')){
        $rows=normalizedRows('SELECT * FROM checklisten ORDER BY sortierung',[],['aufgaben']);
        foreach($rows as &$row)$row['_revision']=(string)($row['row_revision']??'1');unset($row);
        $d['checklisten']=$rows;
        $d['checklistenStatus']=normalizedRows('SELECT name,punkt,erledigt FROM checklisten_status');
    }
    if(allow($rights,'rl')){
        $rows=normalizedRows('SELECT * FROM richtlinie ORDER BY sortierung');
        $d['richtlinie']=['stand'=>$rows[0]['stand']??'','zeilen'=>$rows];
    }
    if(allow($rights,'org'))$d['organigramm']=normalizedRows('SELECT * FROM organigramm ORDER BY sortierung');

    if(allow($rights,'dash')){
        $layout=normalizedRows('SELECT items,version FROM dashboard_layout WHERE id=1',[],['items']);
        $d['dashboard']['layout']=$layout[0]??['items'=>[],'version'=>0];
        $d['dashboard']['bekanntmachungen']=normalizedRows('SELECT id,titel,inhalt,erstellt FROM bekanntmachungen ORDER BY erstellt DESC,id DESC LIMIT 30');
        foreach(normalizedRows('SELECT * FROM dashboard ORDER BY sortierung') as $row){
            switch($row['art']){
                case 'personal':$d['dashboard']['personal'][]=['label'=>$row['text'],'anzahl'=>$row['anzahl']];break;
                case 'vorlage':$d['dashboard']['vorlagen'][]=['text'=>$row['text'],'url'=>$row['url']];break;
                case 'info':$d['dashboard']['info'][]=['text'=>$row['text'],'url'=>$row['url']];break;
                case 'link':$d['dashboard']['links'][]=['text'=>$row['text'],'url'=>$row['url']];break;
            }
        }
        if(allow($rights,'pers')){
            $now=new \DateTimeImmutable('now',new \DateTimeZone('Europe/Berlin'));
            $new=[];
            $urlaub=0;
            foreach($present as $p){
                $date=(string)($p['eintrittsdatum']??'');
                if(preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)){
                    $days=(new \DateTimeImmutable($date))->diff(new \DateTimeImmutable($now->format('Y-m-d')))->days;
                    if($date<=$now->format('Y-m-d')&&$days<=29)
                        $new[]=['name'=>trim(($p['vorname']??'').' '.($p['nachname']??'')),
                            'gruppe'=>$p['gruppe']??'','eintritt'=>$date];
                }
                if(($p['urlaub_von']??'')!==null&&($p['urlaub_bis']??'')!==null&&
                   (string)$p['urlaub_von']<=$now->format('Y-m-d')&&(string)$p['urlaub_bis']>=$now->format('Y-m-d'))$urlaub++;
            }
            $d['dashboard']['neueinstellungen']=array_slice($new,0,8);
            $d['dashboard']['summary']['neu30']=count($new);
            $d['dashboard']['summary']['urlaub']=$urlaub;
        }
    }else $d['dashboard']=['personal'=>[],'vorlagen'=>[],'info'=>[],'links'=>[],
         'summary'=>[],'layout'=>['items'=>[],'version'=>0]];
    if(!allow($rights,'pers')){
        if(allow($rights,'sonder')||allow($rights,'dis')||allow($rights,'bef')||allow($rights,'rout')){
            $s=[];
            foreach($people as $p){
                $v=limited($p,['personalnummer','vorname','nachname']);
                if(allow($rights,'dis'))$v['dienstgrad']=$p['dienstgrad']??'';
                if(allow($rights,'bef')){
                    $v=array_merge($v,limited($p,['status','dienstgrad','letzte_befoerderung','naechste_befoerderung',
                        'por_status','por_notiz','por_am','pruefung_typ','pruefung_bestanden','pm_pruefung_bestanden']));
                    $v['ernennungsurkunde_erstellt']=!empty($p['ernennungsurkunde_url']);
                }
                $s[]=$v;
            }
            $d['personal']=$s;
        }
    }elseif(!$isSensitive){
        $s=[];
        foreach($people as $p){
            $v=limited($p,['personalnummer','vorname','nachname','gruppe','beschaeftigungsart','status',
                'dienstgrad','nebenjob','eintrittsdatum','waffenschein','spind','row_revision']);
            $v['_revision']=(string)($p['row_revision']??'1');
            if(allow($rights,'bef')){
                $v=array_merge($v,limited($p,['letzte_befoerderung','naechste_befoerderung',
                    'por_status','por_notiz','por_am','pruefung_typ','pruefung_bestanden','pm_pruefung_bestanden']));
                $v['ernennungsurkunde_erstellt']=!empty($p['ernennungsurkunde_url']);
            }
            $s[]=$v;
        }
        $d['personal']=$s;
    }else{
        foreach($people as &$p)$p['_revision']=(string)($p['row_revision']??'1');unset($p);
        $d['personal']=$people;
    }

    $responseUser=sessionApiUser($user);
    $responseUser['sensibel']=$isSensitive;
    respond(200,['user'=>$responseUser,'daten'=>$d]);
}
