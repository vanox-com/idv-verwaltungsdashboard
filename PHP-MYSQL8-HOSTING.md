# IDV: PHP 8.2+ und MySQL 8.0.16+ ohne Node-Webserver

**Status: Migrations-Entwicklung – NICHT zur produktiven Umschaltung freigegeben.**
Stand 10.11.2026. Arbeitsbranch: `migration/mysql8-php-cutover-2026-11-10`.

Der bisherige GitHub-Branch `main`, die Domain `idv-ppverwaltung.de`, Render
und PostgreSQL wurden durch diese Arbeiten nicht umgestellt. Das bestehende
Portal bleibt für den normalen Betrieb unverändert.

## Zielhoster

Benötigt: MySQL 8.0.16+ (InnoDB/utf8mb4), PHP 8.2+
(`pdo_mysql`, `openssl`, `json`, `curl`, `zip`), Apache 2.4 mit `mod_rewrite`
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
| `IDV_FORCE_HTTPS` | Nur bei HTTPS-Terminierung vor PHP (Reverse Proxy) auf `1` setzen, damit Session-Cookies und Origin-Prüfung zuverlässig HTTPS erzwingen; niemals ungeprüfte `X-Forwarded-Proto`-Header vertrauen |
| `COPNET_ENCRYPTION_KEY` | derselbe 64-stellige Hex-Schlüssel wie im bisherigen System; erforderlich für bestehende CopNet-Zugänge |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google-Webanwendungsclient; Zugangsdaten ausschließlich im Hostersecret speichern |
| `IDV_GOOGLE_ORIGIN` | Optional für abweichende Domains/Staging; bei nicht gesetztem Wert ist `https://pol-panel.identityvalley.de` die feste HTTPS-Standard-Origin. Explizite Werte müssen exakt und ohne Pfad/abschließenden Slash passen. |

### Google OAuth auf pol-panel.identityvalley.de (12.11.2026)

Die sichere PHP-Standard-Origin ist `https://pol-panel.identityvalley.de` (nur
für Google OAuth, kein DNS-Eintrag). Dafür wird kein `IDV_GOOGLE_ORIGIN`
benötigt, solange kein abweichender Wert bereits im Hoster gesetzt ist.
In Google Cloud → Auth Platform → Clients → Webanwendung muss genau diese
Adresse unter **Autorisierte JavaScript-Quellen** stehen. Der persönliche
Google-Popup-Codeflow tauscht den Code serverseitig mit dieser Origin aus.

**Zwingend beim Hoster:** `GOOGLE_OAUTH_CLIENT_ID` und
`GOOGLE_OAUTH_CLIENT_SECRET` als **private Server-Umgebungsvariablen**
setzen (nicht in GitHub, nicht im Browser oder in einer öffentlichen Datei).
Ohne diese zwei Werte kann PHP keine Urkunden/Dokumente erstellen.
Angemeldete Nutzer sehen über die Dokumentgenerator-Statusabfrage eine
Fehlermeldung, wenn die Konfiguration fehlt, niemals das Secret selbst.

Die Branding-Überprüfung durch Google ist davon getrennt. Wer die Anwendung
öffentlich verifizieren lassen will, braucht die Bestätigung der
übergeordneten Domain `identityvalley.de` durch den Domaininhaber in
Google Search Console. Für Tests mit freigegebenen Testnutzern ist
keine abgeschlossene Branding-Verifizierung notwendig.

Die bestehende Google-OAuth-Konfiguration und neue Redirect-URI müssen
vor dem Go-Live ebenfalls geprüft werden. Insbesondere Dokumentgeneratoren
dürfen nicht heimlich von bisherigen Google-Drive-Verknüpfungen abweichen.

## Vorbereitete Hosterübergabe (Schritt 4)

`docs/MIGRATION-SCHRITT-4.md` enthält die komplette Staging-Checkliste.
Nach grünem MySQL-8-GitHub-Action-Lauf steht ein
`idv-php-mysql8-staging`-Artefakt bereit.
Das ZIP enthält nur PHP-Anwendung, öffentliche Webdateien und den
**privaten** `scripts/hosting/preflight.php`-Check; kein Node-Webserver,
keine Datenbankexporte, keine Zugangsdaten.

```bash
php scripts/hosting/preflight.php --json
bash scripts/hosting/staging-http-check.sh https://DEINE-STAGING-DOMAIN
```

Letzterer Test ist ausschließlich für eine **separate HTTPS-Testdomain**,
nicht für das Produktivportal vorgesehen.
Google-Pop-up, echte Word-Vorlagen, Dokumenterstellung und
CopNet-Bestandsdaten müssen beim neuen Hoster mit autorisiertem Testkonto
bzw. nach kontrollierter Datenkopie separat überprüft werden.

## Anmelde- und Sitzungs-Sicherheit

