# Schritt 4 – PHP-Hoster, Google OAuth, Dokumente und CopNet vorbereiten

**Status am 10.11.2026:** Code und automatisierte Staging-Vorabprüfungen vorbereitet.
**Der neue Hoster ist noch nicht angeschlossen.** Kein produktiver Anbieterwechsel,
keine DNS-Umstellung, keine Übernahme von echten Daten oder Google-Tokens.

## Bereitgestellte Dateien

- `public/` – Web-Frontend und PHP-Einstiegspunkt (`public/api.php`)
- `php/` – Backend einschließlich Google-Dokumente, CopNet und MySQL-Zugriff
- `scripts/hosting/preflight.php` – privater, schreibgeschützter Konfigurations-/DB-Check
- `scripts/hosting/build-package.sh` – Code-ZIP aus den Git-Commit-Dateien erstellen
- `scripts/hosting/staging-http-check.sh` – nicht angemeldete HTTPS-/Routing-/Isolationsprüfung
- `tests/mysql8-google-origin.php` – freigegebene Google-Portaladresse validieren
- `tests/mysql8-copnet-node-vector.mjs` und
  `tests/mysql8-copnet-compat.php` – altes Node-AES-256-GCM-Format in PHP entschlüsseln

GitHub Actions veröffentlicht nach erfolgreichen Integrationstests das
**Code-Paket `IDV-PHP-MySQL8-STAGING.zip`** als Artefakt
`idv-php-mysql8-staging`. Es enthält **keine** persönlichen Daten,
Datenbankexporte, Konfigurationssecrets oder Node-Webserverdateien.

## Zielhoster vorbereiten

1. Separaten HTTPS-Staging-Host einrichten (beispielsweise eine eigene
   Subdomain, nicht `idv-ppverwaltung.de`). Der Apache-DocumentRoot
   zeigt **ausschließlich auf `public/`** innerhalb des entpackten
   Anwendungspakets. `php/` und `scripts/hosting/` bleiben **außerhalb**
   des öffentlich erreichbaren Webroots.
2. PHP **8.2 oder neuer**, `pdo_mysql`, `openssl`, `json`, `curl`,
   `zip`, beschreibbare temporäre Dateien, HTTPS, Apache `mod_rewrite`
   und die Regeln aus `public/.htaccess` aktivieren.
3. Eine **neue leere MySQL-8.0.16+-Staging-Datenbank** bereitstellen.
   Das geprüfte `IDV-MySQL8-phpMyAdmin-SETUP.sql` exakt **einmalig**
   importieren; **nicht** zusätzlich die SQL-Teilstücke einspielen.
   Einen separaten, eingeschränkten PHP-DB-Benutzer anlegen.
4. Geheimnisse ausschließlich im Secret-Store/PHP-Prozess des Hosters
   konfigurieren (niemals in GitHub/ZIP, E-Mail oder als Antwort im Chat):

   | Umgebungsvariable | Anforderung |
   | --- | --- |
   | `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | Ziel-DB-Verbindung |
   | `MYSQL_SSL_CA` | Vertrauenswürdige CA, sofern MySQL-TLS nötig |
   | `IDV_LOGIN_RATE_SECRET` | Mindestens 32 zufällige Zeichen |
   | `IDV_FORCE_HTTPS` | `1` bei vertrauenswürdigem TLS-Proxy, `0` bei direktem HTTPS |
   | `COPNET_ENCRYPTION_KEY` | **Exakt derselbe 64-stellige Hex-Schlüssel** wie im laufenden System |
   | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google-Webclient, nicht hart codieren |
   | `IDV_GOOGLE_ORIGIN` | Exakte freigegebene HTTPS-Origin der neuen Staging-Website, **ohne abschließenden Slash/Pfad** |

5. Für den Google-OAuth-Webclient die **exakte Staging-Origin als
   autorisierten JavaScript-Ursprung** eintragen und mit einem
   autorisierten Testnutzer den Pop-up-Code-Flow prüfen. Die
   Anwendung gibt die freigegebene Origin serverseitig an die
   Dokument- und Urkundenoberflächen zurück. Der Code kann dadurch
   nicht auf irgendeiner fremden URL verwendet werden.
   Google Drive API und nötige Berechtigungen für die bestehenden
   Originalvorlagen prüfen. Die Anwendung verwendet
   `drive.file` und `drive.readonly`.
6. Auf der **privaten CLI** des Staging-Hosters ausführen:

   ```bash
   php scripts/hosting/preflight.php --json
   ```

   Der Check bestätigt PHP-Module, Dateisystem, DB-Schema (49 Tabellen,
   33 FKs, 14 CHECK-Regeln, 35 Trigger), Konfigurationsform,
   AES-GCM-Roundtrip und gegebenenfalls das erfolgreiche Entschlüsseln
   **eines bereits gespeicherten** CopNet-Werts ohne Ausgabe seines Klartexts.
   Er prüft nur die *Konfiguration*, nicht die erfolgreiche Einwilligung
   eines echten Google-Kontos.

7. Von einem geschützten Rechner HTTPS und privates Routing prüfen:

   ```bash
   bash scripts/hosting/staging-http-check.sh https://DEINE-STAGING-DOMAIN
   ```

   Es wird kein Passwort übergeben. Die Prüfung erwartet
   unauthentifizierten HTTP 401 auf den Verwaltungs-API-Routen und
   blockierten Zugriff auf PHP-, SQL- und .env-Dateien.

## Was nur im echten Staging abschließend geprüft werden kann

- Persönliches Google-Login im Browser, autorisierte Google-OAuth-Origin,
  Zugriff auf jede vorhandene Word-Vorlage, Erstellung einer **Test**-Urkunde
  und Test-Dokumentverknüpfung. Die Testdatei darf in einem separaten
  Test-Drive und mit synthetischem Personal angelegt werden.
- HTTPOnly/Secure/SameSite-Sessioncookies über den tatsächlichen
  HTTPS-Proxy, Passwortwechsel und Mehrbenutzer-Live-Updates.
- CopNet-Schlüsselidentität **nach Übertragung echter verschlüsselter
  Datensätze** (kein Kopieren von produktiven Secrets in CI).
- Hoster-Funktionalität mit Mod-Rewrite, temporären Dateien,
  PHP-Laufzeitlimits und tatsächlich eingerichteter Datenbankberechtigung.

**Freigabesperre bleibt absichtlich aktiv:** `scripts/mysql/cutover-readiness.json`.
Schritt 5 umfasst erst nach Staging-Abnahme den finalen Vergleich,
Schreibstopp, Wechsel und Rückfallplan. Kein automatischer Go-Live durch
den Download oder die Ausführung des Pakets.
