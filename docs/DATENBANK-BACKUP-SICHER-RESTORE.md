# Sichere Datenbanksicherung im IDV-Polizeipanel – 24.11.2026

Arbeitsbranch: `migration/mysql8-php-cutover-2026-11-10`

## Was das Feature tut

**Administration → Backup-Übersicht** stellt manuelle AES-256-verschlüsselte Datenbankarchive für die laufende MySQL-8-Datenbank zur Verfügung. Der Administrator kann sichern, Archive herunterladen, eigene zuvor heruntergeladene IDV-Archive wieder hochladen, Passwort und Prüfsummen prüfen und Daten **nur bei identischem Datenbankschema** kontrolliert wiederherstellen.

Datenbankauszüge enthalten u. a. Benutzerdaten und Passwort-Hashes. Deswegen sind **alle Backup-APIs ausschließlich Administratoren zugänglich**, auch wenn ein anderer Nutzer Leserechte für das Navigationsmodul hat.

**Eine reine Statusanzeige ist noch kein Backup**: Erst die erfolgreiche Aktion „Verschlüsselte Sicherung erstellen“ erzeugt die ZIP-Datei und legt sie ab.

## Anforderungen an den PHP-Hoster

- PHP 8.2+/8.3 mit `pdo_mysql`, `ZipArchive`, `openssl`. Der verwendete `libzip` muss ZIP-AES-256 (`ZipArchive::EM_AES_256`) unterstützen. Ohne AES **keine unverschlüsselten Fallbacks**.
- Privater, dauerhafter Ordner außerhalb des Webroots: standardmäßig `private/database-backups/` relativ zum App-Projekt. Optional `IDV_BACKUP_DIRECTORY=/absoluter/persistenter/privater/pfad`. Der Webserver-Prozess muss Schreibrechte besitzen; Ordner `0700`, Archive und Index `0600`. Backups müssen **Deployments überleben**. Der Hoster muss ausreichend freien Speicher bereitstellen.
- Bei größeren Installationen die Grenzen von PHP/FPM (`max_execution_time`, Proxy-Timeout, ZIP-Funktion, `upload_max_filesize`, `post_max_size`) berücksichtigen. Die Implementierung ist für Datenbanken bis 1 Mio. Zeilen/1 GiB unkomprimierte Tabellenzeilen beziehungsweise 256 MiB ZIP begrenzt; die Hoster-Grenzen können niedriger liegen.
- Bei InnoDB werden die Tabellenwerte mittels `REPEATABLE READ` und konsistentem Snapshot gelesen. `SHOW CREATE TABLE`, Spalten, Views, Trigger, Routinen und Events werden als Schema-Metadaten im verschlüsselten Archiv abgelegt.
- Die PHP-Logik führt bei einer **Wiederherstellung im Panel keinerlei DDL** aus und verlangt deshalb exakt dieselbe Tabellen-, View- und Triggerstruktur. Das ist eine bewusste Sicherheitsgrenze.
- **Nicht enthalten:** hochgeladene Dateien (PDF/DOCX etc.) auf dem Hoster, das private CopNet-Schlüsselmaterial, Serverumgebungsvariablen, Datenbanknutzer/-rechte, Domain-/Hosterkonfiguration und externe Google-Drive-Dokumente. Diese Dinge müssen separat gesichert werden.

## Sicherung erstellen

1. Als **Administrator** im Panel einloggen, **Administration → Backup-Übersicht** öffnen.
2. Bezeichnung wählen und ein **eigenes, starkes Passwort mit mindestens 14 Zeichen** zweimal eingeben. Dieses Passwort wird weder im Browser-Speicher noch im Backend dauerhaft hinterlegt.
3. **Verschlüsselte Sicherung erstellen** wählen. Nur wenn das Archiv erfolgreich geschlossen, verschlüsselt und gesichert ist, erscheint es als fertige Sicherung in der Tabelle.
4. Das ZIP **herunterladen** und auf einem sicheren, unabhängigen Speicher ablegen. Passwort getrennt vom ZIP aufbewahren. Dateiliste und Datumsangaben allein sind kein Nachweis einer getesteten Wiederherstellbarkeit – regelmäßig Restore-Test durchführen.

Das passwortgeschützte ZIP enthält `manifest.json` mit SQL-Struktur-Metadaten und pro Tabelle eine verschlüsselte `data/<tabelle>.jsonl`-Datei. Jede Tabellen-Datei hat SHA-256, Zeilen- und Bytegrößen, und der vollständige Container bekommt einen zusätzlichen SHA-256-Wert im privaten Index. Alle Werte werden als Base64/Null-Kodierung exportiert, wodurch auch binäre Daten erhalten bleiben.

