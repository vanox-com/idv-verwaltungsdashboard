# Schritt 5 – Go-/No-Go-Vorbereitung für den finalen Anbieterwechsel

**Stand: 10.11.2026**  
**Status: Ablauf technisch vorbereitet; produktiver Wechsel ausdrücklich NO-GO.**  
**Arbeitszweig:** `migration/mysql8-php-cutover-2026-11-10`. Der produktive Branch `main`, Render, PostgreSQL und
`idv-ppverwaltung.de` bleiben unverändert.

## Was vorbereitet wurde

`scripts/mysql/cutover.mjs` führt nach *nachgewiesener Freigabe* in dieser
Reihenfolge aus:

1. Quellen-Schema von PostgreSQL schreibgeschützt prüfen
2. Vollständiges MySQL-8-Schema ausschließlich in einer **neu erstellten, leeren Datenbank** installieren
3. 48 Quelltabellen kopieren, **Sitzungen bewusst auslassen**
4. 47 Datentabellen mit normalisierten SHA-256-Zeilenvergleichen prüfen
5. Beim ersten Fehler **sofort stoppen**, ohne DNS oder die alte Website zu verändern

Das Datenübernahmeskript **nimmt keine DNS- oder Render-Änderungen vor**.
Das alte Portal muss außerhalb des Skripts tatsächlich schreibgeschützt
bzw. kontrolliert angehalten werden. Eine Umgebungsvariable allein stoppt
keinen Schreibzugriff!

## Automatische doppelte Freigabesperre

`npm run mysql:cutover:check` führt **keinen** Datentransfer aus.
Solange einer der neun Punkte in `scripts/mysql/cutover-readiness.json`
nicht durch reale Nachweise freigegeben ist, liefert das Kommando
einen **nicht erfolgreichen Exitcode**.

Zusätzlich verweigert das spätere Transferkommando den Start, sofern
folgende **genau passenden** Bestätigungen nicht gesetzt sind:

| Variable | Exakter Freigabewert |
| --- | --- |
| `IDV_WRITES_STOPPED` | `YES` |
| `IDV_WRITE_FREEZE_VERIFIED` | `YES` |
| `IDV_BACKUP_CONFIRMED` | `RESTORE_TESTED` |
| `IDV_STAGING_ACCEPTED` | `PASSED` |
| `IDV_ROLLBACK_CONFIRMED` | `YES` |
| `IDV_CUTOVER_CONFIRMED` | `I_AUTHORIZE_DATA_MIGRATION` |
| `MYSQL_COPY_CONFIRM` | `EMPTY_NEW_DATABASE` |
| `MYSQL_SCHEMA_CONFIRM` | `EMPTY_NEW_DATABASE` |
| `IDV_EXPECTED_SOURCE_DATABASE` | vorher bestätigter Name der PostgreSQL-Datenbank |
| `IDV_EXPECTED_TARGET_DATABASE` | vorher bestätigter Name der neuen MySQL-Datenbank |

Der Prüfer gleicht die letzten beiden Namen mit den Datenbank-URLs ab und
verweigert Verbindungen mit falschem Datenbanknamen **vor dem ersten Schreibzugriff**.

**Nicht einfach die Freigabe-Flags auf `true` setzen.** Die Freigabe darf erst
erfolgen, wenn jeder Punkt einzeln gegen den echten Staging-Host,
die echten Berechtigungen und eine nachweislich geprüfte Datensicherung
abgenommen wurde. Die neuen automatisierten Tests prüfen diese Sperren
mit **rein künstlichen Werten und ohne Live-Verbindung**.

## Noch fehlende Nachweise (deshalb derzeit NO-GO)

Die neun Freigaben stehen bewusst weiterhin auf `false`.
Insbesondere fehlen noch:

- Staging-Adresse, PHP-/HTTPS-/MySQL-Konfiguration und Test am tatsächlichen Anbieter
- Echtes Google-OAuth-Popup mit freigegebener Origin, Vorlagenzugriff,
  Dokumenten- und Urkundenerstellung mit einem autorisierten Testkonto
- Prüfung der vorhandenen CopNet-Verschlüsselung **mit dem ursprünglichen Schlüssel**
- Vollständige Abnahme des PHP-Bootstrap-Datenvertrags, historischer Sonderfälle,
  aller wichtigen UI-/API-Aktionen und Rechtekombinationen mit realistischem Datenbestand
