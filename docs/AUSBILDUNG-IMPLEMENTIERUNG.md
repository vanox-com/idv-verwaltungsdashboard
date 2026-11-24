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

- `/aulk.html` enthält neben dem Laufbahnkonzept **drei öffentlich namentliche Live-Monitore**: PMA, PKA und KKA. Ohne Anmeldung werden **für jeden aktiven Anwärter sein Name, jedes Pflichtmodul (offen/abgeschlossen), der Modulfortschritt und der Zulassungsstatus** dargestellt. Nur beim PMA kommt die **Anzahl der abgegebenen Stimmen** hinzu. **Individuelle Punktzahlen werden öffentlich nicht angezeigt**; der Server errechnet die Mindestschwelle nur intern für den Zulassungsstatus. Einzelstimmen (Ja/Nein), Ausbilder- und Prüferidentitäten, Dienstnummern, Personalakten, interne Bewertungen, Anmerkungen oder Zugangs-IDs werden **nicht** veröffentlicht. Die öffentliche API `GET /api/ausbildung-oeffentlich/monitore` liest den Personalstamm direkt, ohne neue Ausbildungsdatensätze anzulegen oder bestehende zu ändern. Die Seitenaktualisierung erfolgt alle 30 Sekunden. **Da die Seite ohne Anmeldung erreichbar ist, sind die gezeigten Anwärternamen und Ausbildungsstände für alle Besucher einsehbar.**
- `/ausbildung-status.html#<geheimer-token>` zeigt einem **individuell freigegebenen** Anwärter ohne Anmeldung seine persönlichen Modulstände und den Zulassungsstatus, ebenfalls ohne Namen oder interne Kommentare. Nach Kündigung, falscher Quellenbindung oder Deaktivierung wird der Abruf verweigert.
- Die öffentliche AuLK-Bibliothek zeigt ausschließlich explizit freigegebene Unterlagen. Private Google-Präsentationen werden nicht automatisch veröffentlicht. Google Drive kann zusätzliche Berechtigungen erfordern.

**PMA-Zulassung in zwei Schritten:** Solange ein Modul offen ist, lautet der öffentliche Status `Module ausstehend`. Sind alle PM.0–PM.6 abgeschlossen, aber der gewichtete Saldo noch unter +2,5, lautet er `Module abgeschlossen – Stimmen fehlen`. Erst mit allen Pflichtmodulen **und** mindestens +2,5 Punkten erscheint `Zur Prüfung zugelassen`. PKA und KKA bleiben gemäß der bisherigen Fachregel nach Abschluss der vier PK-Pflichtmodule zugelassen; eine zusätzliche Stimmenhürde ist für diese Laufbahnen nicht hinterlegt.

## Interne Stimmabgabe – Herkunftsnachweis

Jede **neue** PMA-Stimme muss einen **Anlass** haben: `Streifenfahrt` oder `Sonstige Leistungen`. Zusätzlich kann eine Bemerkung hinterlegt werden. Bei **Nein** ist eine nicht leere **Begründung/Bemerkung zwingend**. Bei **Ja** mit Anlass `Streifenfahrt` muss ein gültiges **Datum der Streifenfahrt** erfasst werden. Diese Pflichtfelder werden sowohl im Formular als auch serverseitig überprüft.

Die private Ausbildungsakte zeigt Ausbilder, Ja/Nein, Gewicht, Anlass, gegebenenfalls Streifenfahrt-Datum, Bemerkung und Aktualisierungsdatum. **Nichts davon erscheint auf der öffentlich zugänglichen AuLK-Seite außer der bloßen Anzahl abgegebener Stimmen und dem resultierenden Zulassungsstatus.**

Das additive SQL `2026-11-24-ausbildung-vote-details.sql` ergänzt drei nullable Spalten; historische Stimmen bleiben ohne Veränderung erhalten. Bei Altstimmen wird der Anlass intern als `Alteintrag` angezeigt. Die Stimmenwertung bleibt +0,5/+1/+1,5/+2 beziehungsweise negativ bei Nein, wird aber außen nicht als Punktesumme offengelegt.

## Automatische Präsentationsübernahme aus der eingereichten ZIP

