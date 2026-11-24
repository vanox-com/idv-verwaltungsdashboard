<?php
declare(strict_types=1);
namespace IDV;
require_once dirname(__DIR__).'/php/AusbildungPersonal.php';
function eq($a,$b,string $label): void {
    if($a!==$b)throw new \RuntimeException($label.' expected '.var_export($b,true).' got '.var_export($a,true));
}
$cases=[
 ['Polizeimeisteranwärter','PMA'],
 ['Polizeimeisteranwaerter','PMA'],
 ['Polizei-Meister-Anwärterin','PMA'],
 ['PMA','PMA'],
 ['Polizeikommissaranwärter','PKA'],
 ['Polizei-Kommissar-Anwärter','PKA'],
 ['PKA','PKA'],
 ['Kriminalkommissaranwärter','KKA'],
 ['Kriminal-Kommissar-Anwärter','KKA'],
 ['KKA','KKA'],
 ['Polizeimeister',null],
 ['Polizeikommissar',null],
 ['Kriminalkommissar',null],
 ['Unbekannter Rang',null]
];
foreach($cases as [$input,$track])eq(ausbildungPersonalLaufbahn($input),$track,$input);
eq(ausbildungPersonalQuelle(13,0),'personal:13:0','initiale Dienstnummer');
eq(ausbildungPersonalQuelle(13,1),'personal:13:1','Neubelegung erzeugt frischen Identitätsschlüssel');
if(ausbildungPersonalQuelle(13,0)===ausbildungPersonalQuelle(13,1))
 throw new \RuntimeException('Dienstnummern-Neubelegung darf keine Ausbildungsakte übernehmen');
fwrite(STDOUT,"OK – ".count($cases)." Dienstgrade zugeordnet; freier und neu belegter Personalstamm getrennt\n");
