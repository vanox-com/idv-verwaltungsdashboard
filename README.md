# Verwaltungsportal Polizeirat

Portal für Personal, Beförderungen, Kündigungen und Disziplinarmanagement.
Anmeldung mit Dienstnummer und Passwort. Die Passwörter liegen verschlüsselt
in der Datenbank, nicht in der Seite.

## Aufbau

```
src/
  server.js      Webserver und alle Schnittstellen
  db.js          Verbindung zur Datenbank, legt das Schema an
  auth.js        Passwort-Verschlüsselung
  schema.sql     Tabellen und Grundrollen
  import.js      Import des Bestands aus daten.json
  daten.json     Der aus der Excel übernommene Datenbestand
public/
  index.html     Die Oberfläche
```

## Rollen

| Rolle | Darf |
|---|---|
| Administrator | alles, und als einzige Zugänge anlegen und ändern |
| Polizeirat | alles außer Zugängen |
| Leitungsdienst | Personal lesen, Beförderungen und Disziplin bearbeiten |
| Ausbilder | Routine, Sonderfunktionen, Checklisten |
| Mitarbeiter | nur Dashboard, Richtlinie, Organigramm |

Zugänge verwaltet ausschließlich der Administrator. Das prüft der Server bei
jedem Aufruf, nicht die Oberfläche.

## Erste Einrichtung

1. Auf render.com einloggen.
2. **New → PostgreSQL** anlegen, kostenlose Stufe wählen.
3. **New → Web Service** anlegen und das GitHub-Repository auswählen.
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Unter **Environment** eintragen:

   | Name | Wert |
   |---|---|
   | `DATABASE_URL` | wird beim Verbinden der Datenbank automatisch gesetzt |
   | `ADMIN_DIENSTNUMMER` | `00` |
   | `ADMIN_PASSWORT` | ein eigenes Passwort, mindestens 8 Zeichen |
   | `NODE_ENV` | `production` |

5. Speichern. Render startet den Dienst und legt beim ersten Start die
   Tabellen und den Administrator an.

## Datenbestand einspielen

Nach dem ersten Start einmalig im Render-Shell-Fenster:

```
npm run migrate
```

Das übernimmt die 58 Personen, 55 Kündigungen, Ränge, Listen und den
übrigen Bestand aus `src/daten.json`. Der Aufruf ist wiederholbar.

## Anmeldung

Dienstnummer `00` und das Passwort aus `ADMIN_PASSWORT`.
Neue Zugänge und alle anderen Personen bekommen ein Startpasswort, das beim
ersten Anmelden geändert werden muss.

## Sicherheit

- Passwörter liegen als bcrypt-Hash in der Datenbank.
- Die Sitzung läuft über ein Cookie, das JavaScript nicht lesen kann.
- Nach zehn Anmeldeversuchen pro Minute von derselben Adresse wird gebremst.
- Wer das Personalrecht nicht hat, bekommt keine Handynummern oder
  Geburtsdaten geliefert.
- Änderungen stehen im Protokoll.

Wer die Seite aufruft, sieht nur die Anmeldemaske. Personendaten gehen erst
nach erfolgreicher Anmeldung über die Leitung.

## Ernennungsurkunden in persönlichen Google-Drive-Konten

Nach einer dokumentierten Beförderung **Polizeimeisteranwärter → Polizeimeister** kann
ein entsprechend berechtigter Nutzer in **Beförderungen → Ernennungsurkunden**
eine personalisierte Google-Docs-Urkunde erzeugen. Der Google-Account wird
beim Klick über Google Identity Services ausgewählt. **Derjenige, der die
Erstellung startet, ist Eigentümer der Datei in seinem eigenen Drive.**
Das Polizeidashboard speichert ausschließlich Dokumenttitel und Link in der
bestehenden Personalakte. Login-/Refresh-/Access-Tokens werden nicht dauerhaft
gespeichert, es wird kein Servicekonto benötigt.

Einmalige technische Konfiguration:

