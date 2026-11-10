<?php
declare(strict_types=1);
namespace IDV;

function dispatchPersonnelHistory(array $u,string $method,string $uri): bool {
    if($method==='GET'&&preg_match('#^/api/personal/([1-9][0-9]*)/verlauf$#D',$uri,$m)){
        needRight($u,'pers');needRight($u,'persverlauf');
        $nr=cleanId($m[1]);$p=sql('SELECT personalnummer,eintrittsdatum FROM personal WHERE personalnummer=?',[$nr]);
        if(!$p)fail(404,'Personalakte nicht gefunden');
        $events=[];
        if(!empty($p[0]['eintrittsdatum']))$events[]=[
            'zeit'=>$p[0]['eintrittsdatum'],'aktion'=>'Eintritt in den Dienst','art'=>'eintritt'
        ];
        $pattern='(Personal|Personalnummer|Disziplinarakte|Kündigung automatisch angelegt):? '.$nr.'([^0-9]|$)';
        $rights=rights($u);
        $log=sql("SELECT l.zeit,l.aktion,l.art,COALESCE(us.anzeigename,'–') AS benutzer
            FROM log l LEFT JOIN users us ON us.id=l.user_id
            WHERE REGEXP_LIKE(l.aktion,?,'i') ORDER BY l.zeit DESC LIMIT 100",[$pattern]);
        foreach($log as $x)if(($rights['dis']??0)>=1||!str_starts_with($x['aktion'],'Disziplinarakte'))$events[]=$x;
        $audit=normalizedRows("SELECT a.zeit,a.aenderungen,COALESCE(us.anzeigename,'–') AS benutzer
            FROM personal_audit a LEFT JOIN users us ON us.id=a.user_id
            WHERE a.personalnummer=? ORDER BY a.zeit DESC LIMIT 100",[$nr],['aenderungen']);
        foreach($audit as $a){
            foreach($a['aenderungen']??[] as $field=>$values){
                $old=(string)($values['alt']??'–');$new=(string)($values['neu']??'–');
                $events[]=['zeit'=>$a['zeit'],'aktion'=>$field.': '.$old.' → '.$new,
                    'benutzer'=>$a['benutzer'],'art'=>'aenderung'];
            }
        }
        if(($rights['dis']??0)>=1){
            $ds=normalizedRows('SELECT slots FROM disziplin WHERE personalnummer=?',[$nr],['slots']);
            $names=['Ermahnung','Verwarnung','Abmahnung','Suspendierung','Degradierung','Entlassung'];
            foreach(($ds[0]['slots']??[]) as $i=>$item)
                if(!empty($item['done']))$events[]=['zeit'=>$item['d']??null,
                    'aktion'=>'Disziplinarmaßnahme: '.($item['t']??($names[$i]??'Maßnahme')),
                    'art'=>'disziplin'];
        }
        usort($events,fn($a,$b)=>strcmp((string)($b['zeit']??''),(string)($a['zeit']??'')));
        respond(200,$events);
    }
    if($method==='POST'&&preg_match('#^/api/personal/([1-9][0-9]*)/administrativ-loeschen$#D',$uri,$m)){
        needAdmin($u);$nr=cleanId($m[1]);$b=body();
        if((string)($b['bestaetigung']??'')!==(string)$nr)
            fail(400,'Bitte die Dienstnummer zur Bestätigung exakt eingeben');
        $expected=expectedRevision();
        db()->beginTransaction();
        try{
            $rows=sql('SELECT * FROM personal WHERE personalnummer=? FOR UPDATE',[$nr]);
            if(!$rows)fail(404,'Personaldatensatz nicht gefunden');
            $p=$rows[0];
            if($p['administrativ_geloescht_am']!==null)fail(409,'Der Eintrag ist bereits im Papierkorb');
            if((string)$p['row_revision']!==$expected)versionConflict();
            if($p['status']==='Gekündigt')fail(409,'Gekündigte Personalakten werden über Kündigungen verwaltet');
            unset($p['row_revision']);
            $name=trim(($p['vorname']??'').' '.($p['nachname']??''))?:'Unbenannter Personaldatensatz';
            sql("INSERT INTO idv_papierkorb(bereich,schluessel,titel,datensatz,geloescht_von)
                VALUES('personal',?,?,?,?)",[
                (string)$nr,'Personalnummer '.$nr.' · '.$name,
                json_encode($p,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$u['id']
            ]);
            sql('UPDATE personal SET administrativ_geloescht_am=UTC_TIMESTAMP(6),administrativ_geloescht_von=?
                WHERE personalnummer=?',[$u['id'],$nr]);
            auditAction($u,'Personalnummer '.$nr.' administrativ in Papierkorb verschoben','del');
            db()->commit();
        }catch(\Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        respond(200,['ok'=>true,'personalnummer'=>$nr,'im_papierkorb'=>true]);
    }
    return false;
}
