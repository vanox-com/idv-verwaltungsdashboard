import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/liveUpdates.js',import.meta.url),'utf8');

// Focused headless smoke test of the live reconciliation dispatcher:
// render() rebuilds the async POR box, and updateView must reload its data.
function makeHarness(tab){
  const counts={dn:0,persRanks:0,rank:0};
  const area={childNodes:[],querySelectorAll:()=>[]};
  const document={
    querySelector:s=>s==='#inhalt'?area:null,
    createElement:()=>({childNodes:[],innerHTML:''}),
    addEventListener:()=>{},
    activeElement:null
  };
  const window={scrollY:0,scrollTo:()=>{},EventSource:null};
  const context={
    window,document,tab,
    ME:{rolle:'Polizeirat'},D:{},
    can:()=>true,
    personalFiltern:()=>{},
    ladePersonalRangantraege:()=>{counts.persRanks++;},
    ladeRangantraege:()=>{counts.rank++;},
    ladeDashboardMeldungen:()=>{},
    ladeDienstnummerAntraege:()=>{counts.dn++;},
    ...Object.fromEntries(['vDash','vPers','vBef','vSonder','vKue','vDis',
       'vRout','vChk','vRl','vUsers'].map(n=>[n,()=>'<section>Lade …</section>'])),
    console
  };
  vm.runInNewContext(source,context,{filename:'liveUpdates.js',timeout:1000});
  return {counts,refresh:()=>window.IDVLive.updateView()};
}

for(const tab of ['pers','bef']){
  test('Live-Aktualisierung im Tab '+tab+' lädt Dienstnummern-Anträge erneut',()=>{
    const h=makeHarness(tab);
    assert.equal(h.refresh(),true);
    assert.equal(h.counts.dn,1,'POR-Ladefunktion muss aufgerufen werden');
    h.refresh();
    assert.equal(h.counts.dn,2,'auch ein zweiter Refresh muss neu laden');
    if(tab==='pers')assert.equal(h.counts.persRanks,2);
    else assert.equal(h.counts.rank,2);
  });
}

test('Live-Aktualisierung anderer Module fordert keine Dienstnummern-Anträge an',()=>{
  const h=makeHarness('dash');
  assert.equal(h.refresh(),true);
  assert.equal(h.counts.dn,0);
});
