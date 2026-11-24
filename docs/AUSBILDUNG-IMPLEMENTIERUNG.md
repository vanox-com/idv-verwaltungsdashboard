# Ausbildungsabteilung – zentraler Personalstamm & digitale Unterrichtsräume

Stand: 24.11.2026. Branch: `migration/mysql8-php-cutover-2026-11-10`. Die bestehende MySQL-8-/PHP-Verwaltung auf dem externen Hoster ist maßgeblich. Ein Commit in GitHub ist **kein Live-Deployment**.

## 1. Fachlicher Grundsatz: `personal` ist die einzige Quelle für Anwärter

Die Tabellen und Ansichten des ursprünglichen Polizeipersonals bleiben führend. Insbesondere werden Name, Personalnummer, aktueller Dienstgrad, Beschäftigungsart, Eintrittsdatum, RSA und Personalstatus **nicht** im Ausbildungsbereich neu erfasst oder dort bearbeitet.

- `Polizeimeisteranwärter` → **PMA-Monitor** (auch Bezeichnungsvarianten/Abkürzung PMA).
- `Polizeikommissaranwärter` → **PKA-Monitor**.
- `Kriminalkommissaranwärter` → **KKA-Monitor**.
- Nur die Personalstatus `Aktiv`, `Abgemeldet`, `Inaktiv` und `Suspendiert` werden angezeigt, sofern `administrativ_geloescht_am IS NULL`. Gekündigte, freigehaltene, gelöschte und andere Dienstgrade sind keine aktiven Anwärter.
- Nach einer Einstellung oder Dienstgradänderung wird beim Laden der Ausbildungsmonitore der aktuelle Personalstamm abgeglichen; bei geöffneten Monitoren erfolgt zusätzlich eine automatische Aktualisierung (alle 25 Sekunden, sofern gerade kein Formular bearbeitet wird). Die öffentliche namentliche Modulübersicht berechnet ihren Bestand direkt aus `personal` (ohne Schreibzugriff).
- `ausbildung_anwaerter` ist **nur die gebundene Ausbildungsergänzung**. Hier bleiben Ausbildungsbemerkungen, Modulabschlüsse, Ausbilderstimmen und personenbezogene Freigabetoken. Die Anlage von Personen direkt über die Ausbildungs-API ist ausdrücklich gesperrt.

### Verknüpfung und Neubelegung

`personal_quelle` ist ein neuer, eindeutig indizierter Schlüssel, zusammengesetzt aus der Personalnummer und der Zahl der archivierten Neubelegungen in `personalnummer_neubelegungen`. Beim erneuten Vergeben einer Dienstnummer erhält der neue Mitarbeiter dadurch eine **neue Ausbildungsergänzung** und keine Abschlüsse oder Token des vorherigen Mitarbeiters. Der gleiche Mitarbeiter darf in der Personalverwaltung umbenannt oder korrigiert werden, ohne seinen Ausbildungsstand zu verlieren. Bei Beförderung wird die neue Laufbahn aus dem Dienstgrad ermittelt; bei Ausscheiden verschwindet die Person aus der aktiven Monitoranzeige. Historische Ausbildungseinträge werden **niemals automatisch gelöscht**.

Einen bestehenden, bislang unabhängigen Anwärtereintrag mit Ausbildungsfortschritt übernimmt die Synchronisierung nur bei **eindeutig gleicher Dienstnummer, identischem Namen, passender Laufbahn und verträglichem Eintrittsdatum**, und nur wenn keine dokumentierte Neubelegung vorliegt. Unklare Altakten bleiben unverändert in der Datenbank, werden aber nicht fälschlich dem neuen Mitarbeiter zugeordnet. In solchen Fällen muss die Ausbildungsleitung die historische Zuordnung vor einer etwaigen manuellen Bereinigung kontrollieren.

## 2. Ausbildungs- und Laufbahnkonzept (aus den vorhandenen Formularen und Bewertungsregeln)

| Laufbahn | Verpflichtende Module | Regel für Status „Zugelassen“ |
|---|---|---|
| **PMA** | PM.0–PM.6 (7 Module) | Alle sieben abgeschlossen **und** gewichteter Abstimmungssaldo mindestens **+2,5** |
| **PKA** | PK.1–PK.4 (4 Module) | Alle vier abgeschlossen |
| **KKA** | derzeit ebenfalls PK.1–PK.4 (4 Module) | Alle vier abgeschlossen |

