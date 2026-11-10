# Schritt 6 – Installationsübergabe und Staging-Einrichtung

**Status:** Das installierbare PHP-Paket und die Übergabeanleitung sind vorbereitet.
**Die tatsächliche Staging-Installation beim neuen Anbieter ist noch offen.**
Keine DNS-Änderung, keine Produktivdatenübernahme und keine Freigabe des
Cutover-Skripts.

## Bereitgestellte Übergabe

- GitHub Actions erzeugt das schlüsselfreie ZIP
  `idv-php-mysql8-staging / IDV-PHP-MySQL8-STAGING.zip`.
- Direkt **im ZIP** liegt `HOSTING-SETUP.md`, eine konkrete Anleitung
  für das Hosting-Team zur Installation von PHP und MySQL 8,
  Dokumentenverzeichnis, Rewrite-Regeln, geschützten Umgebungsvariablen,
  Google-OAuth-Portaladresse und sicheren Staging-Tests.
- Die PHP-Backend-Ordner liegen nur **außerhalb von `public/`**.
  `src/` und andere alte Node-Serverquellen sind im ZIP mit Absicht
  nicht enthalten.
- `scripts/hosting/preflight.php` wurde berichtigt: Er benötigt
  keine alten Node-Quellen. Der vollständige Preflight wird jetzt
  **nach dem tatsächlichen Entpacken des ZIPs** in GitHub Actions auf
  das installierbare Paket angewendet; nicht nur auf die Entwicklerkopie.
- Der Build validiert das ZIP und das Vorhandensein der Hosteranleitung.
  Anschließend wird der Code als kurzlebiges GitHub-Artefakt bereitgestellt.

## Was jetzt vom neuen Hoster benötigt wird

1. **Name und Staging-Adresse** (separate HTTPS-URL, nicht die heutige
   Produktivdomain) und Zugangsart (Hoster-Panel, FTP/SFTP, SSH).
2. Bestätigung, dass der PHP-Webroot frei auf `public/` zeigen
   kann und `php/` / `scripts/` privat außerhalb liegen.
3. Bestätigung von PHP 8.2+, `pdo_mysql`, `openssl`, `json`,
   `curl`, `zip`, Apache-URL-Rewrite und HTTPS.
4. MySQL 8.0.16+ / phpMyAdmin und eine **separate leere Staging-DB**,
   dazu ein Benutzer mit nur den nötigen Rechten.
5. Eine **geschützte Methode für PHP-Prozess-Umgebungsvariablen**,
   damit Datenbankzugang, Google-OAuth-Client und der vorhandene
   CopNet-Schlüssel niemals im öffentlichen Dateisystem landen.

**Keine Passwörter, Geheimschlüssel oder Datenbank-URLs per Chat senden.**
Die Daten werden später ausschließlich im geschützten Hoster-Panel
bzw. einem dazu vorgesehenen Secret-Store eingetragen.

## Staging-Abnahme nach Erhalt der Angaben

- Hoster entpackt das ZIP außerhalb des Webroots und setzt
  `public/` als DocumentRoot.
- Neue, synthetische MySQL-Staging-Datenbank gemäß
  `IDV-MySQL8-phpMyAdmin-SETUP.sql` einrichten.
- Privaten `php scripts/hosting/preflight.php --json` durchlaufen lassen.
- `bash scripts/hosting/staging-http-check.sh https://STAGING-ADRESSE`
  von außerhalb aufrufen.
- Browser-Abnahme mit drei berechtigten Rollen, Google-OAuth-Popup
  sowie Word-/Urkunden-Testdateien und gleichzeitiger Bearbeitung.

**Erst nach bestätigter Abnahme** kommen kontrollierte Probedatenübernahme
und finale Cutover-Freigabe infrage. Die neun Release-Gates bleiben
bis dahin bewusst auf `false`.
