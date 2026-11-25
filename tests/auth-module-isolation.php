<?php
declare(strict_types=1);
$api=file_get_contents(dirname(__DIR__).'/php/Api.php');
$training=file_get_contents(dirname(__DIR__).'/php/Ausbildung.php');
$exam=file_get_contents(dirname(__DIR__).'/php/Pruefungen.php');
function verifyIsolation(bool $condition,string $label): void {
    if(!$condition)throw new RuntimeException($label);
}
$run=substr($api,strpos($api,'function run(): void'));
$auth=strpos($run,"if(\$method==='POST'&&\$uri==='/api/login')handleLogin();");
$guest=strpos($run,"require_once __DIR__.'/Pruefungen.php';");
verifyIsolation($auth!==false&&$guest!==false&&$auth<$guest,'login must precede exam include');
verifyIsolation(str_contains($run,"if(str_starts_with(\$uri,'/api/pruefung-gast/')){\n            require_once __DIR__.'/Pruefungen.php';"),'guest module scoped to its own routes');
verifyIsolation(str_contains($training,"if(\$uri==='/api/ausbildung/pruefungen'||str_starts_with(\$uri,'/api/ausbildung/pruefungen/')){\n        require_once __DIR__.'/Pruefungen.php';"),'exam module scoped to exam routes');
verifyIsolation(str_contains($exam,"if(str_starts_with(\$uri,\$root.'/google/')){\n        require_once __DIR__.'/PruefungenGoogle.php';"),'Google import module scoped to import routes');
echo "Auth module isolation OK\n";
