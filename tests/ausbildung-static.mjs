import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const pages=['public/index.html','public/ausbildung.html','public/ausbildung-status.html','public/aulk.html'];
for(const file of pages){
 const source=readFileSync(file,'utf8');
 const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
 if(!scripts.length)throw Error(file+': no inline script');
 for(const script of scripts)new Script(script,{filename:file});
 console.log(file+': inline JavaScript parses ('+scripts.length+' scripts)');
}
const embedded=readFileSync('public/assets/ausbildung-panel.js','utf8');
new Script(embedded,{filename:'ausbildung-panel.js'});
const index=readFileSync('public/index.html','utf8');
if(!index.includes("window.IDVAusbildung.laden($('#inhalt'),AUSB_NAV[tab]"))
 throw Error('Native Ausbildung module missing from existing dashboard');
if(!index.includes('/assets/ausbildung-panel.js'))
 throw Error('Embedded module script not loaded by police panel');
if(index.includes("location.assign('/ausbildung.html')"))
 throw Error('Training must stay in the normal dashboard without redirects');
const navigation=index.slice(index.indexOf('const NAV_GRUPPEN'),index.indexOf('const NAV_OFFEN'));
if(navigation.indexOf("id:'ausbildung'")<0 || navigation.indexOf("id:'verwaltung'")<0 || navigation.indexOf("id:'ausbildung'")>=navigation.indexOf("id:'verwaltung'"))
 throw Error('Ausbildung must appear above Administration in the main navigation');
if(embedded.includes('Zum Login</a>'))throw Error('Training database failure must not redirect to Login');
if(!embedded.includes('setup-status')||!embedded.includes('setup-schema'))
 throw Error('Administrator backup-gated database recovery missing from Ausbildung UI');
if(!embedded.includes('!setup.personalbindungBereit') ||
   !embedded.includes('Ausbildungs-Erweiterung einrichten') ||
   !embedded.includes('Administration → Backup-Übersicht'))
 throw Error('A finished training schema with only missing personnel binding must offer a backup-gated repair instead of a generic error');
if(!embedded.includes('attachShadow')||!embedded.includes('public-material'))
 throw Error('Native isolated module or public document approval control missing');
const old=readFileSync('public/ausbildung.html','utf8');
if(!old.includes('/#ausbildung'))throw Error('Legacy training bookmark must redirect into normal panel');
const aulk=readFileSync('public/aulk.html','utf8');
if(!aulk.includes('/api/ausbildung-oeffentlich'))throw Error('Public AuLK catalog must load only approved materials');
if(!aulk.includes('group.personen') ||
   !aulk.includes('person.module') ||
   !aulk.includes('person.stimmenAnzahl') ||
   !aulk.includes('person.zurPruefungZugelassen'))
 throw Error('Public AuLK must show each candidate and all module statuses, aggregate vote count only (no public points), admission status');
if(aulk.includes('nur zusammengefasste Ausbildungszahlen angezeigt') || aulk.includes('person.stimmenPunkte'))
 throw Error('Outdated anonymous-only public monitor statement');
const roomScript=readFileSync('public/assets/unterricht-raum.js','utf8');
new Script(roomScript,{filename:'unterricht-raum.js'});
const classroom=readFileSync('public/unterricht.html','utf8');
if(!classroom.includes('id="overlay"') || !classroom.includes('id="stream"') ||
   !classroom.includes('data-tool="laser"') || !classroom.includes('data-tool="pfeil"') ||
   !classroom.includes('id="teilen"'))
  throw Error('Classroom screen sharing / laser / annotations missing');
if(!embedded.includes("data-action=\"start-lesson\"") ||
   !embedded.includes("materialien/import") ||
   !embedded.includes("location.assign('/unterricht.html?raum='"))
  throw Error('Training module missing linked Google presentations, import or classroom launcher');
