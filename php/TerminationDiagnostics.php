<?php
declare(strict_types=1);
namespace IDV;

/**
 * Read-only diagnostic for a failing personnel-status-to-termination transition.
 * Never returns person records, SQL error texts, or authentication secrets.
 * Only a signed-in Administrator can inspect schema readiness.
 */
function dispatchTerminationDiagnostics(array $user,string $method,string $uri): bool {
    if($uri!=='/api/system/kuendigungscheck')return false;
    if(($user['rolle']??'')!=='Administrator')
        fail(403,'Nur Administratoren dürfen den Kündigungs-Datenbankcheck ausführen');
    if($method!=='GET')fail(405,'Methode nicht erlaubt');

    $required=[
        'personal'=>['personalnummer','row_revision','status','vorname','nachname','dienstgrad',
            'handy','eintrittsdatum','arbeitsvertrag','arbeitsvertrag_url',
            'ernennungsurkunde','ernennungsurkunde_url'],
        'kuendigungen'=>['id','personalnummer','vorname','nachname','rang','grund','handy',
            'vertrag','eintritt','urkunde','personal_snapshot','erfasst_am','kuendigungsdatum'],
        'personalnummer_neubelegungen'=>['personalnummer','zeit'],
        'generierte_dokumente'=>['personalnummer','typ','titel','url','erstellt'],
        'personal_audit'=>['personalnummer','user_id','aenderungen'],
        'log'=>['user_id','aktion','art']
    ];
    $rows=sql(
        "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('personal','kuendigungen',
         'personalnummer_neubelegungen','generierte_dokumente','personal_audit','log')"
    );
    $present=[];
    foreach($rows as $r)$present[(string)$r['TABLE_NAME']][(string)$r['COLUMN_NAME']]=true;
    $missing=[];
    foreach($required as $table=>$columns)
        foreach($columns as $column)
            if(!isset($present[$table][$column]))$missing[]=$table.'.'.$column;

    $triggers=sql("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='personal'");
    $revisionTrigger=false;
    foreach($triggers as $r)
        if(($r['TRIGGER_NAME']??'')==='idv_rev_personal_bu')$revisionTrigger=true;

    respond(200,[
        'bereit'=>count($missing)===0&&$revisionTrigger,
        'fehlende_spalten'=>$missing,
        'personal_revision_trigger'=>$revisionTrigger,
        'hinweis'=>count($missing)>0?
            'Abweichung zwischen PHP-Code und MySQL-Datenbankschema. Vor einer Schema-Reparatur Datenbank sichern.':
            (!$revisionTrigger?
                'MySQL-Trigger für Revisionsschutz fehlt. Bitte vor Reparatur die Datenbank sichern.':
                'Schema-Grundprüfung erfolgreich. Für den konkreten Fehler wird die PHP-Fehlerprotokollierung benötigt.')
    ]);
}
