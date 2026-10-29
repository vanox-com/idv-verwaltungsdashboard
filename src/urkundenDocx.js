import JSZip from 'jszip';

const escapeXml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const deDate=iso=>iso.slice(8,10)+'.'+iso.slice(5,7)+'.'+iso.slice(0,4);

/** Replaces placeholders inside the exact original DOCX, preserving images and formatting. */
export async function fillCertificateDocx({templateId,person,oathDate,appointmentDate}){
 const url='https://docs.google.com/document/d/'+encodeURIComponent(templateId)+'/export?format=docx';
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('Urkundenvorlage ist nicht als Word-Datei abrufbar (HTTP '+response.status+').');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<1000||bytes.length>4000000||bytes[0]!==80||bytes[1]!==75)
  throw new Error('Die Originalvorlage wurde nicht als gültige Word-Datei geliefert.');
 const archive=await JSZip.loadAsync(bytes);
 const doc=archive.file('word/document.xml');
 if(!doc)throw new Error('Originalvorlage: Word-Inhalt fehlt.');
 let xml=await doc.async('string');
 const replaces=[
  ['&lt;Vorname&gt;',String(person.vorname||'').trim()],
  ['&lt;Name&gt;',String(person.nachname||'').trim()],
  ['&lt;Geburtsdatum&gt;',deDate(person.geburtsdatum)]
 ];
 for(const [marker,val] of replaces){
  if(!val||xml.split(marker).length!==2)throw new Error('Urkunden-Platzhalter fehlt: '+marker);
  xml=xml.replace(marker,escapeXml(val));
 }
 if(xml.split('&lt;Datum&gt;').length!==3)
  throw new Error('Die Vorlage muss zwei Datums-Platzhalter enthalten.');
 xml=xml.replace('&lt;Datum&gt;',escapeXml(deDate(oathDate)))
        .replace('&lt;Datum&gt;',escapeXml(deDate(appointmentDate)));
 archive.file('word/document.xml',xml);
 return archive.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
}
