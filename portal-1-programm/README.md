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
