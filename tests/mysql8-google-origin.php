<?php
declare(strict_types=1);
require dirname(__DIR__).'/php/Api.php';
require dirname(__DIR__).'/php/GoogleDocuments.php';
$cases=[
    ['https://staging.example.test','https://staging.example.test'],
    ['http://staging.example.test',null],
    ['https://staging.example.test/path',null],
    ['https://staging.example.test?x=1',null],
    ['https://someone@staging.example.test',null],
    ['https://example.test:8443','https://example.test:8443'],
    ['',null]
];
putenv('IDV_GOOGLE_ORIGIN');
if(IDV\googlePortalOrigin()!=='https://pol-panel.identityvalley.de')
    throw new RuntimeException('Default production OAuth origin mismatch');
foreach($cases as [$value,$expected]){
    putenv('IDV_GOOGLE_ORIGIN='.$value);
    $got=IDV\googlePortalOrigin();
    if($got!==$expected)throw new RuntimeException('Google portal origin normalization/allowlist mismatch');
}
putenv('IDV_GOOGLE_ORIGIN=https://staging.example.test');
putenv('GOOGLE_OAUTH_CLIENT_ID=example-123.apps.googleusercontent.com');
putenv('GOOGLE_OAUTH_CLIENT_SECRET=ci-only-not-real-secret');
if(!is_array(IDV\googleCredentials()))
    throw new RuntimeException('Client configured incorrectly');
if(IDV\googleSetupHint()!==null)
    throw new RuntimeException('Correct OAuth config should have no setup warning');
putenv('GOOGLE_OAUTH_CLIENT_SECRET');
if(!str_contains((string)IDV\googleSetupHint(),'GOOGLE_OAUTH_CLIENT_SECRET'))
    throw new RuntimeException('Missing client secret should be diagnosable');
echo "Google trusted HTTPS portal origin and OAuth config checks OK\n";