Die ursprüngliche Datei `AUSBILDER-20261124T175747Z-1-001.zip` und die zusätzliche `AuLK_Freigegebene_Externe_Praesentationen.zip` wurden anhand ihrer internen PPTX-Dateinamen ausgewertet. Für die zwölf PM-/PK-Hauptfolien einschließlich zusätzlicher PM.1-Funkpräsentation sowie vier Zusatzschulungen wurden gleichnamige **bereits im verbundenen Google Drive vorhandene** native Google-Präsentationen gefunden und abgeglichen.

Die PHP-Funktion `ausbildungSeedZipDecks` in `php/AusbildungDecks.php` legt beim ersten Öffnen der Ausbildungsübersicht durch eine **Ausbildungsleitung/Administrator** nur fehlende Verweise in `ausbildung_materialien` an (16 sichere Referenzen, Standard `public_aktiv=0`). Bestehende Datensätze bleiben unverändert, die Aktion ist idempotent und benötigt **keinen manuellen Einzelupload**. Entwürfe, Testpräsentationen, Blankovorlagen und interne Prüfungslisten aus dem ZIP werden nicht automatisch veröffentlicht. Die Funktion lädt bewusst **nicht die binären PPTX-Dateien auf den PHP-Hoster**: Der Ausbildungsraum und die Bibliothek nutzen die vorhandenen Google-Slides-Versionen. Die normalen Google-Zugriffsrechte gelten weiter; zum Liveunterricht kann der Ausbilder unabhängig davon seinen Bildschirm freigeben.

## 4. Unterrichtsräume: einfacher Ablauf

Im **normalen Polizeipanel** unter Ausbildung → **Unterrichtsräume**:

1. Ausbilder wählt eines seiner berechtigten Module mit Google-Präsentation aus.
2. Klick auf `Unterrichtsraum erstellen`. Die API legt einen einzelnen Raum mit maximal **zwei Stunden** Laufzeit an.
3. Der 256-Bit-Einladungslink wird angezeigt und kopiert. Er funktioniert ohne Panel-Login für genau **einen** Anwärterplatz. Der Server speichert nur den Hash des Geheimtokens.
4. Unter `Meine Unterrichtsräume` sieht der Ausbilder seine zuletzt erstellten Räume, Teilnehmer- und Laufzeitstatus und kann sie öffnen oder unmittelbar beenden.
5. Die Ausbildertafel bettet die **Original-Google-Präsentation** ein. Das neue Layout trennt die Folienfläche klar von Einladungslink, Teilnehmerstatus und Moderationswerkzeugen. Der Anwärter sieht ein schlankes reines 16:9-Folienbild.
6. Beim Klick auf **„Unterricht starten“** verlangt der Browser einmalig die ausdrückliche Freigabe von **„Diesen Tab“**. **Vor dem WebRTC-Senden** wird der Videotrack mit **Region Capture** (`CropTarget.fromElement(#tafel)` und `MediaStreamTrack.cropTo()`) zwingend auf die Folientafel inklusive Laserpointer, Pfeilen und Freihandmarkierungen **beschnitten**. Ein falscher Tab oder nicht unterstützter Browser wird **ohne Fallback auf eine unbeschnittene Bildschirmfreigabe** abgewiesen. Die zusätzliche Capture-Handle-Prüfung bestätigt die Auswahl des eigenen Tabs, sofern der Browser dies unterstützt.
7. Beim Klick auf **„Folien neu laden“** wird dieselbe Google-Slides-Datei mit einer frischen iframe-URL geladen und bisherige Moderationsmarkierungen gelöscht. **Google-Slides-Änderungen am Original sind dadurch beim nächsten Laden sichtbar**, aber Änderungen werden während einer laufenden Einbettung nicht garantiert automatisch live synchronisiert.
8. Die Sitzung wird vom Ausbilder ausdrücklich beendet; der Link wird dann ungültig. Es werden keine Videos auf dem PHP-Server aufgezeichnet.

**Browsergrenze:** Region Capture / CropTarget ist insbesondere in aktuellen Chromium-Desktopbrowsern (Google Chrome/Edge) verfügbar, aber nicht plattformweit. Die Übertragung wird bewusst blockiert, wenn die zuverlässige Begrenzung auf den Folienbereich nicht gewährleistet ist. Die Browserfreigabe kann aus Sicherheitsgründen nicht vollständig unterdrückt werden; eine einmalige Zustimmung ist unvermeidbar. Google-Präsentationen sind cross-origin und werden nicht per JavaScript fernbedient; Folienwechsel erfolgen im eingebetteten Google-Slides-Rahmen. Die Einbettung setzt weiterhin entsprechende Google-Berechtigungen voraus. Der bisherige externe Link bleibt nur für die separate Originalansicht und ist **kein** unbeschnittener Übertragungs-Fallback.

