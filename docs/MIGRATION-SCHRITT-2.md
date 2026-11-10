# Schritt 2 – Funktionsprüfung PHP / MySQL 8

**Stand: 10.11.2026**  
**Status: Automatisierte Funktionsprüfung erfolgreich; vollständige Produktionsabnahme steht aus.**  
Arbeitszweig: `migration/mysql8-php-cutover-2026-11-10`  
GitHub Actions: [MySQL8 real database integration – Run 42909646385](https://github.com/vanox-com/idv-verwaltungsdashboard/actions/runs/42909646385) – erfolgreich.

## Abgeschlossene Prüfungen

- PHP-Syntaxprüfung der Backend-Dateien
- Gegenprüfung der ursprünglichen 103 Node-API-Methoden/Routen:
  101 reguläre HTTP-Routen auf einer isolierten MySQL-Testdatenbank geprüft;
  Logout und SSE werden gesondert über spezialisierte Tests abgedeckt
- Vollständiger Probeumzug von einer künstlichen PostgreSQL-Datenbank
  nach MySQL 8; 48 Tabellen kopiert, 47 Datentabellen verglichen, ohne Abweichung
  (Sitzungen absichtlich nicht migriert)
- Benutzeranmeldung, Rollenrechte und eingeschränkte Personaldatenausgabe
- Personal anlegen, bearbeiten, Revisionen vergleichen
- POR-Anträge, Entscheidungen, Beförderung, Dienstnummernanträge und Genehmigungen
- Routinetermine, Anwesenheit, Routinearchiv und Wiederherstellung
- Checklisten anlegen, Häkchen ändern, veraltete Änderungen abweisen,
  Aufgaben umsortieren, löschen und **mit Häkchen** wiederherstellen
- Textbausteine anlegen, bearbeiten, Änderungskonflikte abweisen,
  in den Papierkorb verschieben und unverändert wiederherstellen
- Kündigungsdokument-Link aktualisieren und persistent auslesen
- Dienstnummer `freihalten` bleibt frei, `Gekündigt` belegt die Nummer,
  automatische Kündigungsübernahme aus einer Personalakte
- CopNet-Verschlüsselung mit synthetischen Beispieldaten
- Parallele Personaländerung durch zwei PHP-Sitzungen: eine Speicherung (200),
  eine Konfliktantwort (409)
- Live-Update-Ereignis erreicht eine zweite angemeldete Sitzung
- DOCX/Urkunden-Platzhalter anhand künstlicher Word-Archive

## Während dieses Schritts gefundene und behobene Fehler

1. **Checklisten-Papierkorb:** Gespeicherte Häkchen enthielten keine separate
   Namensspalte; die Wiederherstellung griff irrtümlich darauf zu.
   Stattdessen wird nun der ursprüngliche Checklistenname aus dem
   Archivdatensatz verwendet. Erfolgreicher Regressionstest.
2. **Kündigungsdokument-Test:** Das Dokumentfeld enthält das bisherige
   JSON-Textformat. Der Test wird nun korrekt als JSON geparst, statt
   auf unescaped URL-Text zu prüfen. Der Dokument-Link selbst war
   bereits korrekt gespeichert.

## Was weiterhin nicht als produktiv abgenommen gilt

Die 101-Routen-Prüfung testet Erreichbarkeit und offensichtliche
Backend-Fehler – **nicht jede Geschäftsregel jeder Route**.
Die End-to-End-Testfälle decken zentrale Abläufe ab, jedoch nicht
jede mögliche Rechte-, Altdaten- und Fehlerkonstellation.

Vor dem Anbieterwechsel bleiben erforderlich:

- Schritt 3: umfassende Rechte-/Sicherheitstests mit mehreren Rollen,
  Konfliktfälle außerhalb der Personalakte, Revisions-/Historienkonsistenz
- Schritt 4: echter Test der **persönlichen Google-OAuth-Anmeldung**,
  Zugriff auf die **originalen Word-Vorlagen**, Dokumentspeicherung,
  Hosting-Konfiguration, PHP-Extensions und Stagingbetrieb
- Schritt 5: finaler Datenvergleich, produktiver Schreibstopp,
  Freigabesperre bewusst aufheben, Cutover- und Rückfallprobe

**Es wurde weder `main` noch die produktive PostgreSQL-Datenbank
oder `idv-ppverwaltung.de` umgestellt.**
Die Datei `scripts/mysql/cutover-readiness.json` bleibt bewusst
auf NO-GO, bis alle verbleibenden Prüfpunkte belegt sind.
