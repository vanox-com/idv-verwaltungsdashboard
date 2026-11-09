import test from 'node:test';
import assert from 'node:assert/strict';
import {zertDatum,pruefeUrkundenDaten} from '../src/urkundenDatum.js';
const common={geburt:'1999-12-01',ernannt:'2026-11-08',heute:'2026-11-09'};
test('Amtseid am Tag nach der Ernennung ist gültig',()=>{
 assert.equal(pruefeUrkundenDaten({...common,eid:'2026-11-09'}),null);
});
test('Amtseid am Ernennungstag ist gültig',()=>{
 assert.equal(pruefeUrkundenDaten({...common,eid:'2026-11-08'}),null);
});
test('Amtseid vor Ernennung ist gültig, wenn bereits geleistet',()=>{
 assert.equal(pruefeUrkundenDaten({...common,eid:'2026-10-15'}),null);
});
test('Amtseid in der Zukunft wird abgelehnt',()=>{
 assert.match(pruefeUrkundenDaten({...common,eid:'2026-11-10'}),/Zukunft/);
});
test('Ernennung in der Zukunft wird abgelehnt',()=>{
 assert.match(pruefeUrkundenDaten({...common,eid:'2026-11-08',ernannt:'2026-11-10'}),/Zukunft/);
});
test('Geburtsdatum und unmögliche Kalendertage werden geprüft',()=>{
 assert.equal(zertDatum('2026-02-30'),false);
 assert.match(pruefeUrkundenDaten({...common,eid:'2026-02-30'}),/ungültig/);
 assert.match(pruefeUrkundenDaten({...common,eid:'1999-11-30'}),/Geburtsdatum/);
});
test('Urkundendaten bleiben bei alten Beförderungen gültig',()=>{
 assert.equal(pruefeUrkundenDaten({geburt:'1993-05-20',ernannt:'2026-11-04',eid:'2026-11-05',heute:'2026-11-09'}),null);
});
