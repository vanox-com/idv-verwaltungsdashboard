<?php
declare(strict_types=1);
namespace IDV;

require_once __DIR__.'/GoogleDocuments.php';

const IDV_FORM_SCOPE='https://www.googleapis.com/auth/forms.body.readonly';
const IDV_FORM_SOURCES=[
    'pm'=>'1EYWfCwKLG-ig5fCRl5EaG2TtNxl3HeboYJY5xjo8LKo',
    'pk'=>'1qPWGBfTj2dddzDGjt1l4Ev-V5_0LPms2FUKoGmIegVk',
    'dgl'=>'1V0cQqINB0nJgbnA19XIJBryoUcDJr3Jv3OH_GF0JUWo',
];

// The source is a Google-authored signed image URL, never a user URL.
// No OAuth token, cookies or redirects are sent to the image CDN.
function pruefungGoogleBildUrl(string $url): bool {
    $p=parse_url($url);if(!is_array($p))return false;
    $host=strtolower((string)($p['host']??''));
    return ($p['scheme']??'')==='https'&&!isset($p['user'],$p['pass'])&&!isset($p['user'])&&!isset($p['pass'])&&!isset($p['port'])
        &&preg_match('/^(?:[a-z0-9-]+\.)+googleusercontent\.com$/D',$host)===1;
}
function pruefungGoogleBild(array $image,int &$budget,float $deadline): array {
    $url=(string)($image['contentUri']??'');unset($image['contentUri'],$image['sourceUri']);
    if(!pruefungGoogleBildUrl($url)||!function_exists('curl_init')){$image['idvFehler']='Bild-URL nicht unterstützt';return $image;}
    $remaining=(int)floor($deadline-microtime(true));
    if($remaining<1){$image['idvFehler']='Zeitlimit für Bildimport erreicht';return $image;}
    $bytes='';$max=min(450000,$budget);
    if($max<=0){$image['idvFehler']='Bildbudget überschritten';return $image;}
    $c=curl_init($url);
    curl_setopt_array($c,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
        CURLOPT_CONNECTTIMEOUT=>min(4,$remaining),CURLOPT_TIMEOUT=>min(6,$remaining),CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
        CURLOPT_WRITEFUNCTION=>static function($curl,string $part)use(&$bytes,$max): int {
            if(strlen($bytes)+strlen($part)>$max)return 0;
            $bytes.=$part;return strlen($part);
        }]);
    $ok=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_HTTP_CODE);curl_close($c);
    $info=$ok&&$status===200?@getimagesizefromstring($bytes):false;
    if(!$info||!in_array($info['mime']??'',['image/png','image/jpeg','image/webp','image/gif'],true)||$info[0]>6000||$info[1]>6000){
        $image['idvFehler']='Bild nicht abrufbar, zu groß oder Dateityp nicht unterstützt';return $image;
    }
    $budget-=strlen($bytes);
    $image['idvData']='data:'.$info['mime'].';base64,'.base64_encode($bytes);
    return $image;
}
function pruefungGoogleMedien(array &$form): void {
    $budget=1000000;$count=0;$deadline=microtime(true)+16;
    // Visit only the image locations of the Forms schema; keep the exact
    // question/option association. No requests to arbitrary external hosts.
    $apply=static function(&$img)use(&$budget,&$count,$deadline): void {
        if(!is_array($img))return;
        if(++$count>40){unset($img['contentUri'],$img['sourceUri']);$img['idvFehler']='Zu viele Bilder';return;}
        $img=pruefungGoogleBild($img,$budget,$deadline);
    };
    if(!isset($form['items'])||!is_array($form['items']))return;
    foreach($form['items'] as &$item){
        if(isset($item['imageItem']['image']))$apply($item['imageItem']['image']);
        if(isset($item['questionItem']['image']))$apply($item['questionItem']['image']);
        if(isset($item['questionGroupItem']['image']))$apply($item['questionGroupItem']['image']);
        if(isset($item['questionItem']['question']['choiceQuestion']['options']))
            foreach($item['questionItem']['question']['choiceQuestion']['options'] as &$option){
                if(isset($option['image']))$apply($option['image']);
            }
        unset($option);
    }unset($item);
}
function dispatchPruefungGoogle(array $u,string $method,string $uri): bool {
    $root='/api/ausbildung/pruefungen/google';
    if(!in_array($uri,[$root.'/status',$root.'/import'],true))return false;
    if(!pruefungImportAdmin($u))fail(403,'Nur Administratoren dürfen Prüfungen importieren');
    $cfg=googleCredentials();$origin=googlePortalOrigin();
    if($method==='GET'&&$uri===$root.'/status'){
        respond(200,['eingerichtet'=>$cfg!==null&&$origin!==null,'origin'=>$origin,
            'clientId'=>$cfg['id']??null,'hinweis'=>googleSetupHint(),'arten'=>array_keys(IDV_FORM_SOURCES)]);
    }
    if($method!=='POST'||$uri!==$root.'/import')fail(405,'Nicht erlaubt');
    if(!$cfg||!$origin)fail(503,'Google OAuth ist noch nicht eingerichtet');
    $origin=googleOrigin();
    $b=body();$art=$b['art']??'';$code=$b['google_code']??'';
    if(!is_string($art)||!isset(IDV_FORM_SOURCES[$art])||!is_string($code))fail(400,'Prüfungsart oder Google-Anmeldung ungültig');
    // Reuse the existing origin-checked popup code exchange. Tokens stay
    // server-side, live only for this request, and are never persisted.
    $token=googleCodeForSession($code,$origin,$cfg);
    $r=googleRequest('https://forms.googleapis.com/v1/forms/'.rawurlencode(IDV_FORM_SOURCES[$art]),'GET',$token);
    unset($token,$code,$b);
    if($r['code']===401)fail(401,'Google-Anmeldung abgelaufen. Bitte erneut verbinden.');
    if($r['code']===403)fail(403,'Google verweigert den Formularzugriff. Forms API im bestehenden Cloud-Projekt aktivieren und das berechtigte Google-Konto mit Forms-Lesezugriff auswählen.');
    if($r['code']===404)fail(404,'Google-Formular nicht gefunden oder für dieses Google-Konto nicht freigegeben.');
    if($r['code']!==200)fail(502,'Google Forms konnte nicht gelesen werden (HTTP '.$r['code'].')');
    $form=json_decode($r['body'],true,64,JSON_THROW_ON_ERROR);
    if(!is_array($form)||!isset($form['info'])||!is_array($form['items']??null))fail(502,'Google lieferte keine vollständige Formularstruktur');
    pruefungGoogleMedien($form);
    respond(200,['art'=>$art,'definition'=>$form]);
}
