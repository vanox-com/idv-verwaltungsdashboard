/* Controlled IDV data cutover orchestration (run on an authorized workstation).
 * This script never edits the PostgreSQL source or changes DNS.
 * It refuses writes until all release gates have been approved.
 *
 * npm run mysql:cutover:check  # status only, no writes
 * npm run mysql:cutover        # after approval, old portal write freeze
 */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const gates=JSON.parse(await readFile(path.join(here,'cutover-readiness.json'),'utf8'));
const pending=Object.entries(gates.releases).filter(([,v])=>v!==true).map(([k])=>k);
const execute=process.argv.includes('--execute');
console.log('IDV / PHP-MySQL8 Anbieterwechsel:',execute?'FINALER DATENTRANSFER':'FREIGABEPRÜFUNG');
console.log('Quelländerungen:', 'NIEMALS durch dieses Skript; PostgreSQL bleibt read-only');
console.log('Offene Freigabepunkte:',pending.length?pending.join(', '):'keine');
if(!execute){
 console.log('Prüfmodus: Es wurden keine Daten kopiert und keine Server umgeschaltet.');
 process.exitCode=pending.length?2:0;
}else{
 if(pending.length)throw Error('CUTOVER GESPERRT. Zuerst vollständige Funktionsgleichheit und alle Freigabepunkte herstellen.');
 const expected={
  IDV_WRITES_STOPPED:'YES',
  IDV_CUTOVER_CONFIRMED:'I_AUTHORIZE_DATA_MIGRATION',
  MYSQL_COPY_CONFIRM:'EMPTY_NEW_DATABASE'
 };
 for(const [name,value] of Object.entries(expected))
  if(process.env[name]!==value)throw Error('Abbruch: '+name+' wurde nicht explizit bestätigt');
 for(const key of ['SOURCE_DATABASE_URL','MYSQL_DESTINATION_URL'])
  if(!process.env[key])throw Error('Abbruch: geschütztes Environment '+key+' fehlt');
 const steps=[
  ['Schema-Preflight','prepare.mjs'],
  ['Kopieren in vollständig leere MySQL-Zieltabellen','copy.mjs'],
  ['Quell-/Zielinhalt prüfen','verify.mjs']
 ];
 for(const [name,filename] of steps){
  console.log('\n== '+name+' ==');
  const run=spawnSync(process.execPath,[path.join(here,filename)],{stdio:'inherit',env:process.env});
  if(run.error||run.status!==0)throw Error(name+' fehlgeschlagen. KEINE DNS-UMSCHALTUNG. Bitte Fehler prüfen und ggf. neue leere Zieldatenbank bereitstellen.');
 }
 console.log('Der Datenimport und Datenvergleich waren erfolgreich.');
 console.log('Noch nicht erledigt: PHP-Anwendung und alle Berechtigungen auf finalen Daten testen, SSL und DNS bewusst umstellen.');
 console.log('Alte PostgreSQL-Datenbank und Backups aufbewahren – nach ersten MySQL-Schreibvorgängen KEIN blindes DNS-Rollback.');
}
