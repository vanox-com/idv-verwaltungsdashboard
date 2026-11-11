# IDV – Gesamtaudit vor PHP/MySQL8-Umzug

**Stand: 11. November 2026**  
**Auditumfang:** bestehender Node-Produktivbranch, PHP/MySQL8-Migrationsbranch,
Github-Actions-Tests, öffentliches Frontend und öffentliche Begleitinformationen,
Datenmigration, Staging-Paket und Go-/No-Go-Ablauf.

**Urteil: NO-GO für den Produktivwechsel.** Die automatisierten Tests im
Migrationszweig sind grundsätzlich grün, aber es fehlen reale Abnahmen,
und einige Sicherheits-/Datenbetriebsthemen sind noch offen.

## Priorität 0 – Vertraulichkeit und öffentliches Repository

**Bestätigt:** GitHub meldet für `vanox-com/idv-verwaltungsdashboard` `visibility: public`.
Die Datei `src/daten.json` liegt auch auf `main`, enthält **58
Personalakten**, **55 Kündigungsvorgänge** und **57 Disziplinareinträge**.
Bei 47 Personalakten ist `geburtsdatum`, bei 49 das Feld `handy`
ausgefüllt. Es wurden für dieses Audit **keine Werte veröffentlicht
oder nach außen kopiert**.

Das sind GTA-RP-Daten; ob alle enthaltenen Informationen frei erfunden
sind, ist nicht verifiziert. Falls tatsächliche Personen oder
Kontaktmöglichkeiten betroffen sein können: Betreiber muss
Repository und ältere Git-Historie als potenziell öffentlich
zugänglich behandeln. **Empfehlung:** Sichtbarkeit prüfen und möglichst
auf `Private` setzen; betroffene Daten auf notwendige Inhalte
reduzieren, eventuell exponierte Secrets/echte Kontaktdaten gesondert
bewerten. Ein Löschen aus einem neuen Commit entfernt frühere
Git-History-Versionen nicht. **Keine destruktive Git-Historienänderung
ohne gesonderte Bestätigung.**

## Priorität 1 – vor der Live-Freigabe zwingend

| Bereich | Feststellung | Erforderliche Abnahme/Aktion |
| --- | --- | --- |
| Neuer Hoster | Weder Staging-Domain noch echter PHP-/MySQL-Host wurde verbunden | Separate HTTPS-Staging-Instanz mit PHP 8.2+, Apache-Rewrite, privatem PHP-Verzeichnis und geschützten Environment-Secrets einrichten |
| Daten und Vollständigkeit | 47 Datentabellen mit synthetischen Daten verglichen, aber **kein vollständiger Vergleich des aktuellen realen Bestands** | Nach Schreibpause und getestetem Backup privaten Quelle/Ziel-Vergleich auf dem finalen Datenstand ausführen |
| Business-Parität | 103 originale API-Routen erfasst; Erreichbarkeitstests ersetzen keine Prüfung aller Geschäftsregeln/Antworten und historischen Sonderfälle | Original-/PHP-Oberfläche mit allen 3 Login-Rollen und Personal, POR, Kündigung/Archiv, Routine/Archiv, Disziplin, Urkunden, Datenschutz und Revisionssperren praktisch vergleichen |
| Dienstnummer 50 | Der aktuelle Node-Code verwendet **51–60 Nebenberuf**; PHP verwendet die vom Betreiber gewünschte Regel **50–60 Nebenberuf** | Bestandsakten vor Umschaltung prüfen. Ein neuer read-only Staging-Preflight meldet widersprüchliche belegte Dienstnummern, er ändert Daten nicht selbst |
| Google-Dokumente | OAuth-Popup, tatsächliche neun Originalvorlagen und gesonderte Ernennungsurkunde noch **nicht** beim neuen Hoster getestet | Autorisierten Testnutzer, freigegebene Google-Origin, Google-API/Drive-Berechtigungen und echte editierbare Testdokumente testen |
| Datenschutz und OAuth | Datenschutzerklärung enthielt alte PostgreSQL-Angaben und erwähnte `drive.readonly` nicht | Technische Angaben jetzt angepasst; **verantwortliche Betreiberperson, erreichbarer Datenschutzkontakt, Rechtsgrundlagen und konkrete Löschfristen** sind weiterhin zu prüfen. Eine öffentliche OAuth-Verifizierung kann ergänzende Anforderungen haben |
| CopNet | Node→PHP-GCM-Kompatibilität synthetisch grün, **originaler Verschlüsselungsschlüssel nicht verifiziert** | Geheimen Originalschlüssel sicher auf Zielhost übernehmen, einen bestehenden verschlüsselten Testdatensatz *ohne Klartextausgabe* entschlüsseln |
| Backups und Rückfall | Ausführlicher Plan vorhanden, aber **keine echte Restore-Probe**; auch zukünftige MySQL-Backups noch nicht nachgewiesen | Test-Restore der Quelle, automatische Ziel-DB-Backups mit Aufbewahrung/Überwachung und Wiederherstellungstest einrichten, DNS-/Rollback-Verantwortlichkeiten bestätigen |
| Livebetrieb | 409-Konflikte und SSE mit künstlichen Nutzern funktionieren, aber Leistungsfähigkeit auf Shared-PHP-Host unbekannt | Unter echtem PHP-Worker- und Timeout-Limit mit mehreren parallelen Nutzern, SSE und langen Dokumenten testen |

