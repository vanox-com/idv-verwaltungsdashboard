/* Amtsseid und Ernennung sind getrennte Ereignisse. Der Amtseid kann
   vor, am oder nach dem Beförderungstag abgelegt werden. Eine feste
   Reihenfolge ist fachlich nicht zwingend und darf die Urkunde nicht sperren. */
export function zertDatum(d){
 return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)
  &&!Number.isNaN(Date.parse(d+'T00:00:00Z'))
  &&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
}
export function pruefeUrkundenDaten({eid,ernannt,geburt,heute=new Date().toISOString().slice(0,10)}){
 if(!zertDatum(eid))return 'Amtseid-Datum ungültig. Bitte JJJJ-MM-TT angeben.';
 if(!zertDatum(ernannt))return 'Ernennungsdatum in der Personalakte ungültig.';
 if(!zertDatum(geburt))return 'Geburtsdatum in der Personalakte ungültig.';
 if(!zertDatum(heute))throw new Error('Ungültiger Referenztag für die Urkundenprüfung');
 if(eid>heute)return 'Das Datum des geleisteten Amtseids darf nicht in der Zukunft liegen.';
 if(ernannt>heute)return 'Das Ernennungsdatum darf nicht in der Zukunft liegen.';
 if(eid<=geburt||ernannt<=geburt)
  return 'Amtseid- oder Ernennungsdatum liegt vor dem Geburtsdatum.';
 return null;
}
