# IDV – Migration PostgreSQL auf MySQL

**Arbeitsbranch:** migration/mysql
**Produktiv:** main mit PostgreSQL – bleibt unverändert.
**Status:** Vorbereitungswerkzeuge angelegt; Dashboard/Backend sind noch NICHT MySQL-kompatibel.

## Technische Ausgangslage

Die Live-PostgreSQL-Datenbank hat 47 Tabellen, 31 Fremdschlüssel und
PostgreSQL-spezifische Funktionen, darunter JSONB, ::-Casts,
ON CONFLICT, RETURNING, xmin-Revisionskonflikte, Array-Ausdrücke,
Teilmengen-Indizes und Trigger. Die App führt aktuell bei jedem Start
src/schema.sql aus: Dieses Schema darf niemals gegen MySQL ausgeführt werden.

## Vorbereitete Befehle (ausschließlich im separaten Migrationsbranch)

- npm run mysql:prepare: liest nur die PostgreSQL-Struktur und erzeugt
  einen MySQL-8.0.13+-Schemaentwurf mit Prüfbericht in migration-output.
  Noch nicht zur produktiven Verwendung freigegeben.
- npm run mysql:copy: direkte Datenübertragung in eine bereits mit dem
  geprüften Schema vorbereitete, völlig LEERE MySQL-Testdatenbank;
  verweigert ohne explizites Bestätigungskennwort den Start.
  Die Quelle bleibt in einer READ-ONLY-Transaktion und wird nicht geändert.
- Sitzungen sollen nach der Umstellung ablaufen. Benutzer müssen sich
  erneut anmelden, während ihre bcrypt-Hashes und Rechte erhalten bleiben.

## Vorbereitung auf sicherem Entwicklerrechner

Voraussetzung MySQL 8.0.13+ mit InnoDB und utf8mb4.
MariaDB ist bislang nicht getestet. Die MySQL-Verbindung sollte TLS verwenden.

Umgebungsvariablen (nur im Secret Store, nicht in Git oder Chat):

SOURCE_DATABASE_URL = PostgreSQL-Lesezugang zur bisherigen DB.
MYSQL_DESTINATION_URL = mysql://... zur neuen LEEREN Testdatenbank.
MYSQL_SSL = required (falls TLS vom neuen Anbieter verlangt wird).
MYSQL_COPY_CONFIRM = EMPTY_NEW_DATABASE (explizite Bestätigung).

Ablauf:

1. npm install, dann npm run mysql:prepare mit SOURCE_DATABASE_URL.
2. Lokalen Bericht migration-output/mysql-report.json prüfen.
3. PostgreSQL-Trigger, CHECK-Regeln und Partial-Unique-Indizes manuell
   auf MySQL portieren und generiertes Schema entsprechend korrigieren.
4. MySQL-Schema ausschließlich in eine neue, vollständig leere DB laden.
5. npm run mysql:copy mit beiden Datenbankverbindungen und bestätigtem
   MYSQL_COPY_CONFIRM ausführen.
6. Zeilenzahlen, Beziehungen, Daten, Rollen, Personalsnapshots,
   Kündigungen, Routinearchive und Dokumentverknüpfungen vergleichen.

Niemals persönliche Daten, Zugangsdaten oder Exportdateien committen.
Das Skript erzeugt keine Exporte mit Daten im Dateisystem.

## Was noch vor dem Produktivwechsel fehlt

1. DB-Adapter und sämtliche PostgreSQL-spezifischen Backend-Abfragen
   zu MySQL-8-kompatiblen SQL-Anweisungen umschreiben.
2. PostgreSQL-Trigger für Änderungsjournal, Gruppen- und
   Kündigungssnapshots durch geprüfte MySQL-Äquivalente ersetzen.
3. Optimistic-Locking statt xmin in SQL und API mit echten Revisionen
   implementieren und parallele Bearbeitungen testen.
4. Einzelrechte, POR-Freigaben, Beförderungen, Urkunden, Routinetermine,
   historische Namen und Personalakten vollständig abnehmen.
5. Vor der endgültigen Umschaltung alte Schreibzugriffe pausieren,
   frische konsistente Kopie erstellen, Hashes und Zeilenzahlen validieren,
   MySQL-Backend testen und erst danach DNS/Hosting umschalten.
6. Rollback auf PostgreSQL bis zur erfolgreichen Freigabe vorhalten.

## Angaben zum Zielhoster

Benötigt werden Anbieter, MySQL-/MariaDB-Version, SSL- und Portvorgaben
sowie die Node.js-Start-/Deploymentmöglichkeiten. Passwörter bitte
ausschließlich in die Secret-/Environment-Verwaltung des Hosters eintragen.
