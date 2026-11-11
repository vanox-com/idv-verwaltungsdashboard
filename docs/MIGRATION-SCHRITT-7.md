# Schritt 7 – Staging-Abnahme und Testnachweise

**Status:** Automatisierte externe Prüfungen vorbereitet und mit simulierten
HTTP-Antworten getestet. **Der echte Zielhoster ist noch NICHT verbunden.**
Alle produktiven Freigabe-Flags in
`scripts/mysql/cutover-readiness.json` bleiben gesperrt.

## Sichere Reihenfolge bei der Einrichtung

1. Separaten HTTPS-Staging-Host und eigene synthetische MySQL-Datenbank
   einrichten. **Nicht** `idv-ppverwaltung.de`, bestehendes Render oder
   die produktive PostgreSQL-Datenbank für diese Tests benutzen.
2. Das erfolgreiche GitHub-Artefakt `idv-php-mysql8-staging`
   herunterladen, außerhalb des öffentlichen Webroots entpacken,
   `public/` als DocumentRoot einstellen und die Anweisungen
   `HOSTING-SETUP.md` befolgen.
3. Privater Hoster-Preflight:
   ```bash
   php scripts/hosting/preflight.php --json
   ```
4. Vom eigenen, berechtigten Testrechner aus **ohne Benutzerpasswort**:
   ```bash
   bash scripts/hosting/staging-http-check.sh https://DEINE-STAGING-DOMAIN
   ```
   Benötigt `curl`, `jq` und Bash. HTTPS-Zertifikatsfehler
   müssen behoben werden (niemals `curl -k` verwenden).

## Externe Sicherheitsabnahme: automatisiert

`scripts/hosting/staging-http-check.sh` prüft ausschließlich
eine separate, vollständige HTTPS-Origin, die nicht einer bekannten
Produktivdomain entspricht. Vor dem ersten Netzwerkaufruf werden
Produktivdomains, Render und ungültige/unsichere URL-Formate
abgewiesen.

| Kontrolle | Erwartet |
| --- | --- |
| Login-Seite, Dokument-UI | HTTP 200 mit HTML bzw. JavaScript |
| Ohne Login: `/api/me`, `/api/bootstrap`, `/api/users`, `/api/changes`, `/api/copnet/1`, `/api/dokumentgenerator/status` | HTTP 401 mit JSON-Fehler |
| API-Sicherheitsheader | Cache-Control, X-Content-Type-Options, X-Frame-Options |
| PHP-Backend, SQL, `.git`, `.env`, Hosting-Anleitung und privater Preflight per HTTP | ausschließlich HTTP 403/404 |
| Fremde Origin bei anonymer Anmeldung | HTTP 403 (Schutz vor Cross-Site-Zugriffen) |

GitHub Actions testet diese Prüfregeln zusätzlich mit einem
**vollständig simulierten Curl-Aufruf**: korrekter Staging-Host besteht,
eine falsche Produktivdomain wird **ohne Netzwerkanfrage** abgewiesen,
private-Datei-Leaks und fehlende Sicherheitsheader führen zu einem
Fehler. Diese Simulation ersetzt keinen realen Hoster-Test.

## Manuelle Staging-Abnahme – aktuell OFFEN

| Bereich | Nachweis erforderlich | Stand |
| --- | --- | --- |
| Browser / HTTPS | Verifizierbare TLS-Kette, Secure/HttpOnly/SameSite-Cookie, korrekte Webroot-Isolation | **Offen** |
| Administrator | Login, Benutzer-/Rollenrechte, Personal bearbeiten, Backup und Audit | **Offen** |
| Leitungsdienst | Zugelassene Freigaben, verbotene vertrauliche Felder, Urkunden und POR | **Offen** |
| Polizeirat | Checklisten, POR-Anträge, erlaubte Aktionen, keine unerlaubten Adminrechte | **Offen** |
| Zwei gleichzeitige Nutzer | Personal/Routine/Checkliste/Kündigungen: 200/409 und SSE-Update | **Offen** |
| Google-OAuth | Autorisierte Staging-Origin, persönliches Popup, Originalvorlagen, Word- und Urkundendokumente | **Offen** |
| CopNet | Bestehenden Schlüssel später aus Secret-Store verwenden; entschlüsselbare Bestandsdaten prüfen ohne Ausgabe der Passwörter | **Offen** |
| Daten & Historie | Privater zeilenweiser Quelle/Ziel-Vergleich, Trigger, Protokoll, Kündigungen und Archiv | **Offen** |
| Rückfall | PostgreSQL-Backup erfolgreich testweise wiederherstellen, Schreibstopp/Restore-Pläne nachweisen | **Offen** |

**Erst nach realer, dokumentierter Prüfung** dürfen die entsprechenden
Freigabepunkte individuell aktualisiert werden. Ein Erfolg in GitHub CI
allein bedeutet **nicht**, dass die produktive Seite umgestellt werden kann.

## Nächster notwendiger Input

- Name des neuen Hosting-Anbieters
- **Separate** HTTPS-Staging-Adresse (sofern bereits vorhanden)
- Ob der Hoster PHP-Umgebungsvariablen und einen frei wählbaren
  DocumentRoot `public/` unterstützt

**Keine Passwörter, Login-Cookies, CopNet-Schlüssel oder echten
Datenbank-URLs in den Chat oder nach GitHub kopieren.**

Das produktive GitHub-`main`, Render/PostgreSQL und die Domain
`idv-ppverwaltung.de` bleiben unverändert.
