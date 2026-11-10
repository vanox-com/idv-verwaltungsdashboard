<?php
declare(strict_types=1);
// Decrypt a synthetic ciphertext produced by the ORIGINAL Node.js AES-GCM format.
require dirname(__DIR__).'/php/Api.php';
require dirname(__DIR__).'/php/CopNet.php';
$vector=stream_get_contents(STDIN);
if(!is_string($vector)||strlen($vector)<20)throw new RuntimeException('Missing Node test vector');
$plain=IDV\copNetDecode(trim($vector));
if($plain!=='synthetic-CopNet-Übung-1234')
    throw new RuntimeException('CopNet Node-to-PHP compatibility mismatch');
$new=IDV\copNetEncode($plain);
if(IDV\copNetDecode($new)!==$plain)
    throw new RuntimeException('CopNet PHP roundtrip mismatch');
echo "CopNet legacy Node.js ciphertext -> PHP AES-256-GCM decrypt and roundtrip OK\n";
