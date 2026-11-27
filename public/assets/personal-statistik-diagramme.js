(()=>{'use strict';
const colors={blue:'#68a9f4',green:'#39bda4',red:'#ed8a87',violet:'#ad96e8',gold:'#e3b764',gray:'#94a3b8'};
const palette=Object.values(colors);
const num=v=>Number.isFinite(Number(v))&&Number(v)>=0?Number(v):0;
const fmt=v=>v==null?'—':Number(v).toLocaleString('de-DE',{maximumFractionDigits:1});
const ratio=(v,total)=>total>0?100*v/total:null;
const percent=v=>v==null?'—':fmt(v)+' %';
const sum=(list,fn)=>list.reduce((s,x)=>s+fn(x),0);
const sortedCounts=(items,key)=>{const m=new Map();for(const x of items){const k=key(x);m.set(k,(m.get(k)||0)+num(x.anzahl));}return [...m].map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'de'));};
const bands=[['< 30 T.',0,30],['30–89 T.',30,90],['90–179 T.',90,180],['180–364 T.',180,365],['1–2 J.',365,730],['≥ 2 J.',730,Infinity]];
function model(data,extended,period=12){
 const items=Array.isArray(data.gruppen)?data.gruppen:[],allMonths=Array.isArray(extended.personalbewegung)?extended.personalbewegung:[],months=allMonths.slice(-([3,6,12].includes(period)?period:12));
 const events=Array.isArray(extended.befoerderungen)?extended.befoerderungen:[];
 const total=sum(items,x=>num(x.anzahl)),groups=sortedCounts(items,x=>x.gruppe||'Nicht zugeordnet'),states=sortedCounts(items,x=>x.status||'Nicht zugeordnet');
 const employment=['Hauptberuf','Nebenberuf'].map(label=>({label,n:sum(items,x=>(x.beschaeftigungsart==='Nebenberuf'?'Nebenberuf':'Hauptberuf')===label?num(x.anzahl):0)}));
 const stateMatrix=groups.map(g=>({label:g.label,total:g.n,values:states.map(s=>sum(items,x=>(x.gruppe||'Nicht zugeordnet')===g.label&&(x.status||'Nicht zugeordnet')===s.label?num(x.anzahl):0))}));
 const monthly=months.map(m=>({label:String(m.monat),zugang:num(m.zugang),abgang:num(m.abgang),saldo:num(m.zugang)-num(m.abgang),bef:0}));
 const monthMap=new Map(monthly.map(m=>[m.label,m]));
 const byTransition=new Map();
 for(const ev of events){const m=monthMap.get(String(ev.am||'').slice(0,7));if(!m)continue;m.bef++;const label=String(ev.rang||'Unbekannt')+' → '+String(ev.neu_rang||'Unbekannt');byTransition.set(label,(byTransition.get(label)||0)+1);}
 const transitions=[...byTransition].map(([label,n])=>({label,n})).sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'de'));
 const active=(extended.dienstzeiten||[]).filter(v=>v!=null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0).map(Number);
 const exits=extended.kuendigungsdienstzeit?.verteilung||[],exitN=sum(exits,x=>num(x.anzahl));
 const tenure=bands.map(([label,min,max],i)=>{const a=active.filter(v=>v>=min&&v<max).length,b=num(exits[i]?.anzahl);return {label,aktiv:a,abgang:b,aktivPct:ratio(a,active.length),abgangPct:ratio(b,exitN)};});
 const inCount=sum(monthly,x=>x.zugang),outCount=sum(monthly,x=>x.abgang),befCount=sum(monthly,x=>x.bef);
 let net=0;monthly.forEach(x=>{net+=x.saldo;x.kumuliert=net;});
 const ranks=sortedCounts(extended.dienstgrade||[],x=>x.rang||'Nicht zugeordnet');
 const early=sum(tenure.slice(0,1),x=>x.abgang);
 return {total,groups,states,employment,stateMatrix,monthly,transitions,tenure,activeN:active.length,exitN,inCount,outCount,befCount,ranks,earlyPct:ratio(early,exitN)};
}
const E=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const S=(tag,attrs={},text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!=null)e.textContent=text;return e;};
const css='.psviz{display:grid;gap:16px;margin:22px 0 30px}.psviz .pv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.psviz h2,.psviz h3,.psviz p{margin:0}.psviz .pv-note{color:var(--mut);font-size:12px;line-height:1.55}.psviz .pv-head h2{margin-bottom:5px}.psviz .pv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.psviz .pv-card{padding:18px;border:1px solid var(--border);background:var(--panel);border-radius:12px;min-width:0;display:grid;align-content:start;gap:12px}.psviz .pv-card h3{font-size:15px;line-height:1.35}.psviz .pv-wide{grid-column:1/-1}.psviz .pv-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.psviz .pv-kpi{padding:13px;border:1px solid var(--border);border-radius:9px;background:var(--panel);display:grid;gap:5px}.psviz .pv-kpi b{font-size:25px;font-variant-numeric:tabular-nums}.psviz .pv-kpi small{font-size:11px;color:var(--mut)}.psviz .pv-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px}.psviz .pv-dot{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:6px}.psviz .pv-chart-scroll{overflow-x:auto;max-width:100%}.psviz svg.pv-chart{display:block;width:100%;height:auto;min-width:300px;overflow:visible}.psviz .pv-axis{fill:currentColor;font-size:10px;opacity:.72}.psviz .pv-gridline{stroke:currentColor;opacity:.14}.psviz .pv-ring-wrap{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.psviz .pv-ring{width:142px;height:142px;border-radius:50%;display:grid;place-items:center;flex:none}.psviz .pv-ring-center{width:106px;height:106px;border-radius:50%;background:var(--panel);display:grid;place-content:center;text-align:center}.psviz .pv-ring-center b{font-size:25px}.psviz .pv-ring-center small{color:var(--mut);font-size:11px}.psviz .pv-ring-legend{flex:1;min-width:140px;display:grid;gap:10px;font-size:12px}.psviz .pv-ring-row{display:flex;align-items:center;gap:4px}.psviz .pv-ring-row b{margin-left:auto;white-space:nowrap}.psviz .pv-table{width:100%;border-collapse:collapse;font-size:12px}.psviz .pv-table th,.psviz .pv-table td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}.psviz .pv-table th{color:var(--mut);font-weight:600}.psviz .pv-cell{min-width:42px;padding:5px 8px;display:inline-block;text-align:center;border-radius:5px;font-variant-numeric:tabular-nums}.psviz details summary{cursor:pointer;color:var(--mut);font-size:12px}.psviz details[open] summary{margin-bottom:10px}.psviz .pv-rank{display:grid;grid-template-columns:minmax(100px,2fr) minmax(40px,1fr) 35px;align-items:center;gap:9px;font-size:12px}.psviz .pv-track{height:9px;background:color-mix(in srgb,var(--mut) 15%,transparent);border-radius:6px;overflow:hidden}.psviz .pv-track i{height:100%;display:block;border-radius:6px}.psviz .pv-rank strong{text-align:right;font-variant-numeric:tabular-nums}.psviz .pv-empty{font-size:12px;color:var(--mut);padding:10px 0}@media(max-width:850px){.psviz .pv-grid{grid-template-columns:minmax(0,1fr)}.psviz .pv-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:440px){.psviz .pv-card{padding:12px}.psviz .pv-kpi b{font-size:20px}}';
let tip=null,activeTarget=null,pinned=false;
function hideTip(){if(activeTarget){activeTarget.classList.remove('pv-highlight');activeTarget.removeAttribute('aria-describedby');}activeTarget=null;pinned=false;if(tip){tip.remove();tip=null;}}
function showTip(target,title,lines,point=null){
 if(activeTarget!==target)hideTip();
 activeTarget=target;target.classList.add('pv-highlight');
 if(!tip){tip=E('div',null,'pv-tooltip');tip.id='idv-personal-chart-tooltip';tip.setAttribute('role','tooltip');document.body.append(tip);}
 tip.replaceChildren(E('strong',title));for(const line of lines){const row=E('div',null,'pv-tip-row');row.append(E('span',line.label),E('b',line.value));tip.append(row);}
 target.setAttribute('aria-describedby',tip.id);
 const r=target.getBoundingClientRect(),anchorX=point?.clientX??(r.left+r.right)/2,anchorY=point?.clientY??r.top;
 const pad=10,w=tip.offsetWidth,h=tip.offsetHeight;
 tip.style.left=Math.max(pad,Math.min(window.innerWidth-w-pad,anchorX+12))+'px';
 tip.style.top=Math.max(pad,Math.min(window.innerHeight-h-pad,anchorY-h-12>=pad?anchorY-h-12:anchorY+16))+'px';
}
function interactive(target,title,lines){
 target.classList.add('pv-interactive');target.setAttribute('tabindex','0');target.setAttribute('role','button');target.setAttribute('aria-label',title+' · '+lines.map(x=>x.label+': '+x.value).join(' · '));
 target.addEventListener('pointerenter',e=>{if(!pinned)showTip(target,title,lines,e);});
 target.addEventListener('pointermove',e=>{if(!pinned&&activeTarget===target)showTip(target,title,lines,e);});
 target.addEventListener('pointerleave',()=>{if(!pinned&&activeTarget===target&&document.activeElement!==target)hideTip();});
 target.addEventListener('focus',()=>{if(!pinned||activeTarget===target)showTip(target,title,lines);});
 target.addEventListener('blur',()=>{if(activeTarget===target&&!pinned)hideTip();});
 const toggle=()=>{if(activeTarget===target&&pinned){hideTip();return;}showTip(target,title,lines);pinned=true;};
 target.addEventListener('click',toggle);
 target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}else if(e.key==='Escape'){hideTip();}});
}
function installTipEvents(){
 if(installTipEvents.done)return;installTipEvents.done=true;
 document.addEventListener('pointerdown',e=>{if(activeTarget&&!activeTarget.contains(e.target))hideTip();},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTip();});
 window.addEventListener('scroll',hideTip,true);window.addEventListener('resize',hideTip);
 const style=E('style',null);style.textContent='.pv-tooltip{position:fixed;z-index:2147483000;pointer-events:none;max-width:min(320px,calc(100vw - 20px));min-width:132px;padding:10px 13px;border:1px solid #53677d;border-radius:9px;background:#172536;color:#f1f5f9;box-shadow:0 6px 24px #0006;font-size:12px;line-height:1.45;box-sizing:border-box}.pv-tooltip>strong{display:block;margin-bottom:6px;color:#c5d9f2;font-size:12px;overflow-wrap:anywhere}.pv-tip-row{display:flex;justify-content:space-between;gap:15px;margin-top:3px}.pv-tip-row b{white-space:nowrap;font-variant-numeric:tabular-nums}.pv-interactive{cursor:pointer;outline:none}.pv-interactive:focus-visible{outline:2px solid #73b5f5;outline-offset:3px}.pv-highlight{filter:brightness(1.25)}.pv-highlight .pv-mark,.pv-interactive:focus-visible .pv-mark{stroke:#dbeafe;stroke-width:1.5}.pv-highlight.pv-ring-row,.pv-highlight.pv-rank,.pv-highlight.pv-cell{background:color-mix(in srgb,#73b5f5 17%,transparent);border-radius:5px}.psviz .pv-toggle{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text);font-size:12px;cursor:pointer}.psviz .pv-toggle[aria-pressed=false]{opacity:.5;text-decoration:line-through}.psviz .pv-toggle:focus-visible{outline:2px solid #73b5f5;outline-offset:2px}';document.head.append(style);
}
function seriesChart(rows,series,options){
 const region=E('div'),controls=E('div',null,'pv-legend'),plot=E('div'),disabled=new Set();
 const update=()=>{hideTip();const visible=series.filter(s=>!disabled.has(s.key));plot.replaceChildren(visible.length?chart(rows,visible,options):E('p','Keine Datenreihe ausgewählt. Klicke auf eine Legende, um sie wieder einzublenden.','pv-empty'));};
 for(const s of series){const b=E('button',null,'pv-toggle'),dot=E('i',null,'pv-dot');b.type='button';b.setAttribute('aria-pressed','true');dot.style.background=s.color;b.append(dot,document.createTextNode(s.label));b.addEventListener('click',()=>{if(disabled.has(s.key))disabled.delete(s.key);else disabled.add(s.key);b.setAttribute('aria-pressed',String(!disabled.has(s.key)));update();});controls.append(b);}
 region.append(controls,plot);update();return region;
}
function card(title,note,wide=false){const c=E('section',null,'pv-card'+(wide?' pv-wide':''));c.append(E('h3',title));if(note)c.append(E('p',note,'pv-note'));return c;}
function legend(series){const l=E('div',null,'pv-legend');for(const s of series){const row=E('span'),dot=E('i',null,'pv-dot');dot.style.background=s.color;row.append(dot,document.createTextNode(s.label));l.append(row);}return l;}
function table(headers,rows){const wrap=E('div',null,'pv-chart-scroll'),t=E('table',null,'pv-table'),thead=E('thead'),hr=E('tr');headers.forEach(h=>{const th=E('th',h);th.scope='col';hr.append(th);});thead.append(hr);t.append(thead);const body=E('tbody');for(const row of rows){const tr=E('tr');row.forEach((v,i)=>{const td=E(i===0?'th':'td');if(i===0)td.scope='row';if(v&&typeof v==='object')td.append(v);else td.textContent=v??'—';tr.append(td);});body.append(tr);}t.append(body);wrap.append(t);return wrap;}
function details(headers,rows){const d=E('details');d.append(E('summary','Werte als Tabelle'),table(headers,rows));return d;}
const shortMonth=m=>/^\d{4}-\d{2}$/.test(m)?m.slice(5)+'.'+m.slice(2,4):m;
function chart(rows,series,{signed=false,unit='',label='',line=false,percentAxis=false}={}){
 const wrap=E('div',null,'pv-chart-scroll');
 if(!rows.length){wrap.append(E('p','Keine Daten vorhanden.','pv-empty'));return wrap;}
 const W=Math.max(360,rows.length*53+64),H=235,L=43,R=12,T=16,B=36,plotH=H-T-B,plotW=W-L-R;
 const values=rows.flatMap(r=>series.map(s=>r[s.key]).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))).map(Number));
 if(!values.length){wrap.append(E('p','Keine auswertbaren Werte vorhanden.','pv-empty'));return wrap;}
 const hi=Math.max(0,...values),lo=signed?Math.min(0,...values):0;
 const raw=(hi-lo)/4,mag=10**Math.floor(Math.log10(Math.max(raw,0.00001))),nice=[1,2,2.5,5,10].find(v=>v*mag>=raw)||10;
 const step=percentAxis?25:Math.max(1,nice*mag),max=percentAxis?100:Math.max(step,Math.ceil(hi/step)*step),min=signed?Math.floor(lo/step)*step:0;
 const y=v=>T+(max-v)/(max-min)*plotH,x=i=>L+(i+.5)*plotW/rows.length;
 const svg=S('svg',{viewBox:'0 0 '+W+' '+H,role:'group','aria-label':label,class:'pv-chart',style:'min-width:'+Math.min(W,560)+'px'});svg.append(S('title',{},label));
 for(let v=min;v<=max+step/100;v+=step){svg.append(S('line',{x1:L,x2:W-R,y1:y(v),y2:y(v),class:'pv-gridline','stroke-dasharray':v===0?'':'3 4'}),S('text',{x:L-6,y:y(v)+3,'text-anchor':'end',class:'pv-axis'},fmt(v)+(percentAxis?'%':'')));}
 const group=plotW/rows.length,bw=Math.min(22,group*.7/series.length);
 for(let i=0;i<rows.length;i++){const r=rows[i];svg.append(S('text',{x:x(i),y:H-11,'text-anchor':'middle',class:'pv-axis'},r.label));if(!line)series.forEach((s,j)=>{if(r[s.key]==null)return;const value=Number(r[s.key]);if(!Number.isFinite(value))return;const b=S('rect',{x:x(i)+(j-(series.length-1)/2)*bw-bw*.43,y:Math.min(y(0),y(value)),width:bw*.86,height:Math.abs(y(value)-y(0)),rx:2,fill:signed?(value<0?colors.red:colors.green):s.color});const hit=S('g'),bx=x(i)+(j-(series.length-1)/2)*bw-bw*.43,by=Math.min(y(0),y(value)),bh=Math.abs(y(value)-y(0));
 b.setAttribute('class','pv-mark');hit.append(b,S('rect',{x:bx,y:by-Math.max(0,12-bh)/2,width:bw*.86,height:Math.max(12,bh),fill:'transparent'}));interactive(hit,r.label,[{label:s.label,value:fmt(value)+unit},...(series.length>1?series.filter(q=>q.key!==s.key&&r[q.key]!=null).map(q=>({label:q.label,value:fmt(r[q.key])+unit})):[])]);svg.append(hit);});}
 if(line)for(const s of series){let segment=[];const flush=()=>{if(segment.length>1)svg.append(S('polyline',{points:segment.map(p=>p.join(',')).join(' '),fill:'none',stroke:s.color,'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));segment=[];};rows.forEach((r,i)=>{if(r[s.key]==null||!Number.isFinite(Number(r[s.key]))){flush();return;}segment.push([x(i),y(Number(r[s.key]))]);});flush();rows.forEach((r,i)=>{if(r[s.key]==null||!Number.isFinite(Number(r[s.key])))return;const v=Number(r[s.key]),dot=S('circle',{cx:x(i),cy:y(v),r:3.5,fill:s.color});const hit=S('g');dot.setAttribute('class','pv-mark');hit.append(dot,S('circle',{cx:x(i),cy:y(v),r:10,fill:'transparent'}));interactive(hit,r.label,[{label:s.label,value:fmt(v)+unit}]);svg.append(hit);});}
 wrap.append(svg);return wrap;
}
function donut(rows,total){
 const w=E('div',null,'pv-ring-wrap'),r=S('svg',{viewBox:'0 0 142 142',width:142,height:142,role:'group','aria-label':'Verteilung, '+fmt(total)+' Personen',style:'flex:none'}),l=E('div',null,'pv-ring-legend'),circ=2*Math.PI*55;let pos=0;
 r.append(S('circle',{cx:71,cy:71,r:55,fill:'none',stroke:'#64748b33','stroke-width':20}));
 rows.forEach((v,i)=>{const c=palette[i%palette.length],length=total?v.n/total*circ:0;const lines=[{label:'Personen',value:fmt(v.n)},{label:'Anteil',value:percent(ratio(v.n,total))}];
 if(length>0){const arc=S('circle',{cx:71,cy:71,r:55,fill:'none',stroke:c,'stroke-width':20,'stroke-dasharray':length+' '+(circ-length),'stroke-dashoffset':-pos,transform:'rotate(-90 71 71)'});interactive(arc,v.label,lines);r.append(arc);}pos+=length;
 const row=E('div',null,'pv-ring-row'),dot=E('i',null,'pv-dot');dot.style.background=c;row.append(dot,E('span',v.label),E('b',fmt(v.n)+' · '+percent(ratio(v.n,total))));interactive(row,v.label,lines);l.append(row);});
 r.append(S('text',{x:71,y:70,'text-anchor':'middle',fill:'currentColor','font-size':24,'font-weight':700,'pointer-events':'none'},fmt(total)),S('text',{x:71,y:85,'text-anchor':'middle',fill:'currentColor','font-size':11,opacity:.7,'pointer-events':'none'},'Personen'));w.append(r,l);return w;
}
function rankRows(rows){const w=E('div'),max=Math.max(1,...rows.map(x=>x.n));for(const x of rows){const r=E('div',null,'pv-rank'),t=E('div',null,'pv-track'),i=E('i');i.style.width=100*x.n/max+'%';i.style.background=colors.blue;t.append(i);r.append(E('span',x.label),t,E('strong',fmt(x.n)));interactive(r,x.label,[{label:'Anzahl',value:fmt(x.n)}]);w.append(r);}if(!rows.length)w.append(E('p','Keine dokumentierten Vorgänge.','pv-empty'));return w;}
function createSections(root,definitions,selected,onSelect){
 const nav=E('nav',undefined,'stat-polish-tabs');nav.setAttribute('aria-label','Statistikbereiche');const panels={},buttons={};root.append(nav);
 for(const [id,title,description] of definitions){
  const button=E('button',title,'stat-polish-tab');button.type='button';button.setAttribute('aria-pressed','false');nav.append(button);buttons[id]=button;
  const panel=E('section',undefined,'stat-polish-panel'),heading=E('div',undefined,'stat-polish-heading');
  heading.append(E('h2',title),E('p',description));panel.append(heading);root.append(panel);panels[id]=panel;
  button.addEventListener('click',()=>choose(id));
 }
 function choose(id){if(!panels[id])id=definitions[0][0];hideTip();for(const key of Object.keys(panels)){panels[key].hidden=key!==id;buttons[key].setAttribute('aria-pressed',String(key===id));}onSelect(id);}
 choose(selected);return panels;
}
let selectedSection='entwicklung';
function render(root,m,period,legacy={}){
 root.replaceChildren();
 const k=E('div',null,'pv-kpis');for(const [label,value,sub] of [['Zugänge',fmt(m.inCount),'Im ausgewählten Zeitraum'],['Abgänge',fmt(m.outCount),'Dokumentierte Kündigungen'],['Netto-Saldo',(m.inCount-m.outCount>0?'+':'')+fmt(m.inCount-m.outCount),'Zugänge minus Abgänge'],['Beförderungen',fmt(m.befCount),'Eindeutig zugeordnete Vorgänge']]){const e=E('div',null,'pv-kpi');e.append(E('small',label),E('b',value),E('small',sub));k.append(e);}root.append(k);
 const panels=createSections(root,[['entwicklung','Personalentwicklung','Monatliche Zu- und Abgänge sowie Netto-Saldo.'],['struktur','Personalstruktur','Beschäftigung, Status und aktueller Bestand.'],['dienstzeit','Dienstzeit & Bindung','Dienstzeiten und dokumentierte Kündigungen im Vergleich.'],['karriere','Laufbahnen & Beförderungen','Rangstruktur und Karriereverläufe.']],selectedSection,id=>{selectedSection=id;});
 const grids={};for(const [id,panel] of Object.entries(panels)){const grid=E('div',null,'pv-grid');panel.append(grid);grids[id]=grid;}
 let g=grids.entwicklung;
 const months=m.monthly.map(x=>({...x,label:shortMonth(x.label)})),mov=[{key:'zugang',label:'Zugänge',color:colors.green},{key:'abgang',label:'Abgänge',color:colors.red}];
 let c=card('Personalbewegung · Monatsvergleich','Säulen nebeneinander, mit gemeinsamer Skala. Der laufende Monat ist möglicherweise unvollständig.',true);c.append(seriesChart(months,mov,{label:'Monatliche Zugänge und Abgänge'}),details(['Monat','Zugänge','Abgänge','Saldo'],m.monthly.map(x=>[x.label,fmt(x.zugang),fmt(x.abgang),fmt(x.saldo)])));g.append(c);
 c=card('Monatlicher Netto-Saldo','Positive und negative Bewegungen oberhalb bzw. unterhalb der Nulllinie.');c.append(legend([{label:'Zuwachs',color:colors.green},{label:'Rückgang',color:colors.red}]),chart(months,[{key:'saldo',label:'Saldo',color:colors.green}],{signed:true,label:'Monatlicher Netto-Saldo'}));g.append(c);
 c=card('Kumulierter Bewegungssaldo','Aufsummierte Zu- minus Abgänge ab Beginn des gewählten Zeitraums; kein historischer Personalbestand.');c.append(chart(months,[{key:'kumuliert',label:'Kumulierter Saldo',color:colors.blue}],{signed:true,line:true,label:'Kumulierter Bewegungssaldo'}),details(['Monat','Kumulierter Saldo'],m.monthly.map(x=>[x.label,fmt(x.kumuliert)])));g.append(c);
 g=grids.karriere;
 c=card('Beförderungen im Zeitverlauf','Eindeutig zugeordnete, dokumentierte Beförderungen pro Monat. Mehrere Vorgänge pro Person sind möglich.',true);c.append(chart(months,[{key:'bef',label:'Beförderungen',color:colors.violet}],{label:'Beförderungsvorgänge pro Monat'}),details(['Monat','Beförderungen'],m.monthly.map(x=>[x.label,fmt(x.bef)])));g.append(c);
 c=card('Häufigste Beförderungswege','Die acht häufigsten Rangwechsel im gewählten Zeitraum.');c.append(rankRows(m.transitions.slice(0,8)));g.append(c);
 c=card('Dienstgrade im Vergleich','Aktueller Bestand · die zehn häufigsten Dienstgrade.');c.append(rankRows(m.ranks.slice(0,10)));g.append(c);
 g=grids.struktur;
 c=card('Beschäftigungsstruktur','Aktueller Personalbestand nach Haupt- und Nebenberuf.');c.append(donut(m.employment,m.total));g.append(c);
 c=card('Statusverteilung','Aktueller Personalbestand nach Status.');c.append(donut(m.states,m.total));g.append(c);
 c=card('Personalstruktur · Status-Heatmap','Absolute Anzahl je Mitarbeitergruppe und Status. Intensivere Zellen stehen für mehr Personen.',true);const max=Math.max(1,...m.stateMatrix.flatMap(x=>x.values));const matrix=m.stateMatrix.map(x=>[x.label,...x.values.map((v,i)=>{const t=E('span',fmt(v),'pv-cell');t.style.background='rgba(104,169,244,'+(v?0.12+0.5*v/max:0.03)+')';interactive(t,x.label,[{label:m.states[i].label,value:fmt(v)},{label:'Anteil in Gruppe',value:percent(ratio(v,x.total))}]);return t;}),fmt(x.total)]);c.append(matrix.length?table(['Gruppe',...m.states.map(x=>x.label),'Gesamt'],matrix):E('p','Keine Personalstände vorhanden.','pv-empty'));g.append(c);
 g=grids.dienstzeit;
 c=card('Dienstzeiten direkt verglichen','Anteil innerhalb der jeweiligen Gruppe: '+m.activeN+' Mitarbeiter im Polizeidienst gegenüber '+m.exitN+' dokumentierten beendeten Beschäftigungen. Kündigungsdauer über alle verfügbaren Jahre, nicht nur den gewählten Zeitraum.',true);const tenureSeries=[{key:'aktivPct',label:'Im Polizeidienst',color:colors.green},{key:'abgangPct',label:'Beendete Beschäftigungen',color:colors.red}];c.append(seriesChart(m.tenure,tenureSeries,{percentAxis:true,unit:' %',label:'Verteilung der Dienstzeiten im Polizeidienst und nach Kündigung'}),details(['Dienstzeit','Im Dienst (Anzahl)','Im Dienst (Anteil)','Abgänge (Anzahl)','Abgänge (Anteil)'],m.tenure.map(x=>[x.label,fmt(x.aktiv),percent(x.aktivPct),fmt(x.abgang),percent(x.abgangPct)])),E('p','Anteil dokumentierter Kündigungen innerhalb der ersten 30 Tage: '+percent(m.earlyPct)+'. Das ist keine Kündigungswahrscheinlichkeit für neu eingestellte Personen.','pv-note'));g.append(c);
 for(const [id,body] of Object.entries(legacy)){if(!panels[id]||!body)continue;const d=E('details',null,'stat-polish-details');if(id==='karriere'&&body._statPyramid)panels[id].append(body._statPyramid);else if(id==='karriere'){const pyramid=body.querySelector?.('.stat-pyramid')?.closest('section');if(pyramid){body._statPyramid=pyramid;panels[id].append(pyramid);}}d.append(E('summary',id==='karriere'?'Beförderungsdauer & Datenqualität':'Weitere Kennzahlen & Datentabellen'),body);panels[id].append(d);}
}
function mount(host,data,extended,legacy={}){hideTip();installTipEvents();host.replaceChildren();host.classList.add('psviz');const style=E('style',css+".stat-polish-tabs{display:flex;gap:6px;overflow-x:auto;padding:5px;border:1px solid var(--border,#344458);background:var(--panel,#172332);border-radius:11px;scrollbar-width:thin}.stat-polish-tabs button{flex:1 0 auto;padding:10px 15px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--mut,#9aa9bd);font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}.stat-polish-tabs button[aria-pressed=true]{color:var(--text,#f1f5f9);background:color-mix(in srgb,var(--accent,#73b5f5) 16%,var(--panel,#172332));border-color:color-mix(in srgb,var(--accent,#73b5f5) 43%,transparent)}.stat-polish-tabs button:focus-visible{outline:2px solid var(--accent,#73b5f5);outline-offset:-2px}.stat-polish-panel[hidden]{display:none!important}.stat-polish-panel{display:grid;gap:14px;min-width:0}.stat-polish-heading h2{font-size:17px;margin:0 0 4px}.stat-polish-heading p{font-size:12px;color:var(--mut,#9aa9bd);margin:0}.stat-polish-details{border:1px solid var(--border,#344458);border-radius:10px;background:var(--panel,#172332);padding:12px 16px}.stat-polish-details>summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--text,#f1f5f9)!important}.stat-polish-details[open]>summary{margin-bottom:14px}.stat-polish-details .stat-section{margin:12px 0}.stat-polish-details .stat-section h2{font-size:16px}.stat-polish-details .stat-kpi-grid,.stat-polish-details .stat-insights,.stat-polish-details .personalstat-grid{margin:12px 0}@media(max-width:600px){.stat-polish-tabs button{padding:9px 11px;font-size:12px}} .psviz{margin:16px 0 24px;gap:14px}.psviz .pv-card{padding:20px;gap:10px}.psviz .pv-card h3{font-size:15px;font-weight:650}.psviz .pv-kpi{padding:14px 16px}.psviz .pv-kpi b{font-size:26px}.psviz .pv-rank{padding:5px 0}.psviz .pv-head h2{font-size:17px}.psviz .pv-note{max-width:90ch}.psviz .pv-chart-scroll svg{max-height:270px}"),head=E('div',null,'pv-head'),intro=E('div');intro.append(E('h2','Analyse'),E('p','Diagramme erkunden und Datenreihen über die Legende filtern.','pv-note'));const controls=E('div'),label=E('label','Zeitraum: '),select=E('select');select.setAttribute('aria-label','Zeitraum für Bewegungen und Beförderungen');for(const p of [3,6,12]){const o=E('option','Letzte '+p+' Monate');o.value=String(p);select.append(o);}select.value='12';label.append(select);controls.append(label);head.append(intro,controls);const note=E('p','Der Filter gilt für Zu-/Abgänge, Netto-Saldo und Beförderungen. Bestands- und Dienstzeitdiagramme bleiben unabhängig davon.','pv-note'),content=E('div',null,'psviz');content.style.margin='0';host.append(style,head,note,content);const update=()=>{hideTip();render(content,model(data,extended,Number(select.value)),Number(select.value),legacy);};select.onchange=update;update();}
function enhanceLegacy(host){
 for(const group of host.querySelectorAll('.dashboard-group,.stat-hist-row')){
  const name=group.querySelector('.dashboard-group-head span'),value=group.querySelector('.dashboard-group-head strong'),bar=group.querySelector('.dashboard-progress');
  if(name&&value&&bar&&!bar.classList.contains('pv-interactive'))interactive(bar,name.textContent.trim(),[{label:'Wert',value:value.textContent.trim()}]);
 }
 for(const row of host.querySelectorAll('.stat-movement-row.compare')){
  const month=row.querySelector('span')?.textContent?.trim();const tracks=row.querySelectorAll('.stat-movement-duo-track');
  tracks.forEach((track,i)=>{const value=track.parentElement?.querySelector('b')?.textContent?.trim();if(month&&value!=null&&!track.classList.contains('pv-interactive'))interactive(track,month,[{label:i===0?'Zugänge':'Abgänge',value}]);});
 }
}
window.IDVPersonalDiagramme={mount,model,enhanceLegacy};
})();