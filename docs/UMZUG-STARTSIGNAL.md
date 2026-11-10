# IDV – Wechsel auf PHP 8.2+ / MySQL 8: Ablauf für das Startsignal

Stand: 10. November 2026. **Noch keine Freigabe zur produktiven Umschaltung.**

## Ziel
- Heute weiterhin produktiv: `main` → Render / Node.js / PostgreSQL / `idv-ppverwaltung.de`.
- Neuer Hoster: PHP 8.2+ (PDO-MySQL, OpenSSL, cURL, ZIP) und MySQL 8.0.16+, Apache-Rewrite.
- Vorbereitung ausschließlich im Branch `migration/mysql8-php-cutover-2026-11-10`; bei Push keine Änderungen auf Render.
- Während Entwicklung bleibt die alte Datenbank unverändert. **Keine personenbezogenen Daten, Passworthashes oder Geheimnisse nach GitHub committen.**
- MySQL-Struktur der Quelle: 48 Fachtabellen. Zusätzliches `idv_login_attempts` macht 49 MySQL-Tabellen; 33 Fremdschlüssel, 14 CHECK-Constraints und 35 Trigger (8 Revisions- und 27 Geschäfts-/Historien-Trigger).

## Schritt 0 – Verbindliche Freigabesperre

Das GitHub-Repository ist **nicht allein durch einen erfolgreichen Datenbankimport bereit zum Umzug**.
Vor einem produktiven Wechsel müssen alle 103 erfassten Node-API-Endpunkte und ihre Rechte,
Transaktionen, Rückgabewerte und Sicherheit im PHP-Backend funktional abgedeckt sein;
samt Rollen, Dienstnummern, Checklisten, Personal, Rang/POR, Kündigungen,
Kündigungsarchiv, Routinen, Routinearchiv, Disziplinar, CopNet, Protokoll,
Papierkorb, Dokumentengenerator/Google-OAuth, Design, Livestream und Login.

Aktuell liefert der PHP-Router bei fehlenden Endpunkten absichtlich HTTP 501. Die
PHP-Bootstrap-Daten sind noch nicht 1:1 mit dem Node-Bootstrap identisch.
Die MySQL-Trigger sind implementiert; ihre vollständige Gleichwertigkeit mit den
bisherigen PostgreSQL-Geschäftsregeln ist noch nicht abschließend nachgewiesen. **Deshalb noch kein Go-Live.**

Eine Freigabe erfolgt erst nach vollständigem grünen Funktions-, Security-
und Mehrbenutzertest und einem bestätigten Rückfallplan.

**Automatische Freigabekontrolle:** `npm run mysql:cutover:check`.
Das Programm prüft `scripts/mysql/cutover-readiness.json` und verweigert
die eigentliche Migration, solange dort noch offene Funktionsprüfungen stehen.
Dies ist aktuell bewusst der Fall. Die Freigabedatei darf erst nach
nachgewiesener Testabdeckung angepasst werden.

## Schritt 1 – Anforderungen vom neuen Hoster (später)

- PHP 8.2+, Extensions `pdo_mysql`, `openssl`, `json`, `curl`, `zip`; Apache 2.4
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
   freigegebenen Migrationsstand auschecken und `npm install --ignore-scripts --no-package-lock` ausführen.
   Node wird nur für den einmaligen Datenbanktransfer am Rechner benötigt,
   nicht auf dem neuen PHP-Webserver.
3. **Bevorzugt: einmaliger freigegebener Automatik-Lauf in eine völlig leere MySQL-Datenbank.**
   Die Ziel-Datenbank muss **existieren, aber noch keine Tabellen enthalten**.
   **Nicht vorher manuell die SQL-Setupdatei importieren.** Der Befehl
   prüft die PostgreSQL-Struktur, installiert das MySQL-8-Schema mit allen
   Triggern, kopiert die vertraulichen Daten und prüft anschließend jeden
   Datensatz auf Übereinstimmung:

   ```bash
   SOURCE_DATABASE_URL="postgresql://..." \
   MYSQL_DESTINATION_URL="mysql://..." \
   IDV_EXPECTED_SOURCE_DATABASE="QUELLDATENBANK" \
   IDV_EXPECTED_TARGET_DATABASE="NEUE_ZIELDATENBANK" \
   MYSQL_SCHEMA_CONFIRM=EMPTY_NEW_DATABASE \
   MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE \
   IDV_WRITES_STOPPED=YES \
   IDV_WRITE_FREEZE_VERIFIED=YES \
   IDV_BACKUP_CONFIRMED=RESTORE_TESTED \
   IDV_STAGING_ACCEPTED=PASSED \
   IDV_ROLLBACK_CONFIRMED=YES \
   IDV_CUTOVER_CONFIRMED=I_AUTHORIZE_DATA_MIGRATION \
   npm run mysql:cutover
   ```

   Die zusätzlichen Bestätigungen sind **keine automatische Datensicherung
   oder Schreibsperre**. Sie dürfen nur gesetzt werden, nachdem ein
   PostgreSQL-Backup erfolgreich wiederhergestellt, die alte Anwendung
   tatsächlich schreibgesperrt und der Staging-/Rückfallplan abgenommen
   wurde. Die beiden erwarteten Datenbanknamen müssen exakt mit
   den URLs übereinstimmen (Fehlbedienungsschutz).

   Solange `cutover-readiness.json` offene Prüfpunkte meldet, verweigert
   das Skript den Lauf. Zugangsdaten nur im geschützten Terminal bzw.
   Secret-Store verwenden, **niemals in GitHub speichern**.

4. **Alternativ: manueller phpMyAdmin-Weg** – jedoch nicht mit Schritt 3
   kombinieren: `IDV-MySQL8-phpMyAdmin-SETUP.sql` einmalig in eine leere
   Datenbank importieren; danach entweder `npm run mysql:copy` oder
   `npm run mysql:export` und den lokalen, vertraulichen Datenexport
   über phpMyAdmin importieren. Im Anschluss zwingend
   `npm run mysql:verify` ausführen.

5. Alle Daten einschließlich Sonderrechte, Historien und Dokumentlinks
   müssen ohne Abweichungen verglichen sein. Sitzungen werden absichtlich
   **nicht übernommen**: Alle Benutzer müssen sich erneut anmelden.
   Nach einem fehlerhaften **Teilimport** die Ziel-Datenbank vollständig
   neu erstellen; MySQL-DDL kann nicht transaktional zurückgerollt werden.
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

## Schritt 5 – Übergabe zur späteren Ausführung

Der vollständige, noch **nicht freigegebene** Ablauf mit Staging-
Nachweisen, Rückfall vor/nach ersten MySQL-Schreibvorgängen und
allen zusätzlichen Sicherheitsbestätigungen ist in
`docs/MIGRATION-SCHRITT-5.md` dokumentiert.

## Schlussnotiz

**Das Umzugssignal darf erst nach bestätigter Funktionsgleichheit ausgelöst
werden.** GitHub Actions testen technische Grundvoraussetzungen, ersetzen
keinen vollständigen Business-/Rechte- und Datenabgleich.
