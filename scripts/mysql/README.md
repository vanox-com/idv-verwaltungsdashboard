# IDV – PostgreSQL nach MySQL 8 (PHP-Zielhoster)

**Entwicklungsbranch:** `migration/mysql8-php-cutover-2026-11-10`  
**Live bleibt unverändert:** Render/Node/PostgreSQL auf `main`.  
**Noch keine Freigabe zum Anbieterwechsel.**

## Schemaeinrichtung: zwei alternative Wege

**Automatischer Wechsel (bevorzugt):** Leere neue MySQL-Datenbank
**ohne Tabellen** bereitstellen. `npm run mysql:cutover` führt nach
vollständiger Freigabe den SQL-Schemainstallationstest, den sicheren
Datentransfer und den Vergleich zusammen aus. Er benötigt außerdem
`MYSQL_SCHEMA_CONFIRM=EMPTY_NEW_DATABASE`,
`MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE`, die geschützten Verbindungsdaten
und die Schreibstopp-/Freigabebestätigung.

**Manuell:** In eine absolut leere DB einmalig die Datei
`scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql` per phpMyAdmin importieren.
Danach **nur** Datenimport und Verifikation ausführen – nicht den
automatischen Schema-Installer nochmals starten.

Die Setupdatei enthält alle 48 Fachtabellen, die zusätzliche
Sicherheitstabelle für Anmeldeversuche, 33 FKs, 14 CHECK-Regeln,
Revisionsspalten und 35 Trigger (8 Revision, 27 Geschäftsregeln).

**Nicht zusätzlich** `mysql8-schema.sql`, `mysql8-revisions.sql`,
`mysql8-php-security.sql` oder `mysql8-business-triggers.sql`
einspielen. Diese Bestandteile sind in der Setupdatei enthalten.
Doppelte Imports würden scheitern.

## Vertraulichen Datenstand kopieren

**Vor dem finalen Transfer müssen alle alten Schreibzugriffe
pausiert und Backups des PostgreSQL-Systems vorhanden sein.**
Datenexportdateien enthalten personenbezogene Daten,
Passworthashes, Dokumentlinks und ggf. geschützte Inhalte.
Sie dürfen niemals nach GitHub gelangen.

Am berechtigten Entwicklerrechner mit Node.js (nur für Migration,
nicht auf dem PHP-Zielserver):

```bash
npm install --ignore-scripts --no-package-lock
SOURCE_DATABASE_URL="postgresql://..." npm run mysql:prepare
```

Für direkten Transfer in eine vollständig leere MySQL-Datenbank:

```bash
SOURCE_DATABASE_URL="postgresql://..." \
MYSQL_DESTINATION_URL="mysql://..." \
MYSQL_COPY_CONFIRM=EMPTY_NEW_DATABASE \
npm run mysql:copy
```

Alternativ für phpMyAdmin einen privaten lokalen Datenexport
erzeugen:

```bash
SOURCE_DATABASE_URL="postgresql://..." npm run mysql:export
```

Es entsteht `migration-output/mysql8-data-PRIVATE.sql` (streng
vertraulich). Nur nach dem einmaligen leeren Setup importieren.
**Session-Tokens werden nicht kopiert**; alle melden sich nach
dem Umzug neu an.

Vergleich nach Import:

```bash
SOURCE_DATABASE_URL="postgresql://..." \
MYSQL_DESTINATION_URL="mysql://..." \
npm run mysql:verify
```

## Freigabesperre und Ein-Kommando-Ablauf

`npm run mysql:cutover:check` zeigt den
verbindlichen Funktions-/Sicherheitsteststatus. Solange offene
Punkte in `scripts/mysql/cutover-readiness.json` stehen,
**verweigert** `npm run mysql:cutover` die Datenmigration.
Die Freigabedatei darf nur nach realen QA-Nachweisen angepasst werden.

Erst nach Aufhebung aller Sperren kann der Cutover-Lauf mit
den geschützten DB-Zugangsdaten, Schreibstopp-Bestätigung und
`IDV_CUTOVER_CONFIRMED=I_AUTHORIZE_DATA_MIGRATION`
Preflight, MySQL-Schemainstallation, Kopieren und Vergleich gemeinsam ausführen.

Das Skript führt **keine DNS-Änderung** aus und verändert
die PostgreSQL-Quelle nicht. Neue PHP-Datenbankeinträge nach
Live-Umschaltung benötigen einen gesonderten Rückfallplan.

## Noch offene Entwicklung

Die 103 erfassten API-Routen sind nach PHP portiert. Es fehlen aber
noch verbindliche **Funktionsgleichheitsnachweise** für alle Rollen,
Gleichzeitigkeit, Historien-Sonderfälle und die echten
Google-Dokumenten-Vorlagen. Nicht erfasste PHP-Routen liefern weiterhin
HTTP 501. Bis zum vollständigen Nachweis bleibt das Cutover-Kommando gesperrt.

Der vollständige Startsignal- und Rückfallplan steht unter
`docs/UMZUG-STARTSIGNAL.md`.