- Kontrollierter Probevergleich nach einer **vertraulichen, berechtigten** Kopie
  der echten Quelldaten in eine geschützte Testumgebung; kein personenbezogener
  Datenbestand in GitHub oder öffentliches Staging
- Bestätigtes und in separater Umgebung **restauriertes** PostgreSQL-Backup
- Geprüfte technische Schreibsperre des bisherigen Render-/Node-Portals;
  die tatsächliche letzte Schreibtransaktion muss abgeschlossen sein
- Verfügbarer Rückfallplan mit Ansprechpartner und DNS-/HTTPS-Zugriff

## Am Wechseltag – festgelegte Reihenfolge

1. Vorab **beide** Ziel- und Quellsysteme genau identifizieren.
   Git-Commit der freigegebenen PHP-Version fixieren; Staging-Freigabe
   schriftlich festhalten. Aktuelle DNS-Einträge und TTL dokumentieren.
2. Vollständiges PostgreSQL-Backup **außerhalb** des Git-Repositories
   sichern und dessen Wiederherstellung überprüfen; Zeitpunkt und
   Backup-Referenz separat protokollieren.
3. Bisherige Anwendung in eine **wirkliche Schreibpause** versetzen:
   keine neuen Benutzeränderungen, alle Transaktionen abgeschlossen,
   ggf. Webzugang vorübergehend sperren. Überprüfen, dass kein
   API-Schreibweg mehr erreichbar ist.
4. Freigabedatei nur für **nachweislich geprüfte** Punkte aktualisieren;
   `npm run mysql:cutover:check` muss erfolgreich sein.
   Mit Verbindungsdaten im privaten Secret-Store und den obigen
   Bestätigungen (niemals in GitHub) **einmalig**
   `npm run mysql:cutover` ausführen.
5. Nur bei fehlerfreiem SHA-256-Datenvergleich: PHP-Host auf
   **finalem Importstand** validieren; Admin/POR/Leitungsdienst,
   Berechtigungen, Google-Dokumente, CopNet, Live-Updates und
   Schreibkonflikte testen. Bis dahin alte Seite schreibgesperrt halten.
6. Erst nach erneutem **Go** die öffentliche DNS-/HTTPS-Umschaltung
   durch den Domain-/Hoster-Zugang vornehmen. Smoke-Checks und Logs
   kontrollieren. Alten Hoster, Sicherungen und Altdaten behalten.

### Rückfall – zwei strikt getrennte Situationen

- **Vor dem ersten produktiven MySQL-Schreibvorgang:** Neu-Host sperren,
  auf den unveränderten Render-/PostgreSQL-Stand zurückschalten,
  Wiederherstellbarkeit bestätigen und alte Schreibsperre erst
  nach Kontrolle aufheben.
- **Nach produktiven MySQL-Schreibvorgängen:** **Kein blindes DNS-Rollback.**
  Beide Systeme schreibgeschützt schalten, neue MySQL-Vorgänge aus
  Audit- und Datenbankstand rekonstruieren, kontrolliert übernehmen oder
  eine bewusste Datenverlustentscheidung treffen. Erst danach alten
  Dienst freigeben. Der Wechsel ist ohne diese Klärung **nicht reversibel**.

## Was der Nutzer beim späteren Startsignal noch tun muss

Ein kurzes **„Umzug freigeben“** reicht als Gesprächssignal.
Vor einer tatsächlichen Ausführung werden trotzdem die bis dahin
noch offenen objektiven Prüfungen sowie die Berechtigung für
Zielhoster/DNS und ein geprüfter Backup-/Rückfallnachweis benötigt.
Geheimnisse gehören in den geschützten Hoster-/Ausführungs-Secret-Store
und **nicht in Chatnachrichten oder GitHub**.

### Technische Nachweise

- `node --test tests/cutover-policy.test.mjs` – Sicherheitslogik
  ohne Netzwerk und ohne Datenbankänderung testen
- `npm run mysql:cutover:check` – Freigabestand schreibfrei ansehen
- `scripts/hosting/preflight.php` – Zielhoster read-only prüfen
- `scripts/hosting/staging-http-check.sh` – Staging-Webzugriff testen
- `scripts/mysql/verify.mjs` – datenhaltigen Stand nur lesend vergleichen

**Keine automatisierte DNS-Umschaltung ist enthalten.**
