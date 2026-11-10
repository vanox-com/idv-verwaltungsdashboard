<?php
declare(strict_types=1);
namespace IDV;

/**
 * Short-lived, authenticated SSE stream for shared PHP hosts.
 * No staff data or audit text is emitted, only a monotonically increasing
 * database log sequence. Browser reconnect is automatic.
 *
 * Unlike in-memory Node listeners, this works across multiple PHP workers.
 */
function streamChanges(array $user): never {
    @set_time_limit(25);
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-transform');
    header('X-Accel-Buffering: no');
    header('Connection: keep-alive');
    $initial=sql('SELECT COALESCE(MAX(id),0) AS last_id FROM log');
    $last=(int)($initial[0]['last_id']??0);
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
        $now=sql('SELECT COALESCE(MAX(id),0) AS last_id FROM log');
        $seq=(int)$now[0]['last_id'];
        if($seq>$last){
            $last=$seq;
            echo "event: aktualisierung\n";
            echo 'data: '.json_encode(['seq'=>$seq,'bereich'=>'portal'],JSON_THROW_ON_ERROR)."\n\n";
            @ob_flush();@flush();
        }
        usleep(1000000);
    }
    echo ": reconnect\n\n";
    @ob_flush();@flush();
    exit;
}