## Priorität 2 – Hosting- und Betriebsdetails

- **Staging-Testzugänge:** Die bisherige Node-Version legt bei der
  Erstinstallation ggf. einen Admin an. Der neue PHP-Host benötigt
  für echte Browser-Tests eine **kontrollierte Staging-Testdatenbank
  mit synthetischen Benutzern und Rollen**; das Code-ZIP enthält
  bewusst keine Produktionszugänge und keine Testpasswörter.
- **TLS beim Datenumzug:** Die PostgreSQL-Migrationswerkzeuge verwenden
  beim Render-SSL-Muster aktuell `rejectUnauthorized:false`.
  Dadurch wird das Quellserver-Zertifikat nicht verifiziert.
  Vor realem Import eine verifizierte TLS-Verbindung oder einen
  geschützten, authentifizierten Tunnel planen und testen;
  nicht unbesehen über öffentliche Netze übertragen.
  MySQL-TLS und vertrauenswürdige CA ebenfalls prüfen, falls nicht lokal.
- **Staging-Zugriff:** Zugang zur Testumgebung eingrenzen,
  keine Produktivdaten in öffentlich erreichbare Verzeichnisse,
  Suchmaschinen-Indexierung vermeiden.
- **Ablaufende CI-Artefakte:** ZIP-Dateien aus GitHub Actions
  haben nur sieben Tage Aufbewahrung. Das Staging-Paket lässt
  sich vor der Installation aus dem geprüften Commit neu erstellen.
- **Webserver und PHP:** Echte `mod_rewrite`-/`.htaccess`-Unterstützung,
  Browser-Secure-Cookies hinter TLS-Proxy, Header, Logging, Größen-
  und Laufzeitlimits sowie PHP-Worker-Verfügbarkeit bestätigen.
- **Nach dem Umzug:** Backup-Job, Login-Ausfallschutz,
  Fehler-/Laufzeitüberwachung, Pflege abgelaufener Sessions und
  Zugriff auf historische Auditdaten als Betriebsaufgaben definieren.
- **DNS/Google:** Exakte Domain-/Google-OAuth-Ursprünge beim
  Wechsel anpassen, SSL-Zertifikat, DNS-TTL und Rückweg dokumentieren.

## Während dieses Audits direkt behoben und mit Tests abgesichert

1. **Öffentliche Seiten:** `/start` und `/datenschutz` waren
   im alten Node per Express geroutet, im neuen Apache aber nicht.
   `public/.htaccess` bildet beide Pfade nun explizit ab;
   der externe Staging-Test und die CI kontrollieren diese URLs.
2. **Veraltete Angaben in Datenschutzseite:** Datenbankspezifische
   PostgreSQL-Angaben wurden neutral formuliert und die tatsächlich
   angeforderten Google-Berechtigungen `drive.file` und
   `drive.readonly` erklärt.
3. **Dienstnummern-Konflikt:** `scripts/hosting/preflight.php`
   prüft jetzt schreibgeschützt, ob **belegte** Akten nach der
   Regel 50–60 Nebenberuf und alle anderen Hauptberuf klassifiziert
   sind. Ein CI-Gegentest mit synthetisch falsch klassifizierter
   Dienstnummer 50 muss die Freigabe verweigern.
4. **Öffentliche Datei-Leaks:** Der externe Staging-Check
   prüft zusätzlich, dass `/src/daten.json`, `/.env.local`
   und private SQL-Exportdateien über HTTPS **nicht abrufbar** sind.

## Was grüne CI tatsächlich nachweist

- PHP-Syntax und phpMyAdmin-SQL-Installation in MySQL 8
- Synthetische PostgreSQL→MySQL-Datenkopie einschließlich Hash-Vergleich
- Viele API-/Rollen-/Personal- und Archivabläufe mit künstlichen Daten
- Zwei-Nutzer-Konflikte, SSE-Ereignisse und Anmeldesperren
- DOCX-Technik, Google-Konfigurationsvalidierung und Node/PHP-CopNet-Kompatibilität
- Code-ZIP wird entpackt; privater Staging-Preflight läuft gegen
  **isolierte CI-Testdaten** (nicht gegen neuen Hoster)
- Externer HTTPS-Staging-Check wird mit **simulierten Antworten**
  auf Sicherheitsregeln geprüft

**Diese Testgrenzen nicht mit echter Host-, OAuth-, Restore- und
Produktivdaten-Freigabe verwechseln.**

## Ergebnis / Freigabesperre

`scripts/mysql/cutover-readiness.json` hat alle neun
`releases`-Freigaben weiterhin auf `false`.
`npm run mysql:cutover` bleibt dadurch blockiert.

**Live bleibt unverändert:**
`main`/Render/PostgreSQL/`idv-ppverwaltung.de`.
Keine DNS-Umstellung oder echte Datenübertragung durch dieses Audit.

**Nächste Entscheidung:** Erst Repository-Vertraulichkeit
bewerten, danach den neuen Hoster/Staging-Zugang klären und eine
echte Funktions- und Sicherheitsabnahme durchführen.
