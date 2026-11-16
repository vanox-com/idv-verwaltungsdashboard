import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPromotionStats} from '../src/personnelPromotionStats.js';

test('keeps an archived promotion with its former employee after DN reallocation',()=>{
 const promotions=[
  {id:1,personalnummer:null,vorname:'Alt',nachname:'Person',rang:'Polizeimeisteranwärter',neu_rang:'Polizeimeister',am:'2025-06-01'},
  {id:2,personalnummer:37,vorname:'Neu',nachname:'Person',rang:'Polizeikommissaranwärter',neu_rang:'Polizeikommissar',am:'2026-09-01'}
 ];
 const people=[{personalnummer:37,vorname:'Neu',nachname:'Person',eintrittsdatum:'2026-01-01'}];
 const history=[{id:18,vorher:{vorname:'Alt',nachname:'Person',eintrittsdatum:'2024-01-01'},
  folgedaten:{befoerderungen:[{id:1}]}}];
 const result=buildPromotionStats(promotions,people,history,new Date('2026-11-16T00:00:00Z'));
 assert.equal(result.datenqualitaet.zugeordnet,2);
 assert.equal(result.befoerderungen.find(e=>e.rang==='Polizeimeisteranwärter').person_key,'archiv:18');
 assert.equal(result.befoerderungen.find(e=>e.rang==='Polizeikommissaranwärter').person_key,'aktuell:37');
 assert.equal(result.befoerderungen12m,1);
});

test('does not attribute a legacy or invalid promotion to a new holder of the same number',()=>{
 const promotions=[
  {id:3,personalnummer:37,vorname:'Alt',nachname:'Person',rang:'Polizeimeisteranwärter',neu_rang:'Polizeimeister',am:'2025-03-01'},
  {id:4,personalnummer:37,vorname:'Neu',nachname:'Person',rang:'Polizeimeister',neu_rang:'Polizeimeister',am:'2026-07-01'},
  {id:5,personalnummer:37,vorname:'Neu',nachname:'Person',rang:'Polizeimeister',neu_rang:'Polizeiobermeister',am:null}
 ];
 const people=[{personalnummer:37,vorname:'Neu',nachname:'Person',eintrittsdatum:'2026-01-01'}];
 const result=buildPromotionStats(promotions,people,[],new Date('2026-11-16T00:00:00Z'));
 assert.deepEqual(result.datenqualitaet,{gesamt:3,zugeordnet:0,nicht_zugeordnet:3});
});
