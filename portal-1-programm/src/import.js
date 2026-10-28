import pg from 'pg';
import { readFile } from 'node:fs/promises';

/* Importiert den aus der Excel übernommenen Bestand in die Datenbank.
   Der Aufruf ist wiederholbar: vorhandene Zeilen werden ersetzt. */

const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && /render\.com|sslmode=require/.test(process.env.DATABASE_URL)
    ? { rejectUnauthorized: false } : false
});

const daten = JSON.parse(await readFile(new URL('./daten.json', import.meta.url), 'utf8'));

async function main() {
  const c = await db.connect();
  try {
    await c.query('BEGIN');

    /* Ränge */
    for (let i = 0; i < daten.raenge.length; i++) {
      const r = daten.raenge[i];
      await c.query(
        `INSERT INTO raenge (name, abk, tage, bemerkung, grund, sortierung)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (name) DO UPDATE SET abk=EXCLUDED.abk, tage=EXCLUDED.tage,
           bemerkung=EXCLUDED.bemerkung, grund=EXCLUDED.grund, sortierung=EXCLUDED.sortierung`,
        [r.name, r.abk, r.tage, r.bemerkung, r.grund, i]);
    }

    /* Personal */
    for (const p of daten.personal) {
      await c.query(
        `INSERT INTO personal (personalnummer, gruppe, status, vorname, nachname, geburtsdatum, handy,
           waffenschein, spind, nebenjob, dienstgrad, eintrittsdatum, arbeitsvertrag, ernennungsurkunde,
           urlaub_von, urlaub_bis, urlaub_tage, bemerkung, rsa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (personalnummer) DO UPDATE SET gruppe=EXCLUDED.gruppe, status=EXCLUDED.status,
           vorname=EXCLUDED.vorname, nachname=EXCLUDED.nachname, geburtsdatum=EXCLUDED.geburtsdatum,
           handy=EXCLUDED.handy, waffenschein=EXCLUDED.waffenschein, spind=EXCLUDED.spind,
           nebenjob=EXCLUDED.nebenjob, dienstgrad=EXCLUDED.dienstgrad, eintrittsdatum=EXCLUDED.eintrittsdatum,
           arbeitsvertrag=EXCLUDED.arbeitsvertrag, ernennungsurkunde=EXCLUDED.ernennungsurkunde,
           urlaub_von=EXCLUDED.urlaub_von, urlaub_bis=EXCLUDED.urlaub_bis, urlaub_tage=EXCLUDED.urlaub_tage,
           bemerkung=EXCLUDED.bemerkung, rsa=EXCLUDED.rsa`,
        [p.nr, p.gruppe, p.status, p.vorname, p.nachname, p.geburtsdatum || null, p.handy,
          p.waffenschein, p.spind, p.nebenjob, p.dienstgrad, p.eintrittsdatum || null,
          p.arbeitsvertrag, p.ernennungsurkunde, p.urlaub_von || null, p.urlaub_bis || null,
          p.urlaub_tage, p.bemerkung, p.rsa]);
    }

    /* Sonderfunktionen */
    for (let i = 0; i < daten.funktionsspalten.length; i++) {
      await c.query(
        `INSERT INTO sonderfunktionsspalten (name, sortierung) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET sortierung=EXCLUDED.sortierung`,
        [daten.funktionsspalten[i], i]);
    }
    for (const f of daten.funktionen) {
      await c.query(
        `INSERT INTO sonderfunktionen (personalnummer, leitung, sonstige, werte)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (personalnummer) DO UPDATE SET leitung=EXCLUDED.leitung,
           sonstige=EXCLUDED.sonstige, werte=EXCLUDED.werte`,
        [f.nr, f.leitung, f.sonstige, JSON.stringify(f.werte || {})]);
    }

    /* Kündigungen */
    await c.query('DELETE FROM kuendigungen');
    for (const k of daten.kuendigungen) {
      await c.query(
        `INSERT INTO kuendigungen (personalnummer, vorname, nachname, rang, grund, handy, vertrag, eintritt,
           urkunde, zeugnis, kuendigung, waffe, copnet, emd, ic, discord, dienstgegenstaende, anzeige)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [k.nr, k.vorname, k.nachname, k.rang, k.grund, k.handy, k.vertrag, k.eintritt || null,
          k.urkunde, k.zeugnis, k.kuendigung, k.waffe, k.copnet, k.emd, k.ic, k.discord,
          k.dienstgegenstaende, k.anzeige]);
    }

    /* Disziplin */
    for (let i = 0; i < daten.disziplinSpalten.length; i++) {
      await c.query(
        `INSERT INTO disziplinspalten (name, sortierung) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET sortierung=EXCLUDED.sortierung`,
        [daten.disziplinSpalten[i], i]);
    }
    for (const d of daten.disziplin) {
      await c.query(
        `INSERT INTO disziplin (personalnummer, massnahmen) VALUES ($1,$2)
         ON CONFLICT (personalnummer) DO UPDATE SET massnahmen=EXCLUDED.massnahmen`,
        [d.nr, JSON.stringify(d.massnahmen || [])]);
    }

    /* Richtlinie */
    await c.query('DELETE FROM richtlinie');
    for (let i = 0; i < daten.richtlinie.zeilen.length; i++) {
      const r = daten.richtlinie.zeilen[i];
      await c.query(
        `INSERT INTO richtlinie (stand, pdv, text_kurz, mild, hart, sonst, anmerkung, sortierung)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [daten.richtlinie.stand, r.pdv, r.text, r.mild, r.hart, r.sonst, r.anmerkung, i]);
    }

    /* Checklisten */
    for (let i = 0; i < daten.checklisten.length; i++) {
      const l = daten.checklisten[i];
      await c.query(
        `INSERT INTO checklisten (name, aufgaben, sortierung) VALUES ($1,$2,$3)
         ON CONFLICT (name) DO UPDATE SET aufgaben=EXCLUDED.aufgaben, sortierung=EXCLUDED.sortierung`,
        [l.name, JSON.stringify(l.aufgaben), i]);
    }

    /* Dashboard */
    await c.query('DELETE FROM dashboard');
    let ds = 0;
    for (const p of daten.dashboard.personal) {
      await c.query(`INSERT INTO dashboard (art, text, anzahl, sortierung) VALUES ('personal',$1,$2,$3)`,
        [p.label, p.anzahl, ds++]);
    }
    for (const [art, liste] of [['vorlage', daten.dashboard.vorlagen], ['info', daten.dashboard.info], ['link', daten.dashboard.links]]) {
      for (const t of liste) {
        const m = /^(.+?)\s*⇒\s*(https?:\S+)$/.exec(t) || /^(.*?)\s+(https?:\S+)$/.exec(t);
        await c.query(`INSERT INTO dashboard (art, text, url, sortierung) VALUES ($1,$2,$3,$4)`,
          [art, m ? m[1].trim() : t, m ? m[2] : null, ds++]);
      }
    }

    /* Routine */
    await c.query('DELETE FROM routine');
    await c.query(`INSERT INTO routine (tage, personen, sortierung) VALUES ($1,$2,0)`,
      [JSON.stringify(daten.routine.tage), JSON.stringify(daten.routine.personen)]);

    /* Sonderzahlungen */
    await c.query('DELETE FROM sonderzahlungen');
    for (const s of daten.sonderzahlungen) {
      await c.query(
        `INSERT INTO sonderzahlungen (personalnummer, vorname, nachname, rang, erhalten, datum, betrag, grund)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.nr, s.vorname, s.nachname, s.rang, s.erhalten, s.datum || null, s.betrag, s.grund]);
    }

    /* Organigramm */
    await c.query('DELETE FROM organigramm');
    for (let i = 0; i < daten.organigramm.length; i++) {
      await c.query(`INSERT INTO organigramm (zeile, sortierung) VALUES ($1,$2)`,
        [JSON.stringify(daten.organigramm[i]), i]);
    }

    /* 24er-Routinen (Anwesenheit mit Sonderzahlungsvermerk) */
    await c.query('DELETE FROM daten24');
    for (const t of daten.daten24) {
      await c.query(
        `INSERT INTO daten24 (personalnummer, vorname, nachname, anwesend, durchgezogen, sonderzahlung, top5, gesamt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [t.nr, t.vorname, t.nachname, t.anwesend, t.durchgezogen, t.sonderzahlung, t.top5, t.gesamt]);
    }

    /* Sportliche Tauglichkeit */
    await c.query('DELETE FROM sport');
    for (const s of daten.sport) {
      await c.query(
        `INSERT INTO sport (vorname, nachname, personalnummer, geprueft)
         VALUES ($1,$2,$3,$4)`,
        [s.vorname, s.nachname, s.nr, s.geprueft]);
    }

    /* Beförderungsliste */
    await c.query('DELETE FROM befoerderungen');
    for (const b of daten.befoerderungen) {
      await c.query(
        `INSERT INTO befoerderungen (personalnummer, vorname, nachname, rang, neu_rang, grund, am, por, erl)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [b.nr, b.vorname, b.nachname, b.rang, b.neu_rang, b.grund, b.am || null, b.por, b.erl]);
    }

    await c.query('COMMIT');
    console.log('Import abgeschlossen.');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await db.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
