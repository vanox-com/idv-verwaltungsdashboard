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
import {readinessErrors,executionErrors} from './cutover-policy.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const gates=JSON.parse(await readFile(path.join(here,'cutover-readiness.json'),'utf8'));
const pending=readinessErrors(gates);
const execute=process.argv.includes('--execute');
console.log('IDV / PHP-MySQL8 Anbieterwechsel:',execute?'FINALER DATENTRANSFER':'FREIGABEPRÜFUNG');
console.log('Quelländerungen:', 'NIEMALS durch dieses Skript; PostgreSQL bleibt read-only');
console.log('Offene Freigabepunkte:',pending.length?pending.join(', '):'keine');
if(!execute){
 console.log('Prüfmodus: Es wurden keine Daten kopiert und keine Server umgeschaltet.');
 process.exitCode=pending.length?2:0;
}else{
 if(pending.length)throw Error('CUTOVER GESPERRT. Zuerst vollständige Funktionsgleichheit und alle Freigabepunkte herstellen.');
 const validation=executionErrors(process.env);
 if(validation.length){
  for(const reason of validation)console.error('START GESPERRT:',reason);
  throw Error('Finale Voraussetzungen unvollständig – es wurden keine Daten geschrieben.');
 }
 console.log('Finale Bestätigungen vorhanden (Backup, Schreibstopp, Rückfallplan und Zielidentität).');
 console.log('Die Bestätigungen ersetzen keine technische Schreibsperre des alten Portals.');
 const steps=[
  ['Schema-Preflight','prepare.mjs'],
  ['MySQL-8-Schema in NEUER LEERER Datenbank aufbauen','install-schema.mjs'],
  ['Kopieren in vollständig leere MySQL-Zieltabellen','copy.mjs'],
  ['Quell-/Zielinhalt prüfen','verify.mjs']
 ];
 for(const [name,filename] of steps){
  console.log('\n== '+name+' ==');
  const run=spawnSync(process.execPath,[path.join(here,filename)],{stdio:'inherit',env:process.env});
  if(run.error||run.status!==0)throw Error(name+' fehlgeschlagen. KEINE DNS-UMSCHALTUNG. Bitte Fehler prüfen und ggf. neue leere Zieldatenbank bereitstellen.');
 }
 console.log('Der Datenimport und Datenvergleich waren erfolgreich.');
 console.log('STOPP: Noch keine DNS-Umschaltung! Erst PHP-Anwendung auf dem importierten Datenstand endgültig abnehmen.');
 console.log('Quell-PostgreSQL und das geprüfte Restore-Backup unverändert behalten.');
 console.log('Alte PostgreSQL-Datenbank und Backups aufbewahren – nach ersten MySQL-Schreibvorgängen KEIN blindes DNS-Rollback.');
}
