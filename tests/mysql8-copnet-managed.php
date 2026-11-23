<?php
declare(strict_types=1);
namespace IDV;

// Isolated crypto tests: no database, no real credentials, no production key.
function fail(int $status,string $message): never { throw new \RuntimeException($status.' '.$message); }
$GLOBALS['existingManagedCiphertext']=false;
function sql(string $query,array $params=[]): array {
    if(str_contains($query,'passwort_verschluesselt LIKE'))
        return $GLOBALS['existingManagedCiphertext']?[['found'=>1]]:[];
    throw new \RuntimeException('Unexpected SQL in crypto test');
}
require dirname(__DIR__).'/php/CopNet.php';
function expect(bool $condition,string $description): void {
    if(!$condition)throw new \RuntimeException('FAILED: '.$description);
}
function mustFail(callable $fn,string $description): void {
    try{$fn();}catch(\RuntimeException $e){return;}
    throw new \RuntimeException('Expected failure: '.$description);
}

$dir=sys_get_temp_dir().'/idv-copnet-'.bin2hex(random_bytes(8));
putenv('IDV_COPNET_KEY_DIRECTORY='.$dir);
putenv('COPNET_ENCRYPTION_KEY');
try {
    $plain='synthetic password with Umlaut ä and &';
    $v2=copNetEncode($plain);
    expect(str_starts_with($v2,'v2:'),'managed key uses version prefix');
    expect(copNetDecode($v2)===$plain,'managed roundtrip');
    expect(is_file($dir.'/copnet-v2.key'),'managed key persisted outside webroot');
    $keyBefore=file_get_contents($dir.'/copnet-v2.key');
    expect(strlen((string)$keyBefore)===64,'key is 256-bit hex');
    expect(copNetDecode(copNetEncode('next value'))==='next value','subsequent write keeps key');
    expect(file_get_contents($dir.'/copnet-v2.key')===$keyBefore,'key must not rotate');

    // Legacy ciphertext remains byte-format compatible with Node.js.
    putenv('COPNET_ENCRYPTION_KEY='.str_repeat('ab',32));
    $legacy=copNetEncode($plain);
    expect(!str_starts_with($legacy,'v2:'),'legacy output has no prefix');
    expect(copNetDecode($legacy)===$plain,'legacy roundtrip');
    expect(copNetDecode($v2)===$plain,'new records readable even with legacy env key');
    putenv('COPNET_ENCRYPTION_KEY');
    mustFail(fn()=>copNetDecode($legacy),'cannot silently use another key for old secrets');
    expect(copNetDecode($v2)===$plain,'managed records stay readable without env');

    putenv('COPNET_ENCRYPTION_KEY=invalid');
    mustFail(fn()=>copNetEncode('test'),'invalid configured key must fail closed');
    putenv('COPNET_ENCRYPTION_KEY');

    unlink($dir.'/copnet-v2.key');
    mustFail(fn()=>copNetDecode($v2),'missing key is not regenerated on read');
    $GLOBALS['existingManagedCiphertext']=true;
    mustFail(fn()=>copNetEncode('new'),'missing key is not regenerated if v2 ciphertext exists');
    expect(!is_file($dir.'/copnet-v2.key'),'lost key not replaced');
    $GLOBALS['existingManagedCiphertext']=false;
    $fresh=copNetEncode('fresh');
    expect(copNetDecode($fresh)==='fresh','new install may create a fresh key');
    echo "CopNet managed key, safe fallback, legacy compatibility and missing-key protection OK\n";
}finally{
    putenv('COPNET_ENCRYPTION_KEY');
    putenv('IDV_COPNET_KEY_DIRECTORY');
    foreach(glob($dir.'/*')?:[] as $file)@unlink($file);
    @rmdir($dir);
}
