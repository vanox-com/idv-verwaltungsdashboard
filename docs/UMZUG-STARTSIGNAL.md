# IDV – Wechsel auf PHP 8.2+ / MySQL 8: Ablauf für das Startsignal

Stand: 10. November 2026. **Noch keine Freigabe zur produktiven Umschaltung.**

## Ziel
- Heute weiterhin produktiv: `main` → Render / Node.js / PostgreSQL / `idv-ppverwaltung.de`.
- Neuer Hoster: PHP 8.2+ (PDO-MySQL, OpenSSL) und MySQL 8.0.16+, Apache-Rewrite.
- Vorbereitung ausschließlich im Branch `migration/mysql8-php-cutover-2026-11-10`; bei Push keine Änderungen auf Render.
- Während Entwicklung bleibt die alte Datenbank unverändert. **Keine personenbezogenen Daten, Passworthashes oder Geheimnisse nach GitHub committen.**
- MySQL-Struktur der Quelle: 48 Fachtabellen. Zusätzliches `idv_login_attempts` macht 49 MySQL-Tabellen; 33 Fremdschlüssel, 14 CHECK-Constraints, 8 Revisions-Trigger.

## Schritt 0 – Verbindliche Freigabesperre

Das GitHub-Repository ist **nicht allein durch einen erfolgreichen Datenbankimport bereit zum Umzug**.
Vor einem produktiven Wechsel müssen alle 102+ Node-API-Endpunkte und ihre Rechte,
Transaktionen, Rückgabewerte und Sicherheit im PHP-Backend funktional abgedeckt sein;
samt Rollen, Dienstnummern, Checklisten, Personal, Rang/POR, Kündigungen,
Kündigungsarchiv, Routinen, Routinearchiv, Disziplinar, CopNet, Protokoll,
Papierkorb, Dokumentengenerator/Google-OAuth, Design, Livestream und Login.

Aktuell liefert der PHP-Router bei fehlenden Endpunkten absichtlich HTTP 501. Die
PHP-Bootstrap-Daten sind noch nicht 1:1 mit dem Node-Bootstrap identisch.
PostgreSQL-Trigger für Audits und besondere Geschäftsregeln sind noch nicht
vollständig umgesetzt. **Deshalb noch kein Go-Live.**

Eine Freigabe erfolgt erst nach vollständigem grünen Funktions-, Security-
und Mehrbenutzertest und einem bestätigten Rückfallplan.

**Automatische Freigabekontrolle:** `npm run mysql:cutover:check`.
Das Programm prüft `scripts/mysql/cutover-readiness.json` und verweigert
die eigentliche Migration, solange dort noch offene Funktionsprüfungen stehen.
Dies ist aktuell bewusst der Fall. Die Freigabedatei darf erst nach
nachgewiesener Testabdeckung angepasst werden.

## Schritt 1 – Anforderungen vom neuen Hoster (später)

- PHP 8.2+, Extensions `pdo_mysql`, `openssl`, `json`; Apache 2.4
  mit `mod_rewrite`/aktivierter `.htaccess`; HTTPS und TLS-Zertifikat.
- DocumentRoot auf **`public/`**, niemals auf das Repository-Root.
- MySQL 8.0.16+, leere neue Datenbank `utf8mb4`/`InnoDB`, phpMyAdmin.
- Applikations-DB-Benutzer mit angemessenen Rechten; TLS mit überprüfbarem Zertifikat,
  falls DB und PHP nicht auf derselben Maschine sind.
- Im **geheimen Hosting-Environment**: `MYSQL_HOST`, `MYSQL_PORT`,
  `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`,
  optional `MYSQL_SSL_CA`, `IDV_LOGIN_RATE_SECRET` und **der bereits bestehende**
  `COPNET_ENCRYPTION_KEY` (ansonsten sind gespeicherte CopNet-Passwörter nicht
  entschlüsselbar). Diese Werte **nicht in GitHub und möglichst nicht im Chat**.
- Für Google-Dokumente: aktuelle OAuth-Client-Konfiguration/Redirect-URI am
  neuen Host ergänzen; bestehende Berechtigungen und Google-Drive-Links prüfen.
- Domain `idv-ppverwaltung.de` und DNS-Zugang beim Domainanbieter müssen
  für die spätere Umstellung bereitstehen; noch nichts daran ändern.

## Schritt 2 – Staging und Nachweis

1. PHP-Branch separat bereitstellen; ohne DNS-Umstellung auf einer privaten
   Test-URL (am besten hinter zusätzlicher Zugangsbeschränkung).
