# IDV: PHP 8.2+ und MySQL 8.0.16+ ohne Node-Webserver

**Status: Migrations-Entwicklung – NICHT zur produktiven Umschaltung freigegeben.**
Stand 10.11.2026. Arbeitsbranch: `migration/mysql8-php-cutover-2026-11-10`.

Der bisherige GitHub-Branch `main`, die Domain `idv-ppverwaltung.de`, Render
und PostgreSQL wurden durch diese Arbeiten nicht umgestellt. Das bestehende
Portal bleibt für den normalen Betrieb unverändert.

## Zielhoster

Benötigt: MySQL 8.0.16+ (InnoDB/utf8mb4), PHP 8.2+
(`pdo_mysql`, `openssl`, `json`), Apache 2.4 mit `mod_rewrite`
oder gleichwertiges Rewrite-Routing, HTTPS, Zugriff auf phpMyAdmin.

**DocumentRoot muss `public/` sein**, niemals das Repository-Root.
`src/`, `php/`, `scripts/`, `migration-output/` und private
Konfiguration dürfen nicht im Webroot liegen. Kein `npm start` auf dem
Zielserver notwendig. Node.js wird nur für die einmaligen lokalen
Import-/Vergleichswerkzeuge verwendet.

Im Secret-Store des Hosters (nicht in GitHub) konfigurieren:

| Variable | Zweck |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT` | MySQL-Adresse und Port |
| `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | neue DB, eingeschränkter Nutzer |
| `MYSQL_SSL_CA` | optional Pfad zur vertrauenswürdigen TLS-CA |
| `IDV_LOGIN_RATE_SECRET` | sicheres Secret für Login-Drosselung |
| `COPNET_ENCRYPTION_KEY` | derselbe 64-stellige Hex-Schlüssel wie im bisherigen System; erforderlich für bestehende CopNet-Zugänge |

Die bestehende Google-OAuth-Konfiguration und neue Redirect-URI müssen
vor dem Go-Live ebenfalls geprüft werden. Insbesondere Dokumentgeneratoren
dürfen nicht heimlich von bisherigen Google-Drive-Verknüpfungen abweichen.

## Datenbank

Die PostgreSQL-Live-Datenbank wurde **nur lesend** auf 48 Fachtabellen,
33 FKs, 14 CHECK-Constraints und 316 Spalten geprüft.

`scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql` baut in einer neuen
leeren MySQL-Datenbank 48 Fachtabellen plus die zusätzliche
`idv_login_attempts`-Sicherheitstabelle, die 33 FKs, 14 CHECK-Regeln
und acht Revisions-Trigger auf. Der Import und grundlegende PDO-
Funktionstests wurden in GitHub Actions gegen echtes MySQL 8 getestet.

Die Bestandsdaten müssen später separat und **vertraulich** übertragen
werden. Dafür gibt es:

- `npm run mysql:prepare` – PostgreSQL-Schema nur lesend vergleichen
- `npm run mysql:export` – lokaler privater SQL-Export für phpMyAdmin
- `npm run mysql:copy` – direkter PostgreSQL→leere-MySQL-Transfer
- `npm run mysql:verify` – Datenbestand Zeile für Zeile vergleichen

Quell- und Zieldatenbank-Zugangsdaten ausschließlich auf einem berechtigten,
geschützten Rechner als Umgebungsvariablen setzen. Session-Cookies/Tokens
werden nicht migriert, Nutzer melden sich neu an.

## Auf PHP bereits portierte Bereiche

Login (bcrypt), Sitzungen/Passwortwechsel, Drosselung, differenzierte
Berechtigungen und Datenausgabe, zentrale Bootstrap-Leseansicht (noch
nicht identisch zum Node-Bootstrap), Routintermin-Erstellung, Benutzer-
und Rollenrechte, Systemoptionen, Dashboard-Layout, Portaldesign,
Bekanntmachungen, Personalbearbeitung und freie Nummern, Kündigung
aus Personalstatus mit Snapshot, administrative Personallöschung,
Personalhistorie, Checklisten inkl. Revisionsschutz, Textbausteine,
Mitteilungen, Sperrfristen/Blacklist, Geburtstage/Jubiläen,
Organigramm, Personalstatistik, Kopie der CopNet-Verschlüsselung und
eine kurze SSE-Verbindung für Mehrbenutzer-Benachrichtigungen.

**Diese Implementierungen sind noch nicht vollständig end-to-end
und mit sämtlichen Rechteszenarien getestet.** Die MySQL-/
PHP-Version ist noch nicht funktionsgleich zur Node-Version.

## Kritische Restarbeiten

Insbesondere müssen die noch fehlenden API-Endpunkte und die
vollständige Ausgabe-/Schreiblogik für Rang/POR, Beförderungen,
Urkunden, Kündigungs- und Routinearchive, Disziplinarakten,
Sonderfunktionen, Routine-Anwesenheit, Dokumentenlinks und
Google-OAuth einschließlich automatischer Audits und
konfliktgeschützter gleichzeitiger Bearbeitung fertiggestellt werden.

Nicht implementierte Routen geben absichtlich HTTP 501 zurück;
**das ist eine Freigabesperre, keine Funktion**.

Die vollständige, verbindliche Prüfreihenfolge steht in
`docs/UMZUG-STARTSIGNAL.md`. Erst nach grünem Funktionstest
und finaler Datenprüfung wird der Anbieter gewechselt; bis dahin
keine DNS-Änderung, keine Umstellung von `main` und keine Veränderung
der produktiven PostgreSQL-Datenbank.