PMA-Stimmen: `Ja` trägt das hinterlegte Ausbildergewicht positiv, `Nein` negativ zum Saldo bei; nur eine Stimme pro Ausbilder. Die feste Gewichtung beträgt **Ausbilder auf Probe 0,5 Punkte**, **normale Ausbilder 1 Punkt** (mittlerer und gehobener Dienst), **Leitungsdienst 1,5 Punkte** und **Ausbildungsleitung/stv. Ausbildungsleitung 2 Punkte**. Bereits vorhandene Stimmen werden bei der Anzeige anhand der zugeordneten Funktion neu gewertet, ohne Stimmabgaben oder bestehende Tabellenwerte zu überschreiben. Interne und externe PMA-Zulassung verwenden dieselben Gewichte. Der eigentliche **Prüfungserfolg** und Wiederholungs-/Notenregelungen sind in den vorliegenden Vorlagen nicht verbindlich spezifiziert. Die Software berechnet **Prüfungszulassung**, nicht den Nachweis einer bestandenen Prüfung. PM.7, PK.5 und PK.7 bleiben bis zur Klärung zusätzlich erwähnte, aber nicht verpflichtende Module.

Die Seite `public/aulk.html` erläutert jede Laufbahn einschließlich Module, Vorgehen und den verbindlich abgebildeten Zulassungsvoraussetzungen. Keine erfundenen Prüfungsnoten oder zusätzlichen Regeln.

## 3. Externe Übersicht und Datenschutz

- `/aulk.html` enthält neben dem Laufbahnkonzept **drei öffentlich namentliche Live-Monitore**: PMA, PKA und KKA. Ohne Anmeldung werden **für jeden aktiven Anwärter sein Name, jedes Pflichtmodul (offen/abgeschlossen), der Modulfortschritt und der Zulassungsstatus** dargestellt. Nur beim PMA kommen **Anzahl der abgegebenen Stimmen** und **gewichteter Punktesaldo gegen die 2,5-Punkte-Schwelle** hinzu. Einzelstimmen (Ja/Nein), Ausbilder- und Prüferidentitäten, Dienstnummern, Personalakten, interne Bewertungen, Anmerkungen oder Zugangs-IDs werden **nicht** veröffentlicht. Die öffentliche API `GET /api/ausbildung-oeffentlich/monitore` liest den Personalstamm direkt, ohne neue Ausbildungsdatensätze anzulegen oder bestehende zu ändern. Die Seitenaktualisierung erfolgt alle 30 Sekunden. **Da die Seite ohne Anmeldung erreichbar ist, sind die gezeigten Anwärternamen und Ausbildungsstände für alle Besucher einsehbar.**
- `/ausbildung-status.html#<geheimer-token>` zeigt einem **individuell freigegebenen** Anwärter ohne Anmeldung seine persönlichen Modulstände und den Zulassungsstatus, ebenfalls ohne Namen oder interne Kommentare. Nach Kündigung, falscher Quellenbindung oder Deaktivierung wird der Abruf verweigert.
- Die öffentliche AuLK-Bibliothek zeigt ausschließlich explizit freigegebene Unterlagen. Private Google-Präsentationen werden nicht automatisch veröffentlicht. Google Drive kann zusätzliche Berechtigungen erfordern.

**PMA-Zulassung in zwei Schritten:** Solange ein Modul offen ist, lautet der öffentliche Status `Module ausstehend`. Sind alle PM.0–PM.6 abgeschlossen, aber der gewichtete Saldo noch unter +2,5, lautet er `Module abgeschlossen – Stimmen fehlen`. Erst mit allen Pflichtmodulen **und** mindestens +2,5 Punkten erscheint `Zur Prüfung zugelassen`. PKA und KKA bleiben gemäß der bisherigen Fachregel nach Abschluss der vier PK-Pflichtmodule zugelassen; eine zusätzliche Stimmenhürde ist für diese Laufbahnen nicht hinterlegt.

## 4. Unterrichtsräume: einfacher Ablauf

Im **normalen Polizeipanel** unter Ausbildung → **Unterrichtsräume**:

1. Ausbilder wählt eines seiner berechtigten Module mit Google-Präsentation aus.
2. Klick auf `Unterrichtsraum erstellen`. Die API legt einen einzelnen Raum mit maximal **zwei Stunden** Laufzeit an.
3. Der 256-Bit-Einladungslink wird angezeigt und kopiert. Er funktioniert ohne Panel-Login für genau **einen** Anwärterplatz. Der Server speichert nur den Hash des Geheimtokens.
4. Unter `Meine Unterrichtsräume` sieht der Ausbilder seine zuletzt erstellten Räume, Teilnehmer- und Laufzeitstatus und kann sie öffnen oder unmittelbar beenden.
5. Beim Öffnen der Ausbildertafel wird die Google-Präsentation eingebettet. Mit Browserfreigabe **dieses Tabs** sieht der Anwärter über WebRTC Folien, Laserpointer, Pfeile und Freihandmarkierungen.
6. Die Bildfreigabe muss im Browser explizit erlaubt werden. Nach dem Unterricht wird der Raum beendet, der Link ist dann ungültig.

