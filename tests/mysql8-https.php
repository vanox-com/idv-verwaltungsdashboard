<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Api.php';
// CI-only unit test: no network and no production environment.
$_SERVER['HTTPS']='off';
$_SERVER['SERVER_PORT']='8080';
putenv('IDV_FORCE_HTTPS=0');
if(IDV\secureRequest()!==false)throw new RuntimeException('HTTP reported as HTTPS without explicit proxy configuration');
putenv('IDV_FORCE_HTTPS=1');
if(IDV\secureRequest()!==true)throw new RuntimeException('Trusted reverse-proxy HTTPS setting ignored');
putenv('IDV_FORCE_HTTPS=0');
$_SERVER['HTTPS']='on';
if(IDV\secureRequest()!==true)throw new RuntimeException('Direct TLS request not recognized');
echo "TLS cookie security: direct HTTPS and trusted reverse proxy covered\n";