2. GitHub Actions `mysql8-php-checks` und `mysql8-integration` müssen
   erfolgreich sein. Der reale MySQL-Test prüft Import, Spalten, Trigger,
   FK, CHECK, Hash-/Rollenkompatibilität und Einmaligkeit offener Anträge.
3. Mit Testdaten jeden Frontend-Tab und jeden API-Endpunkt in allen Rollen
   durchgehen, ausdrücklich Administrator, Polizeirat, Leitungsdienst.
4. Mehrbenutzertests: zwei Sitzungen bearbeiten gleichzeitig dieselbe Personalakte,
   Checkliste, Routine und Kündigung; veraltete Revision darf nie überschreiben.
5. Funktionen und Historie vor/nach Migration vergleichen. Rechteprüfung
   serverseitig testen, nicht nur anhand ausgeblendeter Menüpunkte.
6. Erst wenn die Checkliste vollständig besteht, vor der finalen Migration
   die Produktionsdatenbank sichern und die Schreibpause planen.

## Schritt 3 – Startsignal / finale Datenübernahme

**Nur wenn die Freigabesperre aufgehoben ist:**

1. Schreibzugriff auf der alten Render-Seite kontrolliert sperren
   und alle laufenden Schreibtransaktionen auslaufen lassen.
   Vorher vollständiges PostgreSQL-Backup inkl. Zeitpunkt aufbewahren.
2. Auf einem berechtigten lokalen Rechner das Repository auf den
   freigegebenen Migrationsstand auschecken und `npm ci` ausführen.
   Node wird nur für den einmaligen Datenbanktransfer am Rechner benötigt,
   nicht auf dem neuen PHP-Webserver.
3. In **eine neue, leere** MySQL-DB die Datei
   `scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql`
   importieren (48 Quelltabellen + Login-Sicherheitstabelle).
4. Die vertraulichen Daten mit einem der vorhandenen Wege übertragen:
   - `SOURCE_DATABASE_URL=… MYSQL_DESTINATION_URL=… MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE npm run mysql:copy`
     (direkt, nur in vollständig leere Tabellen)
   - oder `SOURCE_DATABASE_URL=… npm run mysql:export`, die lokale private
     SQL-Datei geschützt über phpMyAdmin importieren.
     Die Datei ist **streng vertraulich** und wird nicht in Git gespeichert.
5. Alternativ zu den einzelnen Befehlen gibt es nach vollständiger Freigabe
   **einen** gesteuerten Lauf:
   `SOURCE_DATABASE_URL=… MYSQL_DESTINATION_URL=… MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE IDV_WRITES_STOPPED=YES IDV_CUTOVER_CONFIRMED=I_AUTHORIZE_DATA_MIGRATION npm run mysql:cutover`.
   Dieser bricht bei jedem Fehler ab, prüft zuerst das Quellschema,
   kopiert nur in eine vollständig leere Zieldatenbank und vergleicht
   die Daten anschließend automatisch.
   `SOURCE_DATABASE_URL=… MYSQL_DESTINATION_URL=… npm run mysql:verify`
   muss ohne Abweichung abschließen. Alle Daten einschließlich
   Sonderrechte, Historien und Dokumentlinks vergleichen.
   Sitzungen werden absichtlich **nicht übernommen**: erneuter Login nötig.
6. Staging auf den finalen Datenstand setzen, alle kritischen Schreib-/Lesefälle,
   Login, CopNet-Entschlüsselung, personenbezogene Ansichten und Live-Updates testen.
7. Erst danach HTTPS-Zertifikat und DNS der Domain auf den neuen Hoster
   umstellen. Routen- und Serverlogs kontrollieren.

## Schritt 4 – Zurückrollen

- Alte Render-Anwendung und PostgreSQL-Backup zunächst **nicht löschen**.
- Wenn **vor** neuen MySQL-Schreibvorgängen ein Problem auftritt:
  neue Seite sperren, DNS wieder zur alten Seite, PostgreSQL-Stand
  kontrollieren und alte Schreibsperre zurücknehmen.
- Wenn **nach** bereits erfolgten MySQL-Schreibvorgängen ein Problem auftritt:
  nicht unbesehen DNS zurückschalten! Sonst gehen neue Änderungen verloren.
  Zuerst beide Systeme schreibgeschützt schalten und die seit dem Umschalten
  entstandenen Vorgänge transaktional abgleichen bzw. kontrolliert zurückspielen.

## Schlussnotiz

**Das Umzugssignal darf erst nach bestätigter Funktionsgleichheit ausgelöst
werden.** GitHub Actions testen technische Grundvoraussetzungen, ersetzen
keinen vollständigen Business-/Rechte- und Datenabgleich.
