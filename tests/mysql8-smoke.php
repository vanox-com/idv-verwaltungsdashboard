<?php
declare(strict_types=1);

require dirname(__DIR__).'/php/Api.php';

function assertThat(bool $condition,string $message): void {
    if(!$condition)throw new RuntimeException('MySQL8 integration failure: '.$message);
}

$pdo=IDV\db();
$refs=IDV\sql("SELECT table_name,column_name FROM information_schema.key_column_usage
WHERE table_schema=DATABASE() AND referenced_table_name='personal'
AND referenced_column_name='personalnummer' ORDER BY table_name");
echo 'Personal FK tables: '.json_encode($refs,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
assertThat($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql','PDO is not using MySQL');
IDV\sql("INSERT INTO roles(name,farbe,sensibel) VALUES('Administrator','#000000',1)");
IDV\sql("INSERT INTO roles(name,farbe,sensibel) VALUES('Polizeirat','#112233',0)");
foreach(['pers','chk','backup','rechtesimulator','geb','jub','org','texte','mitteilungen','kue','sonder','dis','bef','design','por','ranghistorie','rout','routarchiv','kuearchiv','befricht','papierkorb','persverlauf','log','urkunden','praktika'] as $module)
    IDV\sql('INSERT INTO role_perms(rolle,modul,stufe) VALUES(?,?,2)',['Administrator',$module]);
IDV\sql("INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','chk',1)");
IDV\sql("INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','bef',1)");
IDV\sql("INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','rout',1)");
IDV\sql("INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','pers',1)");
IDV\sql("INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','por',1)");
$password=password_hash('only-ci-example-not-live',PASSWORD_BCRYPT,['cost'=>4]);
IDV\sql("INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern)
         VALUES('00','Test admin','Administrator',?,0)",[$password]);
$uid=(int)$pdo->lastInsertId();
$councilPass=password_hash('rat-ci-example-not-live',PASSWORD_BCRYPT,['cost'=>4]);
IDV\sql("INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern)
         VALUES('04','Test Council','Polizeirat',?,0)",[$councilPass]);
assertThat(password_verify('only-ci-example-not-live',$password),'bcrypt compatibility');
IDV\sql("INSERT INTO personal(personalnummer,vorname,nachname,status,dienstgrad) VALUES(1,'Test','Person','Aktiv','Polizeimeisteranwärter')");
IDV\sql("INSERT INTO raenge(name,abk,tage,sortierung,naechster_rang) VALUES('Polizeimeisteranwärter','PMA',NULL,1,'Polizeimeister')");
IDV\sql("INSERT INTO raenge(name,abk,tage,sortierung,naechster_rang) VALUES('Polizeimeister','PM',365,2,NULL)");
IDV\sql('INSERT INTO routine(personalnummer,tage,personen,sortierung) VALUES(?,?,?,?)',[
    1,json_encode(['04.11.2026']),json_encode([['nr'=>1,'vorname'=>'Test',
       'nachname'=>'Person','anwesend'=>[null],'abgemeldet'=>false]]),1
]);
$p=IDV\sql('SELECT row_revision FROM personal WHERE personalnummer=1');
assertThat((int)$p[0]['row_revision']===1,'personal first revision');
IDV\sql("UPDATE personal SET nachname='Testperson' WHERE personalnummer=1");
$p=IDV\sql('SELECT row_revision FROM personal WHERE personalnummer=1');
assertThat((int)$p[0]['row_revision']===2,'personal revision trigger');
IDV\sql("INSERT INTO checklisten(name,aufgaben) VALUES('CI Checklist','[{\"t\":\"Task\",\"u\":\"\"}]')");
IDV\sql("UPDATE checklisten SET aufgaben='[{\"t\":\"Changed\",\"u\":\"\"}]' WHERE name='CI Checklist'");
$c=IDV\sql("SELECT row_revision FROM checklisten WHERE name='CI Checklist'");
assertThat((int)$c[0]['row_revision']===2,'checklist revision trigger');
IDV\sql("INSERT INTO dienstnummer_antraege(alt_nr,ziel_nr,art,begruendung,quell_name,ziel_name,pruefstand,antragsteller_id)
         VALUES(1,2,'personal','test request','Test Person','','{}',?)",[$uid]);
try {
    IDV\sql("INSERT INTO dienstnummer_antraege(alt_nr,ziel_nr,art,begruendung,quell_name,ziel_name,pruefstand,antragsteller_id)
             VALUES(1,3,'personal','test duplicate','Test Person','','{}',?)",[$uid]);
    throw new RuntimeException('Duplicate open DN change was allowed');
} catch(PDOException $e) {
    assertThat($e->getCode()==='23000','unexpected open DN rejection: '.$e->getCode());
}
// Fixture verified; remove pending request before HTTP DN approval scenarios.
IDV\sql('DELETE FROM dienstnummer_antraege WHERE alt_nr=1');
$admin=['id'=>$uid,'dienstnummer'=>'00','anzeigename'=>'Test admin','rolle'=>'Administrator',
        'gesperrt'=>0,'muss_passwort_aendern'=>0,'zweck'=>'voll'];
assertThat((IDV\rights($admin)['pers']??0)===2,'role permissions');
assertThat(IDV\userName($admin)==='Test admin','admin display name');
echo "MySQL8/PDO integration fixtures OK (schema, bcrypt, rights, revisions, unique application)\n";
