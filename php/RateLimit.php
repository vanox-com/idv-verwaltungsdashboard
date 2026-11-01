<?php
declare(strict_types=1);
namespace IDV;

/* No external service required. InnoDB attempts are shared across PHP workers.
 * Never log raw IPs, passwords or account existence.
 */
function attemptKey(): string {
    $ip=(string)($_SERVER['REMOTE_ADDR']??'');
    // An optional secret protects pseudonymous IP hashes in backups.
    $secret=(string)(getenv('IDV_LOGIN_RATE_SECRET')?:'');
    return hash_hmac('sha256',$ip,$secret);
}
function checkLoginRate(): void {
    $rows=sql(
        'SELECT COUNT(*) AS n FROM idv_login_attempts WHERE ip_hash=UNHEX(?) AND zeit>=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE)',
        [attemptKey()]
    );
    if((int)($rows[0]['n']??0)>=30)
        fail(429,'Zu viele Anmeldeversuche. Bitte fünf Minuten warten.');
}
function recordLoginFailure(): void {
    sql('INSERT INTO idv_login_attempts(ip_hash) VALUES(UNHEX(?))',[attemptKey()]);
    if(random_int(1,30)===1)sql('DELETE FROM idv_login_attempts WHERE zeit<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)');
}
