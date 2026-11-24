# Ausbildungsabteilung – Stand 24.11.2026

Arbeitsbranch: `migration/mysql8-php-cutover-2026-11-10`. `main` und die bisherige Personalverwaltung werden bei dieser Erweiterung nicht umgestellt.

## 1. Installation auf dem bereits laufenden PHP-/MySQL-8-Hoster

1. Unbedingt vollständige Datenbank- und Dateisicherungen erstellen.
2. **Nur das additive** SQL-Skript `scripts/mysql/2026-11-24-ausbildung.sql` **einmal** in die vorhandene MySQL-8-Datenbank über phpMyAdmin importieren. Die große `IDV-MySQL8-phpMyAdmin-SETUP.sql` darf niemals erneut auf die bestehende Datenbank eingespielt werden.
3. Das PHP-/Public-Paket des angegebenen Branches deployen. Der Webserver-DocumentRoot muss weiterhin `public/` sein.
4. PHP benötigt die bereits eingesetzten Module, insbesondere `pdo_mysql`, `openssl` und `zip`. Für Dateiuploads ggf. `upload_max_filesize=40M`, `post_max_size=45M` oder höher konfigurieren. Große 99-MB-ZIP-Dateien sind **nicht** direkt für diesen Upload vorgesehen: Module vorher entpacken.
5. Für private Lehrmaterialien muss `private/ausbildung-files/` außerhalb des Webroots für den PHP-Prozess dauerhaft beschreibbar sein. Optional `IDV_AUSBILDUNG_FILES_DIR=/absoluter/geschuetzter/pfad` setzen. Rechte, regelmäßige Backups und Beständigkeit über Deployments prüfen. Dateien nicht in GitHub einspielen.
6. Den Administrator für den neuen Ausbildungsbereich öffnen lassen (`/` → Ausbildung). Er kann ein Konto mit Rolle `Ausbildungsleitung` anlegen oder einem bestehenden Polizeikonto über die individuelle Rollenmatrix das Recht `ausbildung=2` geben.
7. Ausbildungsleitung legt Ausbilder und Anwärter an; Ausbilder erhalten nur Modul-Kompetenzen. Erst danach nach Rollen einloggen und Schreib-/Leserechte testen.
8. Externe Links ausschließlich für ausgewählte Anwärter im internen Monitor erzeugen; bei Widerruf sofort deaktivieren.
9. Einzelne Unterlagen im Bereich „Ausbildungsunterlagen“ als private PDF/DOCX/PPTX/XLSX hochladen oder vorhandene Google-Dokumentlinks hinterlegen. Zugriffe auf Google Drive benötigen zusätzlich dessen Freigaberechte.

Kein automatischer Import echter Excel-Personen- und E-Mail-Daten ins öffentliche Repository. Die Excel-Dateien enthalten widersprüchliche Dienstnummern und Formelfehler. Die reale Zuordnung der Ausbilder zu `users` muss vor dem ersten Bestandsimport geprüft werden.

## 2. Fachmodell aus den beiden Excel-Dateien

- **Ausbilderstamm:** DN, Name, Kürzel, Rang, Funktion, Eintritt, E-Mail, Anmerkung, Kompetenzmatrix (Modulberechtigungen), Zugriff aktiv/inaktiv.
- **PMA:** Sieben Pflichtmodule `PM.0` bis `PM.6`. Sind nicht alle abgeschlossen, Status „Module unvollständig“. Anschließend `SUM(Ja-Gewichte)-SUM(Nein-Gewichte)`, Prüfungszulassung ab **2,5** Punkten, sonst „Nicht bereit“.
- **Abstimmungsgewicht:** Ausbildungsleitung/stv. Ausbildungsleitung 2,0; Leitungsdienst 1,5; Ausbilderteam gehobener Dienst 1,0; Ausbilder mittlerer Dienst und auf Probe 0,5. Pro Ausbilder eine änderbare Stimme, mit gespeicherter Gewichtung beim Stimmabgabetermin.
- **PKA:** Vier Pflichtmodule `PK.1` bis `PK.4`. Laut Formel erfolgt die Zulassung nach Abschluss aller vier Module, ohne zusätzliche Ja-/Nein-Bewertung.
- **KKA:** Separate Anwärtergruppe, vorerst gleiche Modulstruktur wie PKA. Die Excel-Dateien enthalten keine spezifische zusätzliche KKA-Prüfungslogik.
- **RSA** bleibt als eigener interner Anwärterwert, hat nach der vorliegenden Formel keinen Einfluss auf die PMA-Zulassung.
- `PM.7`, `PK.5` und `PK.7` tauchen in der Kompetenzmatrix beziehungsweise der PKA-Ansicht auf, jedoch **nicht** in deren zugrundeliegenden Zulassungsformeln. Sie werden daher nicht ungefragt zu Pflichtmodulen.

