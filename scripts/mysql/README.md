# MySQL-8-Migration für das IDV-Verwaltungsdashboard

**Ziel:** Oracle MySQL **8.0.16 oder höher**, InnoDB, `utf8mb4`, Import via phpMyAdmin.  
**Arbeitsbranch:** `migration/mysql8-php-cutover-2026-11-10` (nicht produktiv).  
**Live-System:** GitHub `main` mit PostgreSQL auf Render. Bleibt vorerst unverändert.

## 1. SQL-Struktur für phpMyAdmin

Die SQL-Datei `scripts/mysql/mysql8-schema.sql` enthält die Struktur
der 48 Tabellen, 33 Fremdschlüssel, 14 CHECK-Bedingungen und den
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

## 3. Wichtige noch offene Entwicklungsarbeiten (PHP statt Node-Webserver)

**Die MySQL-8-Struktur und der Datenexport sind vorbereitet.
Das Dashboard ist noch nicht mit MySQL betriebsbereit.**

Insbesondere müssen vor dem Umzug noch erledigt werden:

1. Alle registrierten Node-API-Routen in **PHP 8.2+ / PDO MySQL** funktions-
   und berechtigungsgleich implementieren. Der vorhandene PHP-Router
   liefert für unvollständig portierte Routen absichtlich HTTP 501.
2. Originale PostgreSQL-Audit-, Snapshot- und Gruppenregeln im
   transaktionalen PHP-Code oder als äquivalente MySQL-Trigger abbilden.
3. `xmin` durch revisionsgesicherte InnoDB-Transaktionen ersetzen und
   alle konkurrierenden Schreibfälle testen.
4. Live-Synchronisierung, Personal/Routine/Kündigungen, POR, Beförderung,
   Archivierung, Disziplinar, Dokumentgenerator und Google-OAuth mit
   allen Rollen durchtesten.
5. Die neue gemeinsame `IDV-MySQL8-phpMyAdmin-SETUP.sql` erzeugt
   neben 48 Fachtabellen noch eine Sicherheitstabelle für Anmeldeversuche.
   GitHub Actions importiert diese Datei gegen echtes MySQL 8.
6. Erst nach vollständiger Funktionsgleichheit und Freigabe die
   Schreibzugriffe auf PostgreSQL pausieren, konsistent kopieren,
   Inhalte vergleichen, PHP-Version deployen und Live-Traffic freigeben.

Der verbindliche Ablauf steht unter `docs/UMZUG-STARTSIGNAL.md`.

Das zusätzliche `npm run mysql:audit` schreibt eine reine
SQL-Kompatibilitätsanalyse des Quellcodes nach
`migration-output/mysql-sql-audit.json`.

## 4. Was wir vom Hoster benötigen

**Keinen Node.js-Webserver.** Benötigt werden PHP 8.2+ mit `pdo_mysql`,
`openssl`, `json`, MySQL 8+, phpMyAdmin und HTTPS.
Webroot muss `public/` sein. Konfiguration, Datenexport und Secrets
dürfen niemals öffentlich liegen. Die genauen Hosting-Variablen
und Go-/No-Go-Prüfungen stehen in `PHP-MYSQL8-HOSTING.md` und
`docs/UMZUG-STARTSIGNAL.md`.
