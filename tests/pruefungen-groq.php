<?php
declare(strict_types=1);
namespace IDV;
require dirname(__DIR__).'/php/Pruefungen.php';
require dirname(__DIR__).'/php/PruefungenKI.php';
require dirname(__DIR__).'/php/PruefungenKIConfig.php';
function fail(int $code,string $msg): never {throw new \RuntimeException($msg,$code);}
function checkGroq(bool $ok,string $msg): void {if(!$ok)throw new \RuntimeException($msg);}
$p=pruefungGroqPayload(['frage'=>'Test','maximalpunkte'=>5]);
checkGroq($p['model']==='openai/gpt-oss-120b','model');
checkGroq($p['response_format']['json_schema']['strict']===true,'schema');
$r=pruefungGroqParse(['choices'=>[['finish_reason'=>'stop','message'=>['content'=>'{"punkte":7,"begruendung":"Test"}']]]],5);
checkGroq($r['punkte']===5.0,'bounded points');
try{pruefungGroqParse(['choices'=>[['finish_reason'=>'length','message'=>['content'=>'{"punkte":2,"begruendung":"Test"}']]]],5);throw new \RuntimeException('truncated accepted');}catch(\RuntimeException $e){checkGroq($e->getCode()===502,'truncation rejected');}
$key='gsk_'.str_repeat('x',40);$master=random_bytes(32);$cipher=examAiEncrypt($key,$master);
checkGroq(examAiDecrypt($cipher,$master)===$key,'encrypted roundtrip');
checkGroq(!examAiValidKey('sk-'.str_repeat('x',40)),'old provider rejected');
echo "Groq integration OK\n";
