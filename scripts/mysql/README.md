# MySQL-8-Migration für das IDV-Verwaltungsdashboard

**Ziel:** Oracle MySQL **8.0.16 oder höher**, InnoDB, `utf8mb4`, Import via phpMyAdmin.  
**Arbeitsbranch:** `migration/mysql` (nicht produktiv).  
**Live-System:** GitHub `main` mit PostgreSQL auf Render. Bleibt vorerst unverändert.

## 1. SQL-Struktur für phpMyAdmin

Die SQL-Datei `scripts/mysql/mysql8-schema.sql` enthält die Struktur
der 47 Tabellen, 31 Fremdschlüssel, 11 CHECK-Bedingungen und den
Sonderfall „maximal ein offener Rangantrag pro Person“.

Der neue Hoster legt eine **vollständig leere MySQL-8-Datenbank** an.
Danach die Datei in **phpMyAdmin → Datenbank auswählen → Importieren**
einspielen. Nicht über eine bestehende Datenbank importieren.

Das SQL enthält **keine** personenbezogenen Daten, Passwörter, Benutzerkonten
oder sonstigen Inhalte; lediglich die Struktur. Diese Datei kann daher im
Migrationsbranch liegen.

### Struktur gegen PostgreSQL abgleichen

Auf einem sicheren Entwicklerrechner mit Leserechten zur Quelle:

```bash
npm install
SOURCE_DATABASE_URL="..." npm run mysql:prepare
```

Der Preflight verweigert den Export, wenn Anzahl/Namen der Tabellen,
Fremdschlüssel oder CHECK-Constraints vom vorbereiteten MySQL-Schema
abweichen. Die Kopie der SQL-Datei und der Bericht werden lokal unter
`migration-output/` erzeugt.

## 2. Historische Daten übernehmen

**Privat und vertraulich:** Das Personal- und Auditarchiv enthält
personenbezogene Daten und die Benutzerliste enthält bcrypt-Passworthashes.
Deshalb werden diese Inhalte **niemals nach GitHub committed**.

### Möglichkeit A: Import über phpMyAdmin

Auf einem berechtigten Rechner mit PostgreSQL-Lesezugang:

```bash
SOURCE_DATABASE_URL="..." npm run mysql:export
```

Danach entsteht lokal `migration-output/mysql8-data-PRIVATE.sql`.
Diese vertrauliche Datei ausschließlich den berechtigten Administratoren
über einen gesicherten Kanal zur Verfügung stellen, in der neu angelegten
MySQL-Datenbank **nach** dem Struktur-SQL importieren und danach die lokale
Exportdatei sicher verwahren oder löschen. Vor dem tatsächlichen Cutover
müssen alle bisherigen Schreibzugriffe gestoppt werden, damit keine
Änderungen nach dem Export verloren gehen.

Die Datei exportiert **keine Session-Tokens**: Alle Benutzer müssen sich
nach dem Umzug erneut anmelden. Die Passworthashes bleiben erhalten.

### Möglichkeit B: Direkter Datenbanktransfer

```bash
SOURCE_DATABASE_URL="..." \
MYSQL_DESTINATION_URL="mysql://..." \
MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE \
npm run mysql:copy
```

Der Transfer funktioniert nur mit bereits vorbereitetem MySQL-Schema
und **vollständig leerer** Zieldatenbank. Sobald irgendeine Zieltabelle
Daten enthält, bricht das Werkzeug ab. Persönliche Daten werden nicht
als SQL-Datei abgelegt.

## 2b. Revisions-/Konfliktschutz und Datenprüfung

Die Datei `scripts/mysql/mysql8-revisions.sql` wird **nach dem Datenimport**
in phpMyAdmin eingespielt. Sie legt in den acht bisher mit PostgreSQL-`xmin`
geschützten Datenbereichen MySQL-Revisionsfelder und UPDATE-Trigger an.
Sie ist ein notwendiger **Backend-Migrationsbaustein**, keine alleinige
Fertigstellung des Konfliktschutzes.

Mit `npm run mysql:verify` können Quelle und MySQL-Ziel anschließend
nur lesend auf übereinstimmende Datensatzanzahlen und Inhalte geprüft werden:

```bash
SOURCE_DATABASE_URL="..." MYSQL_DESTINATION_URL="mysql://..." npm run mysql:verify
```

Der Vergleich protokolliert **keine personenbezogenen Inhalte** und
bricht bei Abweichungen mit Fehlercode ab. Quell-Datenbank und Zieldatenbank
werden von diesem Test nicht verändert. Für den Produktivwechsel ist nach
dem letzten Schreibstopp noch einmal ein frischer Export und Vergleich nötig.

## 3. Wichtige noch offene Entwicklungsarbeiten

**Die MySQL-8-Struktur und der Datenexport sind vorbereitet.
Das Dashboard ist noch nicht mit MySQL betriebsbereit.**

Insbesondere müssen vor dem Umzug noch erledigt werden:

1. `src/db.js`, `src/server.js` und sämtliche API-Module von
   PostgreSQL-/`pg`-SQL auf `mysql2` umbauen.
2. `$1`-Platzhalter, `ON CONFLICT`, `RETURNING`, `JSONB`,
   PostgreSQL-Arrays und Datumsoperationen einzeln umsetzen.
3. Die PostgreSQL-Trigger für Personalgruppen, Kündigungssnapshots und
   Änderungsvergleich als MySQL-Trigger oder transaktionale Backend-
   Operationen rekonstruieren, inkl. Benutzerzuordnung im Audit.
4. `xmin` durch MySQL-Revisionsspalten ersetzen, gleichzeitige
   Änderungen testen und Überschreibschutz gewährleisten.
5. Module vollständig funktional und sicherheitstechnisch testen:
   Login, Benutzerrechte, Personal, Kündigungen, POR, Beförderungen,
   Urkunden, Routinen, Archive, Dokumente, Historie.
6. Erst dann die Schreibzugriffe auf PostgreSQL pausieren,
   frischen Datenstand konsistent kopieren, Zeilenzahlen/Dokumente/
   Beziehungen vergleichen, MySQL-8-System deployen und Live-Traffic
   freigeben. Rollback auf PostgreSQL vorhalten.

Das zusätzliche `npm run mysql:audit` schreibt eine reine
SQL-Kompatibilitätsanalyse des Quellcodes nach
`migration-output/mysql-sql-audit.json`.

## 4. Was wir vom Hoster benötigen

Ein Webserver, der eine **Node.js-/Express-Anwendung** aus dem
GitHub-Repository automatisch baut und startet, und eine erreichbare
MySQL-8-Datenbank. Verbindungseinstellungen wie Host, Port,
Datenbankname, Benutzer und TLS kommen **nur** in den Secret-Store
des Hosters; **keine** Passwörter in Chat oder GitHub.

Eine phpMyAdmin-Oberfläche allein führt Node.js nicht aus.
