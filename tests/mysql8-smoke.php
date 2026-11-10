<?php
declare(strict_types=1);

require dirname(__DIR__).'/php/Api.php';

function assertThat(bool $condition,string $message): void {
    if(!$condition)throw new RuntimeException('MySQL8 integration failure: '.$message);
}

$pdo=IDV\db();
assertThat($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql','PDO is not using MySQL');
IDV\sql("INSERT INTO roles(name,farbe,sensibel) VALUES('Administrator','#000000',1)");
IDV\sql("INSERT INTO roles(name,farbe,sensibel) VALUES('Polizeirat','#112233',0)");
foreach(['pers','chk','backup','rechtesimulator','geb','jub','org','texte','mitteilungen','kue','sonder','dis','bef','design'] as $module)
    IDV\sql('INSERT INTO role_perms(rolle,modul,stufe) VALUES(?,?,2)',['Administrator',$module]);
IDV\sql("INSERT INTO role_perms(rolle,modul,stufe) VALUES('Polizeirat','chk',1)");
$password=password_hash('only-ci-example-not-live',PASSWORD_BCRYPT,['cost'=>4]);
IDV\sql("INSERT INTO users(dienstnummer,anzeigename,rolle,passwort_hash,muss_passwort_aendern)
         VALUES('00','Test admin','Administrator',?,0)",[$password]);
$uid=(int)$pdo->lastInsertId();
assertThat(password_verify('only-ci-example-not-live',$password),'bcrypt compatibility');
IDV\sql("INSERT INTO personal(personalnummer,vorname,nachname,status) VALUES(1,'Test','Person','Aktiv')");
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
$admin=['id'=>$uid,'dienstnummer'=>'00','anzeigename'=>'Test admin','rolle'=>'Administrator',
        'gesperrt'=>0,'muss_passwort_aendern'=>0,'zweck'=>'voll'];
assertThat((IDV\rights($admin)['pers']??0)===2,'role permissions');
assertThat(IDV\userName($admin)==='Test admin','admin display name');
echo "MySQL8/PDO integration fixtures OK (schema, bcrypt, rights, revisions, unique application)\n";
