<?php
declare(strict_types=1);
namespace IDV;

/** Exclude synthetic people in statistics only. Never delete or alter source rows. */
function statistikTestName(?string ...$names): bool {
    foreach($names as $name)if($name!==null&&stripos($name,'test')!==false)return true;
    return false;
}
function statistikTestPerson(array $p): bool {
    return statistikTestName((string)($p['vorname']??''),(string)($p['nachname']??''),(string)($p['name']??''),(string)($p['anzeigename']??''),(string)($p['kandidat']??''));
}
