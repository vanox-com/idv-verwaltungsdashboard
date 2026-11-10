<?php
declare(strict_types=1);
/**
 * Read-only deployment preflight for a NON-PRODUCTION staging PHP host.
 * Run with: php scripts/hosting/preflight.php --json
 * No request/session data or credentials are printed; no schema mutations.
 * Do not place this script in the public DocumentRoot.
 */
require dirname(__DIR__,2).'/php/Api.php';
require dirname(__DIR__,2).'/php/GoogleDocuments.php';
require dirname(__DIR__,2).'/php/CopNet.php';

$results=[];
$test=static function(string $name,bool $pass,string $info='')use(&$results):void{
    $results[$name]=['ok'=>$pass,'info'=>$info];
};
$version=PHP_VERSION_ID>=80200;
$test('php_version',$version,'PHP 8.2 or newer required');
foreach(['pdo_mysql','openssl','json','curl','zip'] as $ext)
    $test('php_extension_'.$ext,extension_loaded($ext),'required extension');
$root=dirname(__DIR__,2);
$test('document_root_layout',is_file($root.'/public/api.php')&&
    is_file($root.'/public/.htaccess')&&is_file($root.'/public/index.html')&&
    is_dir($root.'/php')&&is_dir($root.'/src'),
    'Webserver DocumentRoot must point to public/, not the repository root');
$test('apache_rewrites',str_contains((string)@file_get_contents($root.'/public/.htaccess'),
    'RewriteRule ^api'),'API rewrite into public/api.php');
$temporary=@tempnam(sys_get_temp_dir(),'idv_preflight_');
$canTemp=$temporary!==false;
if($canTemp){$canTemp=@file_put_contents($temporary,'idv',LOCK_EX)===3;@unlink($temporary);}
$test('temporary_files',$canTemp,'PHP must write temporary DOCX work files');
$rate=(string)(getenv('IDV_LOGIN_RATE_SECRET')?:'');
$test('rate_limit_secret',strlen($rate)>=32,'secure server-side secret must have at least 32 characters');
$https=getenv('IDV_FORCE_HTTPS');
$test('https_configuration',in_array($https,['0','1'],true),
    'set 1 behind trusted TLS reverse proxy, 0 for direct TLS; verify HTTPS from a real browser');
$google=\IDV\googleCredentials();
$origin=\IDV\googlePortalOrigin();
$test('google_client_config',$google!==null,'OAuth client ID and secret present (real consent not tested)');
$test('google_origin',$origin!==null,
    $origin?'Configured HTTPS origin: '.$origin:'Set IDV_GOOGLE_ORIGIN=https://approved-host');
$copkey=(string)(getenv('COPNET_ENCRYPTION_KEY')?:'');
$test('copnet_key_format',(bool)preg_match('/^[a-f0-9]{64}$/iD',$copkey),
    'the EXACT same existing 32-byte AES key is required after migration');
$cryptoOk=false;
if($results['copnet_key_format']['ok']){
    try{
        $probe='idv-probe-'.bin2hex(random_bytes(5));
        $cryptoOk=\IDV\copNetDecode(\IDV\copNetEncode($probe))===$probe;
    }catch(\Throwable $e){$cryptoOk=false;}
}
$test('copnet_aes_gcm_roundtrip',$cryptoOk,'AES-256-GCM encryption/decryption tested without printing plaintext');
$mysqlVars=['MYSQL_HOST','MYSQL_DATABASE','MYSQL_USER','MYSQL_PASSWORD'];
$allDb=true;
foreach($mysqlVars as $var)if((string)(getenv($var)?:'')==='')$allDb=false;
$test('mysql_environment',$allDb,'database connection variables must be set');
if($allDb&&extension_loaded('pdo_mysql')){
    try{
        $pdo=\IDV\db();
        $q=$pdo->query("SELECT
          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE') AS tables,
          (SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()) AS fks,
          (SELECT COUNT(*) FROM information_schema.check_constraints WHERE constraint_schema=DATABASE()) AS checks,
          (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=DATABASE()) AS triggers");
        $a=$q->fetch(\PDO::FETCH_ASSOC);
        $complete=(int)$a['tables']===49&&(int)$a['fks']===33&&
            (int)$a['checks']===14&&(int)$a['triggers']===35;
        $test('mysql_schema',$complete,'expected 49 tables, 33 FKs, 14 CHECKs and 35 triggers');
        $r=$pdo->query("SELECT passwort_verschluesselt FROM copnet_zugaenge
             WHERE passwort_verschluesselt IS NOT NULL AND passwort_verschluesselt<>'' LIMIT 1")->fetch(\PDO::FETCH_ASSOC);
        if($r){
            $matching=false;
            if($cryptoOk)try{
                $decoded=\IDV\copNetDecode($r['passwort_verschluesselt']);
                $matching=is_string($decoded);
                unset($decoded);
            }catch(\Throwable $e){$matching=false;}
            $test('copnet_existing_ciphertext',$matching,
                'one stored ciphertext must decrypt with the ORIGINAL key; no plaintext logged');
        }else{
            $test('copnet_existing_ciphertext',true,
                'no stored ciphertext found; original-key compatibility requires staging verification when data is imported');
        }
        $test('mysql_connection',true,'staging database responds');
    }catch(\Throwable $e){
        $test('mysql_connection',false,'could not query staging MySQL; server logs must be checked privately');
    }
}else $test('mysql_connection',false,'database connection was not configured');
$ok=!in_array(false,array_column($results,'ok'),true);
$out=['ok'=>$ok,'checks'=>$results,
  'manual_acceptance_pending'=>[
    'external HTTPS and document root from browser',
    'Google popup OAuth with authorized test user and all original templates',
    'Google Cloud Console authorized JavaScript origin',
    'CopNet original ciphertext after real data import',
    'staging UI and role-by-role acceptance'
  ]];
echo json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
exit($ok?0:2);
