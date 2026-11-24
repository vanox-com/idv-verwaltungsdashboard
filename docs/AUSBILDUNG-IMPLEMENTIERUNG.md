# Ausbildungsabteilung – Stand 24.11.2026

Arbeitsbranch: `migration/mysql8-php-cutover-2026-11-10`. `main` und die bisherige Personalverwaltung werden bei dieser Erweiterung nicht umgestellt.

## 1. Installation auf dem bereits laufenden PHP-/MySQL-8-Hoster

1. Unbedingt vollständige Datenbank- und Dateisicherungen erstellen.
2. **Nur die beiden additiven** SQL-Skripte `scripts/mysql/2026-11-24-ausbildung.sql` und anschließend `scripts/mysql/2026-11-24-aulk-public.sql` in die vorhandene MySQL-8-Datenbank über phpMyAdmin importieren. Bereits installierte Tabellen bleiben erhalten. Die große `IDV-MySQL8-phpMyAdmin-SETUP.sql` darf niemals erneut auf die bestehende Datenbank eingespielt werden.
3. Das PHP-/Public-Paket des angegebenen Branches deployen. Der Webserver-DocumentRoot muss weiterhin `public/` sein.
4. PHP benötigt die bereits eingesetzten Module, insbesondere `pdo_mysql`, `openssl` und `zip`. Für Dateiuploads ggf. `upload_max_filesize=40M`, `post_max_size=45M` oder höher konfigurieren. Große 99-MB-ZIP-Dateien sind **nicht** direkt für diesen Upload vorgesehen: Module vorher entpacken.
5. Für private Lehrmaterialien muss `private/ausbildung-files/` außerhalb des Webroots für den PHP-Prozess dauerhaft beschreibbar sein. Optional `IDV_AUSBILDUNG_FILES_DIR=/absoluter/geschuetzter/pfad` setzen. Rechte, regelmäßige Backups und Beständigkeit über Deployments prüfen. Dateien nicht in GitHub einspielen.
6. Den Administrator für den neuen Ausbildungsbereich öffnen lassen (`/` → Ausbildung). Ausbildungsleitung und Ausbilder werden als **neue** Benutzerkonten angelegt. Vorhandene Polizeikonten werden nicht umbenannt, entsperrt oder mit Ausbildungskonten überschrieben. Bestehende Rollen-/Einzelberechtigungen werden durch die Ausbildungsmigration nicht geändert.
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
- **Ausbilder:** neuer eigenständiger Zugang mit Kennung **`AUS-<Dienstnummer>`** in **demselben Login und Panel**; die angezeigte Ausbildungs-Dienstnummer bleibt ohne Präfix. Auch wenn die Polizeidienstnummer bereits vergeben ist, bleibt das alte Konto unverändert. Sieht in der Navigation ausschließlich die Ausbildungskategorie. Die Bootstrap-API liefert diesem Konto keine Personal-/Polizeiratdaten. Ausbilder dürfen nur freigegebene Module ändern sowie bei PMA eine eigene Stimme abgeben.
- **Bestehende Administrator-/Polizeikonten:** behalten ihre bisherigen Daten und Berechtigungen unverändert. Der Administrator sieht die Ausbildung über eine serverseitige Regel. Polizeirat und Leitungsdienst erhalten **keine neuen Standardberechtigungen durch die Datenbankmigration**. Wenn deren Zugriff später gewünscht ist, wird er gesondert eingerichtet.
- **Kein Ausbilder-/Leitungszugang** für allgemeine Personal-, Disziplinar-, Protokoll- oder Polizeirat-APIs. Die Durchsetzung erfolgt serverseitig in `php/Api.php`.
- Bestehende Polizeikonten bleiben bei Entzug eines zusätzlichen Ausbilderrechts erhalten. Reine Ausbilderkonten werden gesperrt und laufende Sitzungen beendet; kein physisches Löschen von auditpflichtigen Daten.
- **Bearbeitungsschutz:** Jeder Anwärter hat eine `revision`. Änderungen an Modul oder Stimme erfolgen transaktional mit `SELECT ... FOR UPDATE` und erwarten dieselbe Revision; HTTP 409 weist auf einen Bearbeitungskonflikt hin.
- **Externer Status:** Eine individuell freigegebene 256-Bit-Zufallskennung liegt im URL-Fragment, nicht im HTTP-Pfad. Der Server speichert nur den SHA-256-Hash. Ein öffentlicher POST-Endpunkt gibt ausschließlich Modulfortschritt und Prüfungsstatus ohne Name, Dienstnummer, Kommentare, E-Mail oder Einzelstimmen zurück. Ein neuer Link entwertet den bisherigen.
- **Private Unterlagen:** Speicherung nur außerhalb `public/`, Uploadprüfung auf zulässige Office-/PDF-Formate, Download nur über authentifizierte und berechtigte API.

## 4. Oberfläche