Google-Präsentationen können nicht heimlich von fremden JavaScript-Seiten ferngesteuert werden; das Durchklicken erfolgt über die Google-Foliensteuerung im iframe. Ist die Google-Einbettung durch Berechtigungen blockiert, gibt es einen externen Link (Markierungen sind beim Freigeben eines anderen Tabs nicht im Bild). WebRTC nutzt derzeit STUN ohne eigenen TURN-Server, deshalb muss die Verbindung mit zwei echten Browsern getestet werden; nicht alle Netzwerke erlauben direkte Übertragungen. Es werden keine Aufzeichnungen, Mikrofone oder Kameras der Anwärter angefordert.

Die Ausbilder verwenden ausschließlich ihre bestehende, eigenständige `AUS-...`-Panel-Anmeldung. Trainingsrollen erhalten keine Rechte auf normale Personaldaten-APIs. Der administrative Personalstamm bleibt in seinen Schreibrechten unverändert.

## 5. Additive Installation auf dem PHP/MySQL8-Hoster

**Vor Änderungen:** Verschlüsseltes Datenbankbackup in der Backup-Übersicht erstellen, sicher herunterladen und ergänzend vollständiges SQL-Backup beim Hoster anfertigen. Die Setup-Routine führt Änderungen nur nach Prüfung eines aktuellen gesicherten Backups aus.

Auf bestehendem MySQL8 werden **nur diese vier** idempotenten Erweiterungen, in dieser Reihenfolge, angewendet:

1. `scripts/mysql/2026-11-24-ausbildung.sql` – Grundtabellen, Berechtigungen und Module;
2. `scripts/mysql/2026-11-24-aulk-public.sql` – explizite Freigabe für Materialien;
3. `scripts/mysql/2026-11-24-ausbildung-unterricht.sql` – Unterrichtsräume;
4. `scripts/mysql/2026-11-24-ausbildung-personal.sql` – neue eindeutige Verbindung zum zentralen Personalstamm.

**Nicht** die vollständige `IDV-MySQL8-phpMyAdmin-SETUP.sql` auf die bestehende Produktivdatenbank erneut anwenden. Personalakten werden von den Migrationen nicht gelöscht, geändert oder importiert. Neue Tabellen/Spalten unterstützen lediglich den späteren, getrennten Ausbildungsabgleich.

Nach Deployment des passenden PHP-/Public-Codes im Panel als Administrator `Ausbildung` aufrufen. Dort wird der Bedarf einer Nachinstallation angezeigt. Die Setup-Schaltfläche führt nur die geprüften additiven SQL-Skripte aus, **wenn** eine aktuelle gültige verschlüsselte Sicherung gefunden wird. Alternativ nach Backup die vier SQL-Dateien über phpMyAdmin ausführen.

Danach den PMA-, PKA- und KKA-Monitor öffnen: vorhandene aktive Personen müssen automatisch erscheinen. Neue Einstellung und Beförderung testweise in der Personalverwaltung simulieren, Monitor aktualisieren; Kündigung und Neubelegung gesondert prüfen. Für die externe Statusseite individuelle Links generieren; für Unterricht zwei Browser mit HTTPS einsetzen.

## 6. Tests, Grenzen und Rollout

GitHub Actions:
- `MySQL 8 / PHP backend syntax checks` lintet PHP/JavaScript und testet Rangzuordnung und Neubelegung.
- `Ausbildung / Rollen, Monitore und MySQL-Erweiterung` installiert die vier additiven Migrationen wiederholt auf echtem MySQL 8, prüft Login-Isolierung, den **automatischen Einstieg aus dem regulären Personalstamm**, Modulvoten, Tokens und Einladungen.
- `Ausbildung – geprüftes Deployment-Paket` baut ein datenfreies ZIP mit beiden PHP- und Public-Bestandteilen und den **vier** Migrationen.

Die bestehenden öffentlichen und internen Anwärterdaten sowie alle Polizeikonten werden nicht in GitHub eingecheckt. Es werden keine produktiven MySQL-Sätze oder Passwörter hierher kopiert. Das GitHub-Arbeitsbranch hat **keinen direkten Schreibzugriff auf die produktive Datenbank des externen Hosters**; Code-Commits und CI-Erfolge bedeuten nicht, dass der Live-Server bereits aktualisiert wurde.
