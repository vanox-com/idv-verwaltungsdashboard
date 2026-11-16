// Analytics use current personnel only when identity AND employment dates match.
// Reallocated numbers are resolved against immutable reallocation snapshots.
const iso=value=>value instanceof Date?value.toISOString().slice(0,10):String(value??'').slice(0,10);
const name=value=>String(value??'').trim().toLocaleLowerCase('de-DE');
const identityMatches=(event,person)=>person&&name(event.vorname)===name(person.vorname)&&name(event.nachname)===name(person.nachname);
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'));

export function buildPromotionStats(events,people,reallocations,now=new Date()){
 const current=new Map(people.map(p=>[Number(p.personalnummer),p]));
 const archive=new Map();
 for(const history of reallocations){
  const entries=history.folgedaten?.befoerderungen;
  if(!Array.isArray(entries))continue;
  for(const ev of entries)if(ev?.id!=null)archive.set(Number(ev.id),{
   person:history.vorher,key:'archiv:'+history.id
  });
 }
 const today=iso(now),yearAgo=new Date(now);
 yearAgo.setUTCFullYear(yearAgo.getUTCFullYear()-1);
 const boundary=iso(yearAgo);
 const valid=[];let excluded=0,recent=0;
 for(const ev of events){
  const date=iso(ev.am),rank=String(ev.rang||'').trim(),next=String(ev.neu_rang||'').trim();
  const old=archive.get(Number(ev.id));
  let person=old?old.person:current.get(Number(ev.personalnummer));
  let key=old?old.key:'aktuell:'+ev.personalnummer;
  if(!old&&(!identityMatches(ev,person)||iso(person?.eintrittsdatum)>date)){
   person=null;key='';
  }
  const joined=iso(person?.eintrittsdatum);
  if(!identityMatches(ev,person)||!validDate(date)||!validDate(joined)||date<joined||date>today||!rank||!next||rank===next){excluded++;continue;}
  const tage=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(joined+'T00:00:00Z'))/86400000);
  valid.push({person_key:key,rang:rank,neu_rang:next,tage,am:date});
  if(date>=boundary)recent++;
 }
 valid.sort((a,b)=>a.am.localeCompare(b.am));
 return {befoerderungen:valid,befoerderungen12m:recent,
  datenqualitaet:{gesamt:events.length,zugeordnet:valid.length,nicht_zugeordnet:excluded}};
}
