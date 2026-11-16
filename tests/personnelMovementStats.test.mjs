import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonnelMovementStats} from '../src/personnelMovementStats.js';

test('counts former employee and new DN holder as separate entries',()=>{
 const now=new Date('2026-11-16T00:00:00Z');
 const people=[{personalnummer:37,eintrittsdatum:'2026-10-01'}];
 const history=[{vorher:{personalnummer:37,eintrittsdatum:'2026-04-01'}}];
 const exits=[{personalnummer:37,vorname:'Alt',nachname:'Person',eintritt:'2026-04-01',kuendigungsdatum:'2026-09-01',personal_snapshot:{}}];
 const result=buildPersonnelMovementStats(people,history,exits,now);
 assert.deepEqual(result.bewegung12m,{zugang:2,abgang:1,saldo:1});
 assert.equal(result.kuendigungsdienstzeit.anzahl,1);
 assert.equal(result.kuendigungsdienstzeit.durchschnitt_tage,153);
});

test('excludes withdrawal, duplicates and missing dates from exit figures',()=>{
 const base={personalnummer:12,vorname:'Test',nachname:'Mann',eintritt:'2026-01-01',kuendigungsdatum:'2026-08-20'};
 const result=buildPersonnelMovementStats([],[],[
  {...base,personal_snapshot:{}},{...base,personal_snapshot:{}},
  {...base,personal_snapshot:{ruecknahme:{am:'2026-08-21'}}},
  {...base,kuendigungsdatum:null,personal_snapshot:{}}
 ],new Date('2026-11-16T00:00:00Z'));
 assert.equal(result.bewegung12m.abgang,1);
 assert.equal(result.bewegung_datenqualitaet.zurueckgenommen,1);
 assert.equal(result.bewegung_datenqualitaet.kuendigungen_ohne_datum,1);
 assert.equal(result.kuendigungsdienstzeit.anzahl,1);
 assert.equal(result.kuendigungsdienstzeit.median_tage,231);
});

test('does not infer a duration when the departure lacks an entry date',()=>{
 const x=buildPersonnelMovementStats([],[],[
  {personalnummer:5,vorname:'Max',nachname:'Muster',eintritt:null,kuendigungsdatum:'2026-10-01'}
 ],new Date('2026-11-16T00:00:00Z'));
 assert.equal(x.bewegung12m.abgang,1);
 assert.equal(x.kuendigungsdienstzeit.anzahl,0);
 assert.equal(x.bewegung_datenqualitaet.kuendigungen_ohne_eintritt,1);
});