Nur **Administrator**, **Leitungsdienst** und **Polizeirat** können sich
am Panel anmelden. Ein Konto mit einer anderen Rolle kann auch mit
korrektem Kennwort keine Sitzung eröffnen; nach einer Rollenänderung
wird eine bestehende Sitzung beim nächsten Zugriff verweigert.

Bei direktem HTTPS erkennt PHP den sicheren Aufruf automatisch.
Wenn ein vertrauenswürdiger Proxy TLS terminiert und PHP intern nur HTTP
sieht, **serverseitig** `IDV_FORCE_HTTPS=1` setzen. Öffentliche Requests
müssen am Proxy selbst durchgängig HTTPS nutzen; die Einstellung darf
nicht aus eingehenden HTTP-Headers abgeleitet werden.

Vor dem produktiven Umzug auch die PHP-Sitzungseinstellungen,
HTTPS-Weiterleitungen und die nur für den Hoster geltenden Datenbankrechte
im tatsächlichen Staging prüfen.

## Datenbank

Die PostgreSQL-Live-Datenbank wurde **nur lesend** auf 48 Fachtabellen,
33 FKs, 14 CHECK-Constraints und 316 Spalten geprüft.

`scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql` baut in einer neuen
leeren MySQL-Datenbank 48 Fachtabellen plus die zusätzliche
`idv_login_attempts`-Sicherheitstabelle, die 33 FKs, 14 CHECK-Regeln
und 35 Trigger (acht Revisionstrigger sowie 27 Audit-, Gruppen- und Snapshot-Trigger) auf. Der Import und grundlegende PDO-
Funktionstests wurden in GitHub Actions gegen echtes MySQL 8 getestet.

Die Bestandsdaten müssen später separat und **vertraulich** übertragen
werden. Dafür gibt es:

- `npm run mysql:prepare` – PostgreSQL-Schema nur lesend vergleichen
- `npm run mysql:install-schema` – Schema in absolut leere MySQL-Datenbank installieren, mit `MYSQL_SCHEMA_CONFIRM=EMPTY_NEW_DATABASE`
- `npm run mysql:export` – lokaler privater SQL-Export für phpMyAdmin
- `npm run mysql:copy` – direkter PostgreSQL→leere-MySQL-Transfer
- `npm run mysql:verify` – Datenbestand Zeile für Zeile vergleichen
- `npm run mysql:cutover` – nach nachgewiesener Freigabe Preflight + Installation + Kopie + Vergleich automatisch

Quell- und Zieldatenbank-Zugangsdaten ausschließlich auf einem berechtigten,
geschützten Rechner als Umgebungsvariablen setzen. Session-Cookies/Tokens
werden nicht migriert, Nutzer melden sich neu an.

## Auf PHP bereits portierte Bereiche

Login (bcrypt), Sitzungen/Passwortwechsel, Drosselung, differenzierte
Berechtigungen und Datenausgabe, zentrale Bootstrap-Leseansicht mit
Dashboard-Kennzahlen (Gleichwertigkeit wird weiter geprüft), Routintermin-Erstellung, Benutzer-
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

## Weiterhin verbindliche Freigabeprüfungen

Die 103 erfassten Original-API-Routen haben inzwischen PHP-Implementierungen
einschließlich Rang/POR, Beförderungen, Routine- und Kündigungsarchiv, Disziplin,
Dienstnummernwechsel, Dokumentgenerator, Google-OAuth und Ernennungsurkunden.
**Implementierung bedeutet noch keine bestätigte 1:1-Funktionsgleichheit.**
Die MySQL-8-PDO- und HTTP-Integrationstests mit synthetischen Daten bestehen,
aber alle Rechtekombinationen, konkurrierenden Nutzer, historische Sonderfälle
und der echte Google-OAuth-Dokumentenlauf müssen separat abgenommen werden.

Die PHP-Router-Fehlersperre HTTP 501 bleibt für nicht erfasste Routen bestehen.
Ein erfolgreicher Datenimport hebt die Freigabesperre nicht auf.

Es gibt im Repository keine `package-lock.json`; für die einmaligen
lokalen Migrationswerkzeuge ist vorerst `npm install --ignore-scripts --no-package-lock`
vorgesehen. Dies ist weniger reproduzierbar als `npm ci`; eine geprüfte
Sperrdatei wäre für einen produktiven Cutover vorzuziehen.

Für den automatischen Ablauf wird die Ziel-Datenbank **leer ohne Tabellen**
bereitgestellt und **nicht vorher manuell** mit der SQL-Setupdatei befüllt.
MySQL-DDL ist nicht vollständig transaktional: bei einem fehlerhaften
Teilimport die gesamte neue Ziel-Datenbank neu anlegen.

Die verbindliche Prüfreihenfolge und der Rückfallplan stehen in
`docs/UMZUG-STARTSIGNAL.md`. Bis zur Freigabe keine DNS-Änderung,
keine Umstellung von `main` und keine Veränderung der produktiven
PostgreSQL-Datenbank.
