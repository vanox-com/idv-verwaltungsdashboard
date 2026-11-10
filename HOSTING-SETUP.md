# IDV – Übergabe an den neuen PHP-/MySQL-Hoster

**Nur für die separat eingerichtete Staging-Seite. Kein Go-Live und keine DNS-Umstellung.**

Dieses Archiv enthält `public/`, `php/` und das private Werkzeug
`scripts/hosting/preflight.php`. **Es enthält weder Datenbankdaten
noch Zugangsdaten, Passwörter oder eine fertig eingerichtete MySQL-Datenbank.**

## Installation durch das Hosting-Team

1. Dieses ZIP **oberhalb** des öffentlich erreichbaren Webroots entpacken.
   Die Domain muss als **DocumentRoot auf den entpackten Ordner `public/`**
   zeigen. `php/` und `scripts/hosting/` dürfen nicht per HTTP erreichbar
   sein. Nicht einfach das ganze ZIP in `public_html/` entpacken,
   wenn `public_html/` direkt im Internet erreichbar ist.
2. PHP **8.2+** mit `pdo_mysql`, `openssl`, `json`, `curl`, `zip`
   und beschreibbarem PHP-Temp-Verzeichnis einsetzen. Apache
   `mod_rewrite`, `.htaccess` und HTTPS müssen aktiv sein.
   Der PHP-Webserver benötigt **keinen laufenden Node.js-Prozess**.
3. Eine **separate, leere MySQL-8-Datenbank für Staging** anlegen.
   Nur dort `scripts/mysql/IDV-MySQL8-phpMyAdmin-SETUP.sql` aus dem
   privaten Repository importieren (der SQL-Installer ist aus
   Sicherheitsgründen **nicht im Web-ZIP**).
   Alternativ kann ein berechtigter Administrator die Installation
   über den kontrollierten MySQL-Installer durchführen.
4. Die folgenden Konfigurationen **als geschützte PHP-Prozess-
   Umgebungsvariablen außerhalb des Webroots** hinterlegen:

   - `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`,
     `MYSQL_USER`, `MYSQL_PASSWORD`; ggf. `MYSQL_SSL_CA`
   - `IDV_LOGIN_RATE_SECRET` (zufällig, mindestens 32 Zeichen)
   - `IDV_FORCE_HTTPS` = `1`, falls ein vertrauenswürdiger Proxy
     HTTPS terminiert; ansonsten `0` bei direktem TLS
   - `COPNET_ENCRYPTION_KEY` (für spätere Bestandsübernahme **genau
     der bisherige Schlüssel**, niemals einen Ersatzschlüssel verwenden)
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
   - `IDV_GOOGLE_ORIGIN` (exakter HTTPS-Ursprung der Staging-Seite)

   **Keine echten Zugangsdaten in GitHub, ZIP oder Chat kopieren.**
   Wenn der Hoster keine geschützten PHP-Umgebungsvariablen unterstützt,
   zunächst das unterstützen lassen; nicht ersatzweise eine öffentlich
   erreichbare `.env` oder PHP-Konfigurationsdatei anlegen.
5. Den privaten (nicht öffentlichen) Staging-Preflight ausführen:

   ```bash
   php scripts/hosting/preflight.php --json
   ```

   Er prüft nur Konfiguration und Datenbankschema; er ist **keine**
   erfolgreiche Echtauthentifizierung gegen Google.
6. Von außerhalb HTTPS / Routen / Dateischutz prüfen:

   ```bash
   bash scripts/hosting/staging-http-check.sh https://STAGING-ADRESSE
   ```

   Das HTTP-Prüfskript ist im privaten GitHub-Repository verfügbar,
   nicht im deploybaren Web-ZIP.
7. Danach manuelle Abnahme mit **synthetischen Testdaten**:
   Admin, Polizeirat, Leitungsdienst, Echt-HTTPS-Cookies, gleichzeitige
   Bearbeitung, persönliche Google-OAuth-Anmeldung, tatsächliche
   Google-Word-Vorlagen, Urkunde und Dokumentlinks.

## Nicht tun

- Keine DNS-Änderung an `idv-ppverwaltung.de`
- Keinen PostgreSQL-Produktivexport in öffentliches Staging importieren
- Kein Überschreiben bestehender Datenbanken
- Keine Kopie oder Veröffentlichung des ursprünglichen CopNet-Schlüssels
- Keine automatische Freigabe der neun Produktiv-Cutover-Sperren

Die eigentliche Übernahme erfolgt erst nach abgeschlossener Abnahme und
separatem Startsignal gemäß `docs/MIGRATION-SCHRITT-5.md`.