## Sichere Wiederherstellung

1. **Nur auf einer ruhigen, kontrollierten Installation** und **nur als Administrator** durchführen. Externe direkte MySQL-Verbindungen oder andere Programme müssen durch den Hoster während der Wiederherstellung angehalten werden.
2. Sicherung auswählen, Backup-Passwort eingeben und auf **Integrität und Datenbank vergleichen** klicken. Dies ist rein lesend. Dabei werden alle Tabellenzeilen, SHA-256-Prüfsummen, Tabellenanzahl und die aktuelle Struktur geprüft.
3. Stimmen Datenbankname oder Schema nicht überein, verweigert das Panel die Wiederherstellung. Insbesondere kann es kein Schema-Downgrade nach einer Migration ausführen.
4. Bei erfolgreicher Vorschau wird ein **10 Minuten gültiger Einmal-Code** erstellt, der an das Admin-Konto, die Archivprüfsumme und die Datenbankstruktur gebunden ist.
5. Für die eigentliche Wiederherstellung müssen das aktuelle **Administratorpasswort**, der exakte Bestätigungssatz `WIEDERHERSTELLEN <datenbankname>` und zwei zusätzliche Bestätigungen abgegeben werden.
6. Vor jeglicher Änderung erstellt das System eine zusätzliche **AES-256-verschlüsselte Sicherheitskopie des aktuellen Datenstands** mit dem eingegebenen Backup-Passwort. Wenn diese Kopie fehlschlägt, wird nicht wiederhergestellt.
7. Während der Wiederherstellung blockiert die zentrale PHP-Routing-Schicht alle normalen Schreibzugriffe. Die wiederherzustellenden Zeilen werden in **einer InnoDB-Transaktion** eingespielt, mit Fremdschlüsselprüfungen vorübergehend deaktiviert und mit `@idv_migration=1` zum Vermeiden historischer Audit-Trigger. Vor `COMMIT` werden die Zeilenzahlen jeder Tabelle kontrolliert; Fehler führen zum `ROLLBACK`.
8. Die alten Sitzungen werden entfernt. Danach neu einloggen. Die automatische Sicherheitskopie ist in der Backup-Übersicht verzeichnet.
9. Der Marker für den Schreibschutz wird im `finally` entfernt. Wenn der PHP-Prozess hart beendet wird, muss ein Administrator den Zustand zuerst prüfen und den Marker **nicht ungeprüft** löschen.

**Risiko-/Hosterhinweis:** Eine transaktionale Datenrückspielung benötigt identische Schemaobjekte und ausschließlich InnoDB-Tabellen. Es wird keine hochverfügbare, schemaübergreifende Point-in-Time-Wiederherstellung und kein Disaster-Recovery für den kompletten Hoster versprochen. Zusätzlich sollte der Hoster regelmäßig externe Vollbackups mit Offsite-Ablage erstellen. Die Funktionsfähigkeit der PHP-Lösung muss einmal auf dem tatsächlichen Hoster getestet werden.

## Vor der Ausbildungsdatenbank-Erweiterung

1. Vor der additiven Ausbildungsmigration über **Backup-Übersicht → Verschlüsselte Sicherung erstellen** einen bestätigten, heruntergeladenen und prüfbaren MySQL-Snapshot sichern.
2. Vor der Migration außerdem **ein unabhängiges vollständiges SQL-Backup beim Hoster/phpMyAdmin** erstellen, denn die In-Panel-Wiederherstellung funktioniert **nicht** für eine alte Sicherung, wenn neue Ausbildungstabellen zwischenzeitlich zum Datenbankschema hinzugefügt wurden.
3. Erst danach `2026-11-24-ausbildung.sql` und `2026-11-24-aulk-public.sql` auf dem Hoster ausführen.
4. Weder der Backup-Installer noch die Ausbildungseinrichtung dürfen automatisch bestehende Datensätze ersetzen.

## Tests

`.github/workflows/database-backup.yml` enthält einen echten MySQL8-/PHP-HTTP-Test für AES-256-Erstellung, Zugriffsschutz, falsches Passwort, komplette Archivprüfung, nichtautorisierten Download, zusätzliche Sicherheitskopie, Wiederherstellung einer absichtlich veränderten Testtabelle und Ungültigmachen alter Sitzungen.

**GitHub-Tests erzeugen und verändern ausschließlich Testdatenbanken. Sie belegen keine produktive Hoster-Installation.**
