# IDV auf MySQL 8 + PHP – ohne Node.js-Webserver

**Entwicklungsstand, nicht für Livebetrieb freigegeben.** Dieser Branch stellt
die bisherige Node-/Express-Webserver-Architektur schrittweise auf
**PHP 8.2+ (PDO MySQL) und MySQL 8.0.16+** um.

Die bisherige Seite auf GitHub `main`/Render/PostgreSQL läuft weiter.
Die MySQL-/PHP-Version ist derzeit **nicht funktionsgleich**.

## Anforderungen des Zielhosters

- MySQL **8.0.16+**, InnoDB, utf8mb4, phpMyAdmin
- PHP **8.2+**, Erweiterungen `pdo_mysql`, `openssl`, `json`
- Apache 2.4 mit `mod_rewrite` und aktivierter `.htaccess`, alternativ
  gleichwertige Nginx-Routingregeln
- **DocumentRoot unbedingt auf `public/` setzen.** Nur dort liegen
  `index.html`, Grafiken und das PHP-API-Einstiegsskript `api.php`.
  Das Repository-Hauptverzeichnis darf nicht als öffentliches Webroot
  dienen: `src/`, `php/`, `scripts/` und Migrationstools müssen
  außerhalb des öffentlich erreichbaren Verzeichnisses bleiben.
- Zugriff auf MySQL über einen eingeschränkten Anwendungsbenutzer
- GitHub-Deployment: Repository-Dateien auf Server bereitstellen,
  DocumentRoot `public/` verwenden. **Kein `npm start`** auf dem
  neuen Webserver erforderlich.
- TLS/HTTPS und sichere Server-Secrets. Passwort/DSN **nicht in Git
  oder das Webverzeichnis legen.**

## SQL über phpMyAdmin einspielen

In einer **neu angelegten, leeren** MySQL-8-Datenbank:

1. Die Struktur `scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql`
   importieren. Sie erstellt die 48 ursprünglichen Tabellen sowie die
   zusätzliche Tabelle für Anmeldeversuche, 33 Fremdschlüssel,
   Revisionsspalten und MySQL-Constraints.
2. **Wichtig:** In der neuen DB sind dann noch keine Benutzer,
   Personalakten, Routine- oder Kündigungsdaten.
3. Nach vollständiger Vorbereitung der Anwendung die vertraulichen
   Bestandsdaten gesondert übertragen: `npm run mysql:export` auf
   einem sicheren Quellrechner mit Zugriff auf PostgreSQL oder
   `npm run mysql:copy` mit direkter Verbindung. Node wird **nur
   für die Migration am Quell-/Entwicklerrechner benötigt**.
   Auf dem Zielwebserver wird Node.js nicht benötigt.
4. Letzte Datenübernahme erst **nach Schreibstopp** auf dem alten Portal.
   Mit `npm run mysql:verify` Zeilenzahlen und Inhalte vergleichen.
5. Erst nach allen API-Tests und bestätigtem Datenstand auf PHP
   umschalten.

### Datenbank-Variablen auf dem PHP-Webserver

Die folgenden Werte müssen im geschützten Environment-/Secret-Bereich
des Hosters gesetzt werden:

| Name | Bedeutung |
| --- | --- |
| `MYSQL_HOST` | Hostname des MySQL-Servers |
| `MYSQL_PORT` | Port, normalerweise 3306 |
| `MYSQL_DATABASE` | Name der angelegten DB |
| `MYSQL_USER` | eingeschränkter MySQL-Benutzer |
| `MYSQL_PASSWORD` | MySQL-Passwort |
| `MYSQL_SSL_CA` | optionaler Pfad zur vertrauenswürdigen CA |
| `IDV_LOGIN_RATE_SECRET` | zusätzliches Secret zum Pseudonymisieren von Login-IP-Hashes |

PHP und MySQL sollten in Produktion per TLS kommunizieren, wenn
sie nicht auf derselben abgeschotteten Maschine laufen.

## Bisher PHP-implementiert

- Login mit bereits vorhandenen bcrypt-Passworthashes
- 12-Stunden-Session in MySQL, Logout, Passwortwechsel
- Effektive Gruppen- und Benutzerrechte bei Datenabfragen
- Geschützter Dashboard-Bootstrap (aktuelle Lesestruktur/Pilot)
- Lesezugriff auf Systemoptionen, Portaldesign und das
  Protokoll mit 72-Stunden-Archiv
- Anlegen neuer Routinetermine inklusive InnoDB-Zeilensperre,
  Revisionsprüfung und Auditprotokoll
- Gemeinsame Anmeldeversuchssperre in MySQL
- PHP-Routing über `public/.htaccess`
- GitHub-Actions-Checks für PHP-Syntax und MySQL-Struktur

Alle noch nicht umgestellten Endpunkte geben bewusst **HTTP 501**
zurück. Sie dürfen weder stillschweigend ohne Authentifizierung
ausgeführt werden noch ungeprüft eine andere Datenbank benutzen.

## Noch nicht für einen Umzug fertig

Die Node-Version besitzt derzeit **102 registrierte API-Routen**.
Ein Großteil muss noch nach PHP/MySQL übertragen werden,
insbesondere: vollständige Personalbearbeitung, Kündigungen,
Disziplinarakten, POR, Beförderungen, Urkunden/Google-OAuth,
Sonderzahlungen, Termine/Anwesenheit/Archive, Checklisten,
Benutzerrechte, Dokumentgeneratoren, Admin-Optionen und
Echtzeit-Aktualisierung.

Zudem sind die bisherigen PostgreSQL-Datenbanktrigger für
Personalgruppen, Kündigungssnapshots und allgemeine Änderungshistorie
in MySQL noch nicht vollständig umgesetzt. Der ausgeführte
PHP-Schreibpfad für Routinetermine protokolliert Änderungen bereits
transaktional; das ersetzt aber **nicht** die übrigen Trigger.

**Keine Umstellung des produktiven Branches, keine DNS-Änderung
und keine Veränderung der bestehenden PostgreSQL-Datenbank**
vor vollständigem Test aller API-Routen.

Die Dateien sind zurzeit im GitHub-Branch `migration/mysql`;
es wurden bislang **keine Dateien auf dem neuen Hoster eingespielt**
und **keine produktiven Daten auf eine MySQL-Datenbank übertragen**.
