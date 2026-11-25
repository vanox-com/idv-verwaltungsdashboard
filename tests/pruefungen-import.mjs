import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({window:{}});
vm.runInContext(readFileSync(new URL('../public/assets/pruefungszentrum.js',import.meta.url),'utf8'),ctx);
const convert=ctx.window.IDVPruefungen.convertGoogle;
const raw={info:{title:'Test',description:'Einleitung'},settings:{quizSettings:{isQuiz:true}},items:[
 {title:'Abschnitt',pageBreakItem:{}},
 {title:'Frage',questionItem:{question:{required:true,grading:{pointValue:4,correctAnswers:{answers:[{value:'B'}]},whenRight:{text:'Richtig'}},choiceQuestion:{type:'RADIO',options:[{value:'A'},{value:'B'}]}}}},
 {title:'Freitext',questionItem:{question:{required:true,textQuestion:{},grading:{pointValue:5,generalFeedback:{text:'Feedback, keine explizite Lösung'}}}}}
]};
const out=JSON.parse(JSON.stringify(convert(raw)));
assert.equal(out.fragen.length,2);
assert.deepEqual(out.fragen[0].richtig,[1]);
assert.equal(out.fragen[0].punkte,4);
assert.match(out.fragen[0].kontext,/Einleitung/);
assert.match(out.fragen[0].feedback,/Richtig/);
assert.equal(out.fragen[1].muster,'Feedback, keine explizite Lösung');
assert.equal(out.fragen[0].muster,'Richtig');
assert.match(out.fragen[1].feedback,/Feedback/);
assert.ok(!out.warnings.some(x=>x.includes('Musterlösung')));
const combined=convert({settings:{quizSettings:{isQuiz:true}},items:[{title:'Text',questionItem:{question:{required:true,textQuestion:{},grading:{pointValue:2,correctAnswers:{answers:[{value:'Explizit'}]},generalFeedback:{text:'Bewertungsmaßstab'},whenRight:{text:'Bewertungsmaßstab'}}}}},{title:'Ohne Lösung',questionItem:{question:{required:true,textQuestion:{},grading:{pointValue:1}}}}]});
assert.equal(combined.fragen[0].muster,'Explizit\n\nBewertungsmaßstab');
assert.ok(combined.warnings.some(x=>x.includes('weder Musterlösung noch Bewertungsfeedback')));
assert.equal(out.blockers.length,0);
raw.items.push({title:'Video',videoItem:{}});
assert.ok(convert(raw).blockers.length>0);
console.log('Google Forms conversion OK');
