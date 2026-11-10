# Schritt 3 – Sicherheit, Rollenrechte und Mehrbenutzerbetrieb

**Stand:** 10.11.2026  
**Arbeitsbranch:** `migration/mysql8-php-cutover-2026-11-10`  
**Status:** Gezielte Sicherheits- und Mehrbenutzer-Regressionstests erfolgreich.
**Keine produktive Cutover-Freigabe.**

## Nachweise aus GitHub Actions

- [MySQL-8-Integration inklusive Rollen-/CSRF-/Konflikttests (42911431052)](https://github.com/vanox-com/idv-verwaltungsdashboard/actions/runs/42911431052): erfolgreich
- [MySQL-8-Integration inklusive Login-Drosselung (42911752586)](https://github.com/vanox-com/idv-verwaltungsdashboard/actions/runs/42911752586): erfolgreich

Alle Tests verwenden **ausschließlich künstliche Konten und Daten** in isoliert
aufgebauten PHP-, PostgreSQL- und MySQL-Testumgebungen; keine Live-Datenbank.

## Geprüfte und abgesicherte Verhaltensweisen

1. **Anmeldung:** ausschließlich `Administrator`, `Leitungsdienst` und
   `Polizeirat` erhalten eine vollwertige Sitzung. Auch ein bereits
   existierender Token verliert bei einer unzulässigen Rolle den Zugang.
   Ein Konto mit anderer Rolle und korrektem Passwort wird abgewiesen.
2. **Rollenmatrix:** Admin-Zugriff bleibt geschützt; eingeschränkte
   Rat- und Leitungsdienstkonten können nicht auf Benutzeradministration,
   Backupfunktionen oder unberechtigte Kündigungs-/Disziplinarakten zugreifen.
   Sensible Personalfelder werden nicht an eine Rolle ohne `sensibel` ausgegeben
   und können auch nicht unberechtigt geändert werden.
3. **CSRF:** fremde `Origin`-Angaben und
   `Sec-Fetch-Site: cross-site` bei Schreibanforderungen werden blockiert.
4. **Sitzungen:** gesperrte Konten erhalten keinen Zugang;
   Passwortwechselpflicht verhindert reguläre Dashboardabfragen;
   Passwortwechsel invalidiert andere aktive Sitzungen und
   eine Administratorsperre beendet den Zugriff sofort.
5. **Parallele Personalbearbeitung:** zwei PHP-Worker erhalten
   genau einmal HTTP 200 und einmal HTTP 409.
6. **Paralleles Abhaken:** verschiedene berechtigte Rollen versuchen,
   denselben Checklistenpunkt mit identischem erwarteten Ausgangszustand
   gleichzeitig zu speichern. Einmal HTTP 200, einmal HTTP 409;
   die erfolgreiche Änderung bleibt erhalten.
7. **Live-Synchronisierung:** auf einem PHP-Worker erzeugte Änderung
   erreicht per SSE eine andere authentifizierte Sitzung. Der Stream
   enthält nur Änderungsmarker, keine personenbezogenen Daten.
8. **Anmeldedrosselung:** nach 30 Fehlversuchen innerhalb von fünf
   Minuten blockiert die MySQL-gestützte, PHP-workerübergreifende
   Anmeldesperre weitere Anfragen mit HTTP 429, selbst mit korrekten
   Anmeldedaten.
9. **HTTPS hinter Proxy:** `IDV_FORCE_HTTPS=1` erlaubt die
   vertrauenswürdig serverseitige Erzwingung von Secure-Session-Cookies,
   ohne auf unkontrollierte `X-Forwarded-Proto`-Header zu vertrauen.
   `tests/mysql8-https.php` prüft direkte TLS-Aufrufe und
   Reverse-Proxy-Konfiguration ohne Netzwerkzugriff.

## Änderungen in diesem Schritt

- `php/Api.php`: serverseitige Login-Rollen-Whitelist und
  Sitzungsprüfung; konfigurierbares serverseitig erzwungenes HTTPS.
- `tests/mysql8-smoke.php`: zusätzliche synthetische Konten für
  Leitungsdienst, gesperrte Benutzer, abgewiesene Rollen und
  Passwortwechselpflicht.
- `tests/mysql8-security-flows.sh`: Rollenmatrix,
  CSRF-Angriffe, Passwortwechsel, Sperren und Checklisten-Rennen.
- `tests/mysql8-rate-limit.sh`: HTTP-429-Brute-Force-Test.
- `tests/mysql8-https.php`: Direkt-TLS-/Reverse-Proxy-Sicherheitstest.
- `PHP-MYSQL8-HOSTING.md`: Konfigurationsanleitung für
  zugelassene Rollen und `IDV_FORCE_HTTPS`.

## Verbleibende Release-Gates

Diese gezielten Regressionstests sind **kein vollständiger Penetrationstest**
und noch kein Nachweis sämtlicher Berechtigungs-/Konfliktkombinationen
aller 103 API-Routen. Die echte Google-OAuth-Integration, die
Originaldokumente, die produktive Reverse-Proxy-/HTTPS-Konfiguration,
Staging mit allen Benutzerrollen und der reale Datenvergleich müssen
vor der Freigabe weiterhin abgenommen werden.

**`scripts/mysql/cutover-readiness.json` bleibt ausdrücklich gesperrt.**
Weder `main` noch Render/PostgreSQL, `idv-ppverwaltung.de` oder DNS
wurden durch diesen Schritt umgestellt.
