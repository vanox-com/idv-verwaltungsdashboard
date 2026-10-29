import {randomBytes} from 'node:crypto';
export function validDate(s){
 return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)
  &&!Number.isNaN(Date.parse(s+'T00:00:00Z'))
  &&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
export function originOk(req){
 const origin=req.get('origin'),host=req.get('x-forwarded-host')||req.get('host');
 try{const parsed=new URL(origin);
  return parsed.origin===origin&&parsed.protocol==='https:'&&parsed.host===host&&
   req.get('X-Requested-With')==='XMLHttpRequest';
 }catch{return false;}
}
export async function googleCodeToken(code,origin,config){
 const response=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({code,client_id:config.id,client_secret:config.secret,
   grant_type:'authorization_code',redirect_uri:origin}),
  signal:AbortSignal.timeout(20000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.access_token)
  throw Object.assign(new Error('Google-Anmeldung fehlgeschlagen. Bitte erneut auswählen.'),{httpStatus:401});
 return result.access_token;
}
export async function googleDocsUpload(token,title,bytes){
 const boundary='idv_document_'+randomBytes(10).toString('hex');
 const body=Buffer.concat([
  Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
   JSON.stringify({name:title,mimeType:'application/vnd.google-apps.document'})+
   '\r\n--'+boundary+'\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n'),
  bytes,Buffer.from('\r\n--'+boundary+'--\r\n')
 ]);
 const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,mimeType',{
  method:'POST',headers:{Authorization:'Bearer '+token,
   'Content-Type':'multipart/related; boundary='+boundary},
  body,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('Google Drive hat die Speicherung abgelehnt (HTTP '+response.status+')');
 const file=await response.json();
 if(!file.id||file.mimeType!=='application/vnd.google-apps.document')
  throw new Error('Kein bearbeitbares Google-Dokument erstellt');
 return file.id;
}
export async function deleteGoogleDoc(token,id){
 try{const res=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id),{
  method:'DELETE',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!res.ok)console.error('Dokument-Bereinigung Google HTTP',res.status);
 }catch(e){console.error('Dokument-Bereinigung:',e.message);}
}
