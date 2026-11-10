# IDV – PostgreSQL nach MySQL 8 (PHP-Zielhoster)

**Entwicklungsbranch:** `migration/mysql8-php-cutover-2026-11-10`  
**Live bleibt unverändert:** Render/Node/PostgreSQL auf `main`.  
**Noch keine Freigabe zum Anbieterwechsel.**

## Genau eine SQL-Setupdatei

Zum neuen Hoster gehört die Datei
`scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql`.
Importiere sie **einmalig in eine komplett leere Datenbank**
unter MySQL 8.0.16+ via phpMyAdmin oder `mysql`-Client.

Sie enthält **bereits** alle 48 Fachtabellen, die zusätzliche
Sicherheitstabelle für Anmeldeversuche, 33 FKs, 14 CHECK-Regeln,
Revisionsspalten und acht Konfliktschutz-Trigger.

**Nicht zusätzlich die Dateien `mysql8-schema.sql`,
`mysql8-revisions.sql` oder `mysql8-php-security.sql`
einspielen** – diese Einzelteile sind im kombinierten Setup
bereits enthalten. Doppelte Imports würden scheitern.

## Vertraulichen Datenstand kopieren

**Vor dem finalen Transfer müssen alle alten Schreibzugriffe
pausiert und Backups des PostgreSQL-Systems vorhanden sein.**
Datenexportdateien enthalten personenbezogene Daten,
Passworthashes, Dokumentlinks und ggf. geschützte Inhalte.
Sie dürfen niemals nach GitHub gelangen.

Am berechtigten Entwicklerrechner mit Node.js (nur für Migration,
nicht auf dem PHP-Zielserver):

```bash
npm ci
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
Preflight, Kopieren und Vergleich gemeinsam ausführen.

Das Skript führt **keine DNS-Änderung** aus und verändert
die PostgreSQL-Quelle nicht. Neue PHP-Datenbankeinträge nach
Live-Umschaltung benötigen einen gesonderten Rückfallplan.

## Noch offene Entwicklung

Obwohl der echte MySQL-8-Import und synthetische HTTP-/PDO-Tests
funktionieren, ist die PHP-Version **noch nicht gleichwertig**
mit den 102+ produktiven API-Routen. Insbesondere POR,
Beförderungen, Routinearchive, Kündigungsarchive, Disziplin,
Dokumentgenerator/Google-OAuth und vollständige Audit-/Rechte-
sowie Mehrbenutzer-Szenarien müssen fertig portiert/getestet
werden. Nicht implementierte PHP-Routen liefern absichtlich HTTP 501.

Der vollständige Startsignal- und Rückfallplan steht unter
`docs/UMZUG-STARTSIGNAL.md`.