## 3. Sicherheit und Berechtigungen

- **Ausbildungsleitung:** neuer eigenständiger Zugang nur für Ausbildung; verwaltet Ausbilderzugänge, Anwärter und Materialien.
- **Ausbilder:** neuer eigenständiger Zugang nur für Ausbildung; kann ausschließlich freigegebene Module ändern sowie bei PMA eine eigene Stimme abgeben.
- **Bestehende Administrator-/Polizeikonten:** behalten vorhandene Rechte; Ausbildungszugriff nur durch gesonderte Rechtseintragung, außer Administrator (mit Installationsskript).
- **Kein Ausbilder-/Leitungszugang** für allgemeine Personal-, Disziplinar-, Protokoll- oder Polizeirat-APIs. Die Durchsetzung erfolgt serverseitig in `php/Api.php`.
- Bestehende Polizeikonten bleiben bei Entzug eines zusätzlichen Ausbilderrechts erhalten. Reine Ausbilderkonten werden gesperrt und laufende Sitzungen beendet; kein physisches Löschen von auditpflichtigen Daten.
- **Bearbeitungsschutz:** Jeder Anwärter hat eine `revision`. Änderungen an Modul oder Stimme erfolgen transaktional mit `SELECT ... FOR UPDATE` und erwarten dieselbe Revision; HTTP 409 weist auf einen Bearbeitungskonflikt hin.
- **Externer Status:** Eine individuell freigegebene 256-Bit-Zufallskennung liegt im URL-Fragment, nicht im HTTP-Pfad. Der Server speichert nur den SHA-256-Hash. Ein öffentlicher POST-Endpunkt gibt ausschließlich Modulfortschritt und Prüfungsstatus ohne Name, Dienstnummer, Kommentare, E-Mail oder Einzelstimmen zurück. Ein neuer Link entwertet den bisherigen.
- **Private Unterlagen:** Speicherung nur außerhalb `public/`, Uploadprüfung auf zulässige Office-/PDF-Formate, Download nur über authentifizierte und berechtigte API.

## 4. Oberfläche

- Im bestehenden Panel: neue Navigationsgruppe **Ausbildung** mit Link `/ausbildung.html`.
- `/ausbildung.html`: Überblick, PMA-/PKA-/KKA-Monitore, Ausbilderverwaltung und Ausbildungsunterlagen.
- `/ausbildung-status.html#<individueller-schluessel>`: externe schreibgeschützte Anwärteransicht ohne Login.
- Google Site: <https://sites.google.com/view/aulk2026/startseite>. Ein Link ist vorhanden. Embedding/Google-Drive-Einzelberechtigungen sind auf dem echten Hoster gesondert zu prüfen; nicht alle Inhalte der ZIP dürfen ohne Login sichtbar werden.

## 5. Verifikation

`.github/workflows/ausbildung.yml` testet die PHP-Statusberechnung, Isolierung der Rollen, JavaScript-Syntax und die wiederholte idempotente SQL-Erweiterung auf echtem MySQL 8.

Erfolgreiche CI-Tests sind **kein** Beleg für produktive Installation. Auf dem Hoster sind SQL-Import, Live-Login, Freigaberechte, Datei-Uploads, Google-Links, gleichzeitige Bearbeitung und externe Links in einer getrennten Testrolle abzunehmen.
