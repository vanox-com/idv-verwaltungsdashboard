const dateText = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value ?? '').slice(0,10);
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) &&
  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const lower = value => String(value ?? '').trim().toLocaleLowerCase('de-DE');

export function buildPersonnelMovementStats(people, reallocations, terminations, now=new Date()) {
  const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-11,1));
  const months=Array.from({length:12},(_,i)=>{
    const d=new Date(Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth()+i,1));
    return {monat:d.toISOString().slice(0,7),zugang:0,abgang:0};
  });
  const byMonth=new Map(months.map(x=>[x.monat,x]));
  const today=now.toISOString().slice(0,10);
  const allPeople=[...people,...reallocations.map(x=>x.vorher).filter(x=>x && typeof x==='object')];
  let entriesWithoutDate=0, exitsWithoutDate=0,withdrawn=0;
  for(const p of allPeople){
    const entry=dateText(p.eintrittsdatum);
    if(!day(entry)||entry>today){entriesWithoutDate++;continue;}
    const m=byMonth.get(entry.slice(0,7));if(m)m.zugang++;
  }
  const used=new Set();
  for(const record of terminations){
    const snapshot=record.personal_snapshot && typeof record.personal_snapshot==='object' ? record.personal_snapshot : {};
    if(snapshot.ruecknahme){withdrawn++;continue;}
    const date=dateText(record.kuendigungsdatum);
    if(!day(date)||date>today){exitsWithoutDate++;continue;}
    const unique=[record.personalnummer,lower(record.vorname),lower(record.nachname),dateText(record.eintritt),date].join('|');
    if(used.has(unique))continue;
    used.add(unique);
    const m=byMonth.get(date.slice(0,7));if(m)m.abgang++;
  }
  const totals=months.reduce((a,m)=>({zugang:a.zugang+m.zugang,abgang:a.abgang+m.abgang}),{zugang:0,abgang:0});
  return {personalbewegung:months,bewegung12m:{...totals,saldo:totals.zugang-totals.abgang},
    bewegung_datenqualitaet:{eintritte_ohne_datum:entriesWithoutDate,kuendigungen_ohne_datum:exitsWithoutDate,zurueckgenommen:withdrawn}};
}
