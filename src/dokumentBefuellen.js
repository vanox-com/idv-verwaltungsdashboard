import JSZip from 'jszip';
import {VORLAGEN} from './dokumentVorlagen.js';

const escapeXml = s => String(s).replace(/[&<>"']/g, ch => ({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
})[ch]);
const german = d => String(d).slice(8,10)+'.'+String(d).slice(5,7)+'.'+String(d).slice(0,4);
const replacement = (xml,pattern,values,mandatory=false) => {
 const key=escapeXml(pattern),occurrences=xml.split(key).length-1;
 if(mandatory&&occurrences!==values.length)
  throw new Error('Vorlage geändert: '+pattern+' ('+occurrences+' statt '+values.length+')');
 if(!occurrences)return xml;
 if(values.length===1)values=Array(occurrences).fill(values[0]);
 if(occurrences!==values.length)throw new Error('Vorlage: '+pattern+' ist nicht eindeutig');
 for(const value of values)xml=xml.replace(key,escapeXml(value));
 return xml;
};
/* Nur das polizeiliche Unterschriftenfeld als ausgeschriebenen Namen befüllen.
   Die Namenswiedergabe ersetzt keine rechtsverbindliche elektronische Signatur.
   Arbeitnehmer/Praktikanten unterschreiben weiterhin selbst. */
function fillPoliceSignature(xml,typ,fullName){
 const name=String(fullName||'').trim();
 if(name.split(/\s+/).length<2||name.length>160)
  throw new Error('Vollständiger Name des angemeldeten Dokumentenerstellers fehlt');
 const encoded=escapeXml(name);
 const marker='&lt;Unterschrift&gt;';
 if(['hauptvertrag','pmavertrag','nebenvertrag'].includes(typ)){
  const count=xml.split(marker).length-1;
  if(count!==2)throw new Error('Arbeitsvertragsvorlage: zwei Unterschriftenfelder erwartet, gefunden: '+count);
  let seen=0;
  return xml.replace(/&lt;Unterschrift&gt;/g,match=>++seen===2?encoded:match);
 }
 if(typ==='praktikum'){
  // Nur Absätze, deren sichtbarer Inhalt EXAKT "Unterschrift" lautet:
  // 1. Praktikant (bleibt), 2. betreuende Dienstkraft (wird befüllt).
  let found=0,changed=0;
  const output=xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,paragraph=>{
   const text=[...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(m=>m[1]).join('');
   if(text!=='Unterschrift')return paragraph;
   found++;
   if(found!==2)return paragraph;
   const updated=paragraph.replace(
    /(<w:t(?:\s[^>]*)?>)Unterschrift(<\/w:t>)/,
    (_,open,close)=>open+encoded+close
   );
   if(updated!==paragraph)changed++;
   return updated;
  });
  if(found!==2||changed!==1)
   throw new Error('Praktikumsvertrag: Unterschriftszeilen nicht eindeutig ('+found+')');
  return output;
 }
 const count=xml.split(marker).length-1;
 if(count!==1)throw new Error('Polizeiliches Unterschriftenfeld nicht eindeutig ('+count+')');
 return xml.replace(marker,encoded);
}

function fill(xml,typ,person,f){
 const name=String(person.vorname),last=String(person.nachname);
 const signer=f.unterzeichner.trim().split(/\s+/),first=signer.shift(),signLast=signer.join(' ');
 const counts={
  abmahnung:[[first,name,first],[signLast,last,signLast]],
  fristgerecht:[[first,name,first],[signLast,last,last,signLast]],
  fristlos:[[first,name,first],[signLast,last,last,signLast]],
  hauptvertrag:[[name,name,first],[last,last,signLast]],
  pmavertrag:[[name,name,first],[last,last,signLast]],
  nebenvertrag:[[name,name,first],[last,last,signLast]],
  praktikum:[[first,name,first],[signLast,last,signLast,last]],
  praktikumsbestaetigung:[[first,name,first],[signLast,last,last,signLast]],
  nebenjob:[[first,name,first],[signLast,last,last,signLast]]
 }[typ];
 if(!counts)throw new Error('Unbekannte Vorlage');
 xml=replacement(xml,'<Vorname>',counts[0],true);
 xml=replacement(xml,'<Name>',counts[1],true);
 for(const [marker,val] of [
  ['<Dienstgrad>',f.rang],['<Rang>',f.rang],
  ['<Herr / Frau>',f.anrede],['<Herr/Frau>',f.anrede],
  ['<Straße>',f.strasse||'—'],['<Haus-Nr.>',f.hausnummer||'—'],
  ['<Geburtsdatum>',german(person.geburtsdatum)],
  ['<Wohnhaft>',f.wohnort||'—'],
  ['<Vodasdasdrname>',name],
  ['<Uhrzeit Start>',f.uhrzeit_von||'—'],['<Uhrzeit Ende>',f.uhrzeit_bis||'—'],
  ['<Datum>',german(typ==='fristgerecht'?f.enddatum:typ==='praktikumsbestaetigung'?f.praktikumsdatum:f.datum)]
 ])xml=replacement(xml,marker,[val]);
 if(typ==='abmahnung'){
  xml=replacement(xml,'<1., 2., 3.>',[String(f.stufe)],true);
  xml=replacement(xml,'< evtl. genaue Beschreibung >',[f.paragraphen+' – '+f.sachverhalt],true);
 }
 xml=fillPoliceSignature(xml,typ,f.unterzeichner);
 if(typ==='hauptvertrag')xml=xml.replace('XX',escapeXml(f.probezeit));
 if(typ==='nebenvertrag'){
  xml=xml.replace('XXX',escapeXml(f.taetigkeit)).replace('XXX',escapeXml(f.arbeitgeber));
 }
 if(typ==='nebenjob')xml=xml.replace('bei xx','bei '+escapeXml(f.arbeitgeber));
 if(typ==='fristlos')xml=xml.replace('Kündigungsgrund:', 'Kündigungsgrund: '+escapeXml(f.begruendung));
 if(typ.endsWith('vertrag')){
  xml=xml.replace('Das Arbeitsverhältnis beginnt am ','Das Arbeitsverhältnis beginnt am '+escapeXml(german(f.beginn))+' ');
 }
 if(typ==='praktikum')xml=xml.replace('Ort, Datum: Frankfurt den ','Ort, Datum: Frankfurt den '+escapeXml(german(f.datum))+' ');
 if(['abmahnung','fristgerecht','fristlos','nebenjob','praktikumsbestaetigung','praktikum'].includes(typ)){
  xml=xml.replace('Datum:', 'Datum: '+escapeXml(german(f.datum))+' ');
  xml=xml.replace('2026-10-27',escapeXml(f.datum));
 }
 return xml;
}
export async function befuellen(typ,person,f){
 const config=VORLAGEN[typ];if(!config)throw new Error('Vorlage nicht gefunden');
 const url='https://docs.google.com/document/d/'+config.id+'/export?format=docx';
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('Originalvorlage nicht abrufbar (HTTP '+response.status+')');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<1000||bytes.length>6000000||bytes[0]!==80||bytes[1]!==75)
  throw new Error('Vorlage ist keine gültige Word-Datei');
 const zip=await JSZip.loadAsync(bytes),doc=zip.file('word/document.xml');
 if(!doc)throw new Error('Word-Inhalt in Vorlage fehlt');
 zip.file('word/document.xml',fill(await doc.async('string'),typ,person,f));
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
