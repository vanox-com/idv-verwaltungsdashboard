<?php
declare(strict_types=1);
namespace IDV;
require_once __DIR__.'/PruefungenGoogle.php';

function dispatchAssessmentGoogle(array $u,string $method,string $uri): bool {
    $root='/api/assessment/google';
    if(!in_array($uri,[$root.'/status',$root.'/import'],true))return false;
    if(!assessmentImportAdmin($u))fail(403,'Nur Polizeirat, Leitungsdienst und Administratoren dürfen Assessment-Formulare importieren');
    $cfg=googleCredentials();$origin=googlePortalOrigin();
    if($method==='GET'&&$uri===$root.'/status'){
        respond(200,['eingerichtet'=>$cfg!==null&&$origin!==null,'origin'=>$origin,
            'clientId'=>$cfg['id']??null,'hinweis'=>googleSetupHint(),'arten'=>array_keys(ASSESSMENT_ARTEN)]);
    }
    if($method!=='POST'||$uri!==$root.'/import')fail(405,'Nicht erlaubt');
    if(!$cfg||!$origin)fail(503,'Google OAuth ist noch nicht eingerichtet');
    $origin=googleOrigin();
    $b=body();$art=$b['art']??'';$code=$b['google_code']??'';
    if(!is_string($art)||!isset(ASSESSMENT_ARTEN[$art])||!is_string($code))fail(400,'Prüfungsart oder Google-Anmeldung ungültig');
    $formId=$b['formId']??'';
    if(!is_string($formId)||!preg_match('/^[A-Za-z0-9_-]{10,200}$/D',$formId))fail(400,'Gültige Formular-ID aus dem Google-Forms-Bearbeitungslink erforderlich.');
    // Reuse the existing origin-checked popup code exchange. Tokens stay
    // server-side, live only for this request, and are never persisted.
    // Provide a useful, non-secret OAuth error rather than a generic login failure.
    if(strlen($code)<15||strlen($code)>2048)fail(400,'Google hat keinen gültigen Autorisierungscode zurückgegeben.');
    $exchange=googleRequest('https://oauth2.googleapis.com/token','POST',null,[
        'code'=>$code,'client_id'=>$cfg['id'],'client_secret'=>$cfg['secret'],
        'grant_type'=>'authorization_code','redirect_uri'=>$origin
    ],'application/x-www-form-urlencoded',15);
    $grant=json_decode($exchange['body'],true);
    if($exchange['code']!==200||!is_array($grant)||empty($grant['access_token'])){
        $reason=is_array($grant)?($grant['error']??''):'';
        $hint=match($reason){
            'redirect_uri_mismatch'=>'OAuth-Weiterleitungsadresse stimmt nicht mit der Portaladresse überein.',
            'invalid_client','unauthorized_client'=>'Google-OAuth-Client auf dem Hoster oder in Google Cloud prüfen.',
            'invalid_grant'=>'Autorisierungscode ungültig oder bereits verwendet. Bitte erneut verbinden.',
            'access_denied'=>'Google-Zugriff wurde abgelehnt.',
            default=>'Google-Anmeldung konnte nicht abgeschlossen werden (HTTP '.$exchange['code'].').'
        };
        fail(401,$hint);
    }
    $token=(string)$grant['access_token'];
    if(isset($grant['scope'])&&!in_array(IDV_FORM_SCOPE,preg_split('/\\s+/',trim((string)$grant['scope'])),true))
        fail(403,'Forms-Lesezugriff wurde nicht freigegeben. Bitte bei Google bestätigen.');
    unset($grant,$exchange);
    $r=googleRequest('https://forms.googleapis.com/v1/forms/'.rawurlencode($formId),'GET',$token,null,null,15);
    unset($token,$code,$b);
    if($r['code']===401)fail(401,'Google-Anmeldung abgelaufen. Bitte erneut verbinden.');
    if($r['code']===403){
        $error=json_decode($r['body'],true);
        $reasons=array_column($error['error']['details']??[],'reason');
        if(in_array('SERVICE_DISABLED',$reasons,true))fail(403,'Google Forms API ist im OAuth-Cloud-Projekt nicht aktiviert. Forms API aktivieren und erneut verbinden.');
        if(in_array('ACCESS_TOKEN_SCOPE_INSUFFICIENT',$reasons,true))fail(403,'Google-Token hat keinen Forms-Lesezugriff. Erneut verbinden und den Zugriff bestätigen.');
        fail(403,'Google verweigert den Formularzugriff. Berechtigtes Google-Konto auswählen und Forms API im OAuth-Cloud-Projekt prüfen.');
    }
    if($r['code']===404)fail(404,'Google-Formular nicht gefunden oder für dieses Google-Konto nicht freigegeben.');
    if($r['code']!==200)fail(502,'Google Forms konnte nicht gelesen werden (HTTP '.$r['code'].')');
    $form=json_decode($r['body'],true,64,JSON_THROW_ON_ERROR);
    if(!is_array($form)||!isset($form['info'])||!is_array($form['items']??null))fail(502,'Google lieferte keine vollständige Formularstruktur');
    pruefungGoogleMedien($form);
    respond(200,['art'=>$art,'definition'=>$form]);
}