1. In [Google Cloud Console](https://console.cloud.google.com/) ein Projekt für
   das Portal erstellen/auswählen. **Google Drive API** aktivieren.
2. Unter **Google Auth Platform** eine OAuth-Zustimmungsseite konfigurieren.
   Beim Status **Testing** berechtigte Testnutzer eintragen.
3. OAuth-Client **Web application** anlegen und unter **Authorized JavaScript origins**
   die genutzten Portal-Origin(s) hinterlegen, insbesondere
   `https://idv-ppverwaltung.de`. Die Render-Origin sollte nach dem
   Domainwechsel für die öffentliche Google-Verifizierung entfernt werden,
   weil `onrender.com` keine selbst verifizierbare eigene Domain ist.
   Keine Pfade oder abschließenden Schrägstriche.
4. Die beiden Werte in Render unter **Environment** hinterlegen:
   `GOOGLE_OAUTH_CLIENT_ID` (nicht geheim, für Google-Anmeldung)
   und `GOOGLE_OAUTH_CLIENT_SECRET` (geheim, **niemals** ins Repository).
5. Render neu deployen und nach der Anmeldung eine bereits durchgeführte
   PMA→PM-Beförderung zum Test verwenden.

Die OAuth-App fordert nur `https://www.googleapis.com/auth/drive.file` an.
Beim Erstellen wird **einmalig** ein Google-Autorisierungscode gegen einen
kurzlebigen Zugriffs-Token getauscht und das Dokument direkt im gewählten
Drive-Konto angelegt. Der Browser erhält keinen Google-Token zurück.
Personen mit Leserecht der Personalakte können den gespeicherten Link sehen,
wenn die Google-Datei für sie freigegeben wurde; **die Google-Dateiberechtigungen
bleiben beim Ersteller**. Die Funktion verwendet die originale Google-Docs-Blankovorlage mit Wappen und Unterschriften. Aus der Vorlage werden die Platzhalter `<Vorname>`, `<Name>`, `<Geburtsdatum>` und die beiden `<Datum>`-Felder ersetzt. Nach der persönlichen Google-Anmeldung wird eine Kopie im Drive-Konto des klickenden Nutzers gespeichert. Kann Google die Vorlage mit dem begrenzten `drive.file`-Recht nicht direkt kopieren, wird die öffentlich lesbare DOCX-Fassung der Originalvorlage importiert (kleine Formatabweichungen bei der Konvertierung sind möglich). Die frühere vereinfachte HTML-Ersatzurkunde wird nicht mehr verwendet.
Ein Google-Konto kann nicht allein aus der RP-Dienstnummer erkannt werden;
die Google-Kontoauswahl ist daher bewusst erforderlich.

**Hinweis:** Vor einem ersten Einsatz muss die neue Google-OAuth-App eingerichtet
und der Prozess mit einem tatsächlich ausgewählten Google-Konto getestet werden.
Ohne diese Konfiguration bleibt die Erzeugungsfunktion gesperrt.

## Öffentliche Seiten für Google-OAuth-Branding

- **Öffentliche Informationsseite:** `/start` (ohne Anmeldung)
- **Datenschutzerklärung:** `/datenschutz` (ohne Anmeldung)
- **Bisheriger Portal-Login:** `/` (unverändert)

Unter **Google Auth Platform → Branding** die Homepage ausdrücklich auf
`https://DEINE-DOMAIN/start` und die Datenschutzerklärung auf
`https://DEINE-DOMAIN/datenschutz` setzen. Im OAuth-Client
die neue Portal-Domain unter „Autorisierte JavaScript-Quellen“ hinzufügen.
Für die Verifizierung muss die Domain über die Google Search Console
nachweisbar dem Projektbetreiber gehören. Eine gemeinsame Render-Domain
ist nicht als dauerhafte, selbst besessene Domain geeignet.

**Vor Google-Verifizierung unbedingt vervollständigen:** Auf der Seite
`public/datenschutz.html` müssen die für das echte Projekt verantwortliche
Person/Organisation und eine funktionierende Kontaktadresse, die tatsächlichen
Rechtsgrundlagen, Löschfristen und Empfänger/Hoster konkretisiert werden.
Die bereitgestellte Erklärung beschreibt die technischen Datenflüsse nach
dem aktuellen Code, ist aber kein geprüfter endgültiger Rechtstext.


## Aktuelle Hauptdomain: idv-ppverwaltung.de (IONOS → Render)

Die **neue Hauptdomain** lautet **https://idv-ppverwaltung.de**. Die
bestehende Render-Adresse `https://idv-verwaltungsdashboard-1.onrender.com`
bleibt bis zur bestätigten DNS-Verbindung als Rückfalladresse bestehen.
Die bisherige, nicht funktionierende Domain darf nicht mehr in den
aktuellen Google-OAuth-Brandingangaben oder als primäre Domain stehen.

**IONOS und Render müssen einmalig extern konfiguriert werden:**

1. Render → Webservice `idv-verwaltungsdashboard-1` → Settings →
   Custom Domains → `idv-ppverwaltung.de` hinzufügen. Render legt in
   der Regel auch `www.idv-ppverwaltung.de` als Weiterleitung an.
2. IONOS → Domains & SSL → `idv-ppverwaltung.de` → DNS:
   * für den Stamm `@` ein A-Record auf Render-Load-Balancer
     `216.24.57.1`, sofern das Render-Dashboard keinen anderen Wert
     verlangt;
   * für `www` ein CNAME auf
     `idv-verwaltungsdashboard-1.onrender.com`;
   * konkurrierende alte A-/AAAA-/CNAME-/Weiterleitungs-Records
     für genau diese Hosts entfernen, aber MX-, SPF-, DKIM-
     und andere nicht betroffene Einträge erhalten.
3. In Render auf **Verify** klicken und auf das automatisch verwaltete
   HTTPS-Zertifikat warten. Domain und HTTPS vor Produktivfreigabe testen.
4. Google Cloud Console → Google Auth Platform:
   * Branding-Startseite: `https://idv-ppverwaltung.de/start`
   * Datenschutz: `https://idv-ppverwaltung.de/datenschutz`
   * Autorisierte Domain: `idv-ppverwaltung.de`
   * OAuth-Webclient → Autorisierte JavaScript-Quellen:
     `https://idv-ppverwaltung.de` (vor Google-Verifizierung zuvor
     eingetragene gemeinsame Render-Origins entfernen)
   * Google Search Console → Domain-Eigentum per IONOS-TXT-Eintrag
     verifizieren. Alte Branding-Angaben zur ungenutzten Domain prüfen
     und entfernen.
5. Die Datenschutzerklärung muss vor Google-Prüfung durch den
   Betreiber um Verantwortliche, Kontakt, Rechtsgrundlagen und
   Aufbewahrungsfristen vervollständigt werden.

Der Node-/Express-Server erkennt die Browser-Origin der aufgerufenen
Domain automatisch. **Keine** hartcodierte Render-Adresse ist für die
Google-Code-Weiterleitung erforderlich; die passende Origin muss jedoch
im Google-OAuth-Client freigegeben sein. Benutzer, Rollen, Datenbank,
Ernennungsurkunden und bisherige Dokumentenlinks bleiben beim
Domainwechsel auf demselben Render-Service erhalten.