- Im bestehenden Panel: neue Navigationsgruppe **Ausbildung**. Die eigentlichen Ausbildungsansichten werden **direkt in `/` innerhalb des bestehenden Panels** dargestellt, ohne einen zweiten Verwaltungsbereich.
- `/#ausbildung`: integrierte Übersicht, PMA-/PKA-/KKA-Monitore, Ausbilderverwaltung und interne Ausbildungsunterlagen. Das bisherige `/ausbildung.html` leitet dorthin weiter.
- `/aulk` (alternativ `/aulk.html`): **öffentliche** AuLK-Unterlagenbibliothek ohne Login. Ausschließlich durch die Ausbildungsleitung einzeln freigegebene Google-Links und hochgeladene Dateien werden angezeigt. Default ist privat. Die sechs ausdrücklich `EXTERN` benannten Präsentationen aus dem bereitgestellten ZIP sind für die nachträgliche Publikation getrennt vorbereitet. Personen-/Prüfungsdaten und `INTERN`-Dateien werden nicht automatisch veröffentlicht.
- `/ausbildung-status.html#<individueller-schluessel>`: externe schreibgeschützte Anwärteransicht ohne Login.
- Google Site: <https://sites.google.com/view/aulk2026/startseite>. Ein Link ist vorhanden. Embedding/Google-Drive-Einzelberechtigungen sind auf dem echten Hoster gesondert zu prüfen; nicht alle Inhalte der ZIP dürfen ohne Login sichtbar werden.

## 5. Verifikation

`.github/workflows/ausbildung.yml` testet die PHP-Statusberechnung, Isolierung der Rollen, JavaScript-Syntax und die wiederholte idempotente SQL-Erweiterung auf echtem MySQL 8.

Erfolgreiche CI-Tests sind **kein** Beleg für produktive Installation. Auf dem Hoster sind SQL-Import, Live-Login, Freigaberechte, Datei-Uploads, Google-Links, gleichzeitige Bearbeitung und externe Links in einer getrennten Testrolle abzunehmen.

## 6. Dokumente öffentlich stellen

Nach Deployment und SQL-Migration öffnet die Ausbildungsleitung im **normalen Polizeipanel** die Kategorie **Ausbildung → Ausbildungsunterlagen**. Sie lädt ausschließlich ausdrücklich zur Veröffentlichung vorgesehene Präsentationen hoch oder trägt freigegebene Google-Links ein. Neben jedem Dokument kann sie **Öffentlich freigeben** wählen; erst dann wird es unter `/aulk` sichtbar. Widerruf entfernt es wieder aus dem Katalog und sperrt den öffentlichen Download. Google Drive muss eigene Linkfreigaben passend konfigurieren.

Die sechs im ZIP mit `EXTERN` benannten PMA-Präsentationen wurden gesondert zusammengestellt; es wird nichts davon automatisch ins öffentliche Repository gepusht. PM.0 sowie PK.1–PK.4 sind ohne ausdrückliche `EXTERN`-Kennzeichnung zunächst zurückgestellt. Die bestehende AuLK-Google-Site bleibt verlinkt.

## 8. Zwingender Bestandsdatenschutz – nur neue Ausbildungsdatensätze

**Vorgabe:** Alle Ausbilder, Anwärter, Abstimmungen, Modulabschlüsse und Dokumente werden in der neuen Ausbildungsverwaltung **neu eingepflegt**. Es erfolgt **keine automatische Übernahme, Synchronisation, Zusammenführung oder Aktualisierung** bestehender Personal-, Kündigungs-, Beförderungs-, Disziplinar- oder sonstiger Polizeidaten. Vorhandene Personal-/Benutzerkonten einschließlich Passwörtern, Rollen, Sperrstatus und Dienstnummern werden nicht bearbeitet.

Die MySQL-Erweiterung legt sechs neue Ausbildungstabellen an und ergänzt **nur neue** Einträge für die Rollen `Ausbilder` und `Ausbildungsleitung`. Sie verändert keine vorhandenen Rollenrechte für Administrator, Polizeirat oder Leitungsdienst. `ausbildung_module` bekommt bei der ersten Einrichtung elf neue **Moduldefinitionen**, aber noch keine Anwärter-, Ausbilder-, Bewertungs- oder Dokumenteinträge.

Ein neuer Ausbilder mit der Ausbildungs-DN `13` erhält beispielsweise das separate Login `AUS-13`; ein eventuell vorhandenes Polizeikonto `13` behält vollständig seine bisherigen Daten, Rechte und Passwörter. Eine Ausbildungsleitung darf keinen bestehenden Polizeizugang über die Ausbilderverwaltung umwidmen. Bei Entzug eines Ausbilderzugangs wird ausschließlich der separate Ausbildungsbenutzer gesperrt; bestehende Polizeibenutzer werden nicht angetastet.

Die alten Excel-Dateien und ZIP-Präsentationen dienen als Strukturvorlage, **nicht** als ungeprüfte Importquelle. Persönliche Daten werden ausschließlich durch bewusstes Neuanlegen im Ausbildungsbereich erfasst. Der öffentliche AuLK-Katalog startet leer; Dateien müssen nach Upload einzeln freigegeben werden.

Die CI-Tests `tests/ausbildung-http.sh` und `tests/ausbildung-setup-http.sh` prüfen insbesondere, dass eine bereits existente Polizeidienstnummer nicht verändert wird und dass Bestandsbenutzer, Police-Rollen und Berechtigungen nach der Migration identisch bleiben.
