<?php
declare(strict_types=1);
namespace IDV;

/**
 * Short-lived, authenticated SSE stream for shared PHP hosts.
 * No staff data or audit text is emitted, only a monotonically increasing
 * audit-log or change-journal sequence. Browser reconnect is automatic.
 *
 * Unlike in-memory Node listeners, this works across multiple PHP workers.
 */
function streamChanges(array $user): never {
    @set_time_limit(25);
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-transform');
    header('X-Accel-Buffering: no');
    header('Connection: keep-alive');
    // Some changes produce log entries; row-level MySQL audit triggers write
    // only to idv_aenderungen. Observe BOTH sources to avoid silent updates.
    $head=static function(): array {
        $rows=sql('SELECT (SELECT COALESCE(MAX(id),0) FROM log) AS log_id,
                          (SELECT COALESCE(MAX(id),0) FROM idv_aenderungen) AS journal_id');
        return [(int)$rows[0]['log_id'],(int)$rows[0]['journal_id']];
    };
    [$lastLog,$lastJournal]=$head();
    echo "retry: 3000\n: verbunden\n\n";
    @ob_flush();@flush();
    $started=microtime(true);$lastAuth=$started;
    while((microtime(true)-$started)<19){
        if(connection_aborted())break;
        if(microtime(true)-$lastAuth>=5){
            $session=loggedUser();
            if(!$session||(int)$session['id']!==(int)$user['id'])break;
            $lastAuth=microtime(true);
        }
        [$logId,$journalId]=$head();
        if($logId>$lastLog||$journalId>$lastJournal){
            $lastLog=max($lastLog,$logId);
            $lastJournal=max($lastJournal,$journalId);
            echo "event: aktualisierung\n";
            // No private fields are exposed through the shared event stream.
            echo 'data: '.json_encode(['seq'=>$lastLog.':'.$lastJournal,'bereich'=>'portal'],JSON_THROW_ON_ERROR)."\n\n";
            @ob_flush();@flush();
        }
        usleep(1000000);
    }
    echo ": reconnect\n\n";
    @ob_flush();@flush();
    exit;
}