// Datenschutz: NEVER send an unrestricted desktop or another browser tab.
// Region Capture is mandatory and the crop must finish BEFORE pc.addTrack().
if(!roomScript.includes('CropTarget.fromElement($("tafel"))') ||
   !roomScript.includes('await video.cropTo(await CropTarget.fromElement($("tafel")))') ||
   !roomScript.includes('await cropOwnBoard(display)') ||
   !roomScript.includes('peer.addTrack(video,display)') ||
   !roomScript.includes('getDisplayMedia(') ||
   !roomScript.includes('preferCurrentTab:true') ||
   !roomScript.includes('surfaceSwitching:"exclude"'))
 throw Error('Classroom must crop exclusively to the presentation DOM element before WebRTC can send frames');
if(roomScript.indexOf('await cropOwnBoard(display)')>roomScript.indexOf('peer.addTrack(video,display)'))
 throw Error('Uncropped screen could be transmitted before Region Capture has completed');
if(!roomScript.includes('setCaptureHandleConfig') ||
   !roomScript.includes('getCaptureHandle()') ||
   !roomScript.includes('captured.handle!==captureHandle'))
 throw Error('Capture Handle should fail closed for a wrong selected tab');
if(!classroom.includes('id="aktualisieren"') ||
   !roomScript.includes('fresh.searchParams.set("idv_reload"') ||
   !classroom.includes('id="sendestatus"'))
 throw Error('Google Slides reload and simplified teaching-status UI missing');
if(classroom.includes('body.presentation-locked{height:100dvh') ||
   !classroom.includes('body.presentation-locked #tafel{') ||
   !classroom.includes('body.presentation-locked .workspace-main{position:sticky') ||
   !classroom.includes('class="board-tools"'))
 throw Error('The 16:9 board must stay pinned, with accessible moderation tools and no document scroll lock');
if(!roomScript.includes('document.body.classList.add("presentation-locked")') ||
   !roomScript.includes('document.body.classList.remove("presentation-locked")') ||
   !roomScript.includes('pinPresentation();') ||
   !roomScript.includes('unpinPresentation();'))
 throw Error('Pinned presentation mode must activate on sharing and reset when stream ends');
if(roomScript.indexOf('pinPresentation();')>roomScript.indexOf('display=await navigator.mediaDevices.getDisplayMedia(') ||
   roomScript.indexOf('await cropOwnBoard(display)')>roomScript.indexOf('peer.addTrack(video,display)'))
 throw Error('The capture must be pinned and cropped before its first WebRTC transmission');
if(!roomScript.includes('video.contentHint="detail"') ||
   !roomScript.includes('maxBitrate=12000000') ||
   !roomScript.includes('scaleResolutionDownBy=1') ||
   !roomScript.includes('degradationPreference="maintain-resolution"') ||
   !roomScript.includes('frameRate:{ideal:15,max:15}'))
 throw Error('Slide stream needs text-focused quality, consistent aspect ratio and bounded 15fps');

if(!embedded.includes('<th>Erstellt von</th>') || !embedded.includes("esc(r.erstellt_von||'Unbekannter Ausbilder')"))
 throw Error('Classroom dashboard must display the recorded creator of each room');
const signaling=readFileSync('php/AusbildungUnterricht.php','utf8');
if(!signaling.includes("einladung_hash") || !signaling.includes("teilnehmer_hash") ||
   !signaling.includes("ausbilder_user_id") || !signaling.includes("unterrichtGastRaum"))
  throw Error('Lesson signaling must validate hashed invitation, learner seat and presenter');
const migration=readFileSync('scripts/mysql/2026-11-24-ausbildung-unterricht.sql','utf8');
if(!migration.includes('CREATE TABLE IF NOT EXISTS ausbildung_unterricht'))
  throw Error('Additive lesson migration missing');

console.log('Ausbildung native integration, no extra admin page and public AuLK catalog: OK');

for(const key of ['ausbildung-pma','ausbildung-pka','ausbildung-kka','ausbildung-ausbilder','ausbildung-materialien','ausbildung-unterricht']){
 if(!navigation.includes("'"+key+"'"))throw Error('Missing sidebar item '+key);
}
if(!embedded.includes('allowedRoute')||!embedded.includes("['ausbilder','materialien'].includes(next)")||!index.includes("m==='dash'||m==='design'"))
 throw Error('Training administration visibility and personal design access must be role-aware');