WebRTC nutzt derzeit STUN ohne eigenen TURN-Server. Deshalb muss die Verbindung mit zwei echten Browsern getestet werden; nicht alle Netzwerke erlauben direkte Übertragungen. Weder Mikrofon noch Kamera werden angefordert.

Die Ausbilder verwenden ausschließlich ihre bestehende, eigenständige `AUS-...`-Panel-Anmeldung. Trainingsrollen erhalten keine Rechte auf normale Personaldaten-APIs. Der administrative Personalstamm bleibt in seinen Schreibrechten unverändert.

## 5. Additive Installation auf dem PHP/MySQL8-Hoster

**Vor Änderungen:** Verschlüsseltes Datenbankbackup in der Backup-Übersicht erstellen, sicher herunterladen und ergänzend vollständiges SQL-Backup beim Hoster anfertigen. Die Setup-Routine führt Änderungen nur nach Prüfung eines aktuellen gesicherten Backups aus.

Auf bestehendem MySQL8 werden **nur diese fünf** idempotenten Erweiterungen, in dieser Reihenfolge, angewendet:

1. `scripts/mysql/2026-11-24-ausbildung.sql` – Grundtabellen, Berechtigungen und Module;
2. `scripts/mysql/2026-11-24-aulk-public.sql` – explizite Freigabe für Materialien;
3. `scripts/mysql/2026-11-24-ausbildung-unterricht.sql` – Unterrichtsräume;
4. `scripts/mysql/2026-11-24-ausbildung-personal.sql` – neue eindeutige Verbindung zum zentralen Personalstamm;
5. `scripts/mysql/2026-11-24-ausbildung-vote-details.sql` – Anlass, Streifenfahrt-Datum und Begründung in der internen Stimmenverwaltung.

**Nicht** die vollständige `IDV-MySQL8-phpMyAdmin-SETUP.sql` auf die bestehende Produktivdatenbank erneut anwenden. Personalakten werden von den Migrationen nicht gelöscht, geändert oder importiert. Neue Tabellen/Spalten unterstützen lediglich den späteren, getrennten Ausbildungsabgleich.

Nach Deployment des passenden PHP-/Public-Codes im Panel als Administrator `Ausbildung` aufrufen. Dort wird der Bedarf einer Nachinstallation angezeigt. Die Setup-Schaltfläche führt nur die geprüften additiven SQL-Skripte aus, **wenn** eine aktuelle gültige verschlüsselte Sicherung gefunden wird. Alternativ nach Backup die vier SQL-Dateien über phpMyAdmin ausführen.

Danach den PMA-, PKA- und KKA-Monitor öffnen: vorhandene aktive Personen müssen automatisch erscheinen. Neue Einstellung und Beförderung testweise in der Personalverwaltung simulieren, Monitor aktualisieren; Kündigung und Neubelegung gesondert prüfen. Für die externe Statusseite individuelle Links generieren; für Unterricht zwei Browser mit HTTPS einsetzen.

## 6. Tests, Grenzen und Rollout

GitHub Actions:
- `MySQL 8 / PHP backend syntax checks` lintet PHP/JavaScript und testet Rangzuordnung und Neubelegung.
- `Ausbildung / Rollen, Monitore und MySQL-Erweiterung` installiert die vier additiven Migrationen wiederholt auf echtem MySQL 8, prüft Login-Isolierung, den **automatischen Einstieg aus dem regulären Personalstamm**, Modulvoten, Tokens und Einladungen.
- `Ausbildung – geprüftes Deployment-Paket` baut ein datenfreies ZIP mit beiden PHP- und Public-Bestandteilen und den **fünf** Migrationen.

Die bestehenden öffentlichen und internen Anwärterdaten sowie alle Polizeikonten werden nicht in GitHub eingecheckt. Es werden keine produktiven MySQL-Sätze oder Passwörter hierher kopiert. Das GitHub-Arbeitsbranch hat **keinen direkten Schreibzugriff auf die produktive Datenbank des externen Hosters**; Code-Commits und CI-Erfolge bedeuten nicht, dass der Live-Server bereits aktualisiert wurde.
