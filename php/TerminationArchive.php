<?php
declare(strict_types=1);
namespace IDV;

/* Original 60-day rule incl. older undated cases. Never mutate archive entries. */
function terminationDateExpr(string $alias='k'): string {
    $statusSwitch="(SELECT MAX(a.zeit) FROM personal_audit a
        JOIN personal p ON p.personalnummer=a.personalnummer
        WHERE a.personalnummer=".$alias.".personalnummer
         AND p.status='Gekündigt'
         AND LOWER(TRIM(COALESCE(p.vorname,'')))=LOWER(TRIM(COALESCE(".$alias.".vorname,'')))
         AND LOWER(TRIM(COALESCE(p.nachname,'')))=LOWER(TRIM(COALESCE(".$alias.".nachname,'')))
         AND p.eintrittsdatum <=> ".$alias.".eintritt
         AND JSON_UNQUOTE(JSON_EXTRACT(a.aenderungen,'$.status.neu'))='Gekündigt')";
    return "COALESCE(".$alias.".kuendigungsdatum,
        DATE(COALESCE(CONVERT_TZ(".$alias.".erfasst_am,'+00:00','Europe/Berlin'),".$alias.".erfasst_am)),
        DATE(COALESCE(CONVERT_TZ(".$statusSwitch.",'+00:00','Europe/Berlin'),".$statusSwitch.")))";
}
function terminationCurrentExpr(string $alias='k'): string {
    return '('.terminationDateExpr($alias).' >= DATE_SUB(UTC_DATE(),INTERVAL 59 DAY))';
}
function terminationListQuery(string $suffix=''): string {
    return "SELECT k.id,k.personalnummer,k.vorname,k.nachname,k.rang,k.grund,k.handy,
      k.vertrag,k.eintritt,k.urkunde,k.zeugnis,k.kuendigung,k.waffe,k.copnet,k.emd,
      k.ic,k.discord,k.dienstgegenstaende,k.anzeige,k.kuendigungsdatum,k.erfasst_am,
      (SELECT MAX(a.zeit) FROM personal_audit a JOIN personal p ON p.personalnummer=a.personalnummer
        WHERE a.personalnummer=k.personalnummer AND p.status='Gekündigt'
          AND LOWER(TRIM(COALESCE(p.vorname,'')))=LOWER(TRIM(COALESCE(k.vorname,'')))
          AND LOWER(TRIM(COALESCE(p.nachname,'')))=LOWER(TRIM(COALESCE(k.nachname,'')))
          AND p.eintrittsdatum <=> k.eintritt
          AND JSON_UNQUOTE(JSON_EXTRACT(a.aenderungen,'$.status.neu'))='Gekündigt') AS statuswechsel_am,
      k.row_revision AS _revision FROM kuendigungen k ".$suffix;
}
function dispatchTerminationArchive(array $u,string $method,string $uri): bool {
    if($method==='GET'&&$uri==='/api/kuendigungen/archiv'){
        needRight($u,'kue');needRight($u,'kuearchiv');
        $where='WHERE ('.terminationCurrentExpr('k').') IS NOT TRUE';
        $order=" ORDER BY ".terminationDateExpr('k')." DESC,k.id DESC LIMIT 2000";
        $rows=sql(terminationListQuery($where.$order));
        foreach($rows as &$r)$r['_revision']=(string)$r['_revision'];
        respond(200,$rows);
    }
    if($method==='GET'&&preg_match('#^/api/kuendigungen/([1-9][0-9]*)/akte$#D',$uri,$m)){
        needRight($u,'kue');$id=cleanId($m[1]);
        $rows=normalizedRows('SELECT k.id,k.personalnummer,k.vorname,k.nachname,k.rang,k.grund,k.eintritt,
            k.kuendigungsdatum,k.erfasst_am,k.vertrag,k.urkunde,k.zeugnis,k.kuendigung,
            k.personal_snapshot,'.terminationCurrentExpr('k').' AS aktuell
            FROM kuendigungen k WHERE k.id=?',[$id],['personal_snapshot']);
        if(!$rows)fail(404,'Kündigung nicht gefunden');
        $r=$rows[0];$rights=rights($u);$isCurrent=(bool)$r['aktuell'];
        if(!$isCurrent&&($rights['kuearchiv']??0)<1)fail(403,'Kein Zugriff auf das Kündigungsarchiv');
        $docs=sql("SELECT typ,titel,url,erstellt FROM generierte_dokumente
           WHERE kontext_id=? AND typ IN ('fristgerecht','fristlos') ORDER BY erstellt DESC,id DESC",[$id]);
        $s=$r['personal_snapshot']??[];
        if(!is_array($s))$s=[];
        $persRight=($rights['pers']??0)>=1;
        $sensitive=$persRight && (int)(sql('SELECT sensibel FROM roles WHERE name=?',[$u['rolle']])[0]['sensibel']??0)===1;
        $personal=null;
        if($persRight&&is_array($s['personal']??null)) {
            $personal=$s['personal'];
            if(!$sensitive)$personal=limited($personal,[
                'personalnummer','vorname','nachname','dienstgrad','status','gruppe',
                'beschaeftigungsart','eintrittsdatum','nebenjob','waffenschein','spind','rsa',
                'letzte_befoerderung','naechste_befoerderung','por_status'
            ]);
        }
        respond(200,[
            'vorgang'=>[
                'id'=>$r['id'],'personalnummer'=>$r['personalnummer'],
                'vorname'=>$r['vorname'],'nachname'=>$r['nachname'],'rang'=>$r['rang'],
                'grund'=>$r['grund'],'eintritt'=>$r['eintritt'],'kuendigungsdatum'=>$r['kuendigungsdatum'],
                'erfasst_am'=>$r['erfasst_am'],'aktuell'=>$isCurrent
            ],
            'dokumente'=>[
                ['name'=>'Arbeitsvertrag','wert'=>$r['vertrag']],['name'=>'Ernennungsurkunde','wert'=>$r['urkunde']],
                ['name'=>'Arbeitszeugnis','wert'=>$r['zeugnis']],['name'=>'Kündigung','wert'=>$r['kuendigung']]
            ],
            'momentaufnahme'=>[
                'quelle'=>$s['quelle']??'unbekannt','gesichert_am'=>$s['gesichert_am']??null,
                'personal'=>$personal,
                'generierte_dokumente'=>$sensitive&&is_array($s['generierte_dokumente']??null)?$s['generierte_dokumente']:[],
                'kuendigungsdokumente_nachtraeglich'=>$docs
            ]
        ]);
    }
    return false;
}
