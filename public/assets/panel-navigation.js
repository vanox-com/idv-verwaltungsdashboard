/* Shared real panel navigation and role checks. No API calls or credentials. */
const MODS = [
  ['dash','Dashboard','📊'],['pers','Personal','👥'],['bef','Beförderungen','⭐'],
  ['ausbildung','Übersicht','🎓'],['ausbildung-pma','PMA-Monitor','📋'],['ausbildung-pka','PKA-/KKA-Monitor','📋'],['ausbildung-ausbilder','Ausbilderverwaltung','👥'],['ausbildung-materialien','Ausbildungsunterlagen','📚'],['ausbildung-unterricht','Unterrichtsräume','📽️'],['ausbildung-pruefungen','Prüfungszentrum','📝'],['sonder','Sonderfunktionen','🎖️'],['praktika','Praktika','🎓'],['kue','Kündigungen','📤'],
  ['dis','Disziplinarmanagement','⚖️'],['rout','Routine','🗓️'],['abm','Abmeldungen','📅'],
  ['chk','Checklisten','✅'],['texte','Textbausteine','📝'],['rl','Richtlinie','📜'],['org','Organigramm','🏛️'],
  ['sperr','Sperrfristen','⏱️'],['geb','Geburtstage','🎂'],['jub','Dienstjubiläen','🏅'],['bl','Blacklist','⛔'],
  ['rechtesimulator','Berechtigungs-Simulator','🛡️'],['design','Designverwaltung','🎨'],['backup','Backup-Übersicht','🗄️'],['users','Benutzer & Rollen','🔐'],['befricht','Beförderungsrichtlinien','📋'],['system','Systemverwaltung','⚙️'],['botcfg','Bot-Konfiguration','🤖'],['meldungen','Mitteilungen verwalten','📣'],['benachrichtigungen','Benachrichtigungen','🔔'],['statistik','Personalstatistiken','📈'],['log','Protokoll','🧾'],['papierkorb','Papierkorb','🗑️']
];
/* Sidebar: dieselben Module und Rechte, nur übersichtlich gruppiert.
   Ein aktives Modul hält seine Kategorie immer geöffnet. */
const NAV_GRUPPEN = [
  {id:'uebersicht',titel:'Übersicht',module:['dash']},
  {id:'personal',titel:'Personal & Dienst',module:['pers','bef','sonder','praktika','rout','abm','geb','jub' ,'statistik']},
  {id:'organisation',titel:'Organisation & Vorlagen',module:['org','chk','texte']},
  {id:'vorgaenge',titel:'Vorgänge & Regelwerk',module:['kue','dis','rl','sperr','bl']},
  {id:'ausbildung',titel:'Ausbildung',module:['ausbildung','ausbildung-pma','ausbildung-pka','ausbildung-ausbilder','ausbildung-materialien','ausbildung-unterricht','ausbildung-pruefungen']},
  {id:'verwaltung',titel:'Administration',module:['users','befricht','system','botcfg','meldungen','benachrichtigungen','rechtesimulator','design','backup','log','papierkorb']}
];
const AUSB_NAV={
  ausbildung:{route:'uebersicht'},'ausbildung-pma':{route:'monitore',track:'PMA'},'ausbildung-pka':{route:'monitore',track:'PKA-KKA'},'ausbildung-ausbilder':{route:'ausbilder',leitung:true},'ausbildung-materialien':{route:'materialien',leitung:true},'ausbildung-unterricht':{route:'unterricht'},'ausbildung-pruefungen':{route:'pruefungen'}
};
function panelCan(user,m,l=1){
  if(!user)return false;
  if(m==='rechtesimulator'||m==='users')return user.rolle==='Administrator';
  if(m==='benachrichtigungen')return ['Administrator','Leitungsdienst'].includes(user.rolle)||(user.rechte?.por||0)>=2||(user.rechte?.ausbildung||0)>=1;
  if(Object.hasOwn(AUSB_NAV,m))return (user.rechte?.ausbildung||0)>=Math.max(l,AUSB_NAV[m].leitung?2:1);
  if(['Ausbilder','Ausbildungsleitung'].includes(user.rolle))return (m==='dash'||m==='design')&&l<=1;
  return m==='design'||m==='favoriten'?true:m==='entwicklung'?(user.rechte?.pers||0)>=l:m==='system'?user.rolle==='Administrator':m==='meldungen'?(user.rechte?.mitteilungen||0)>=2:m==='statistik'?(user.rechte?.pers||0)>=l:(user.rechte?.[m]||0)>=l;
}
function navIcon(id) {
  const p = {
    dash: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    pers: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a4 4 0 0 1 0 8M18 15a6 6 0 0 1 4 6"/>',
    bef: '<path d="M12 3 14.8 9l6.5 1-4.7 4.5 1.1 6.5L12 18l-5.7 3 1.1-6.5L2.7 10l6.5-1z"/>',
    befricht: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h6M8 15h5M14 15l2 2 3-4"/>',
    sonder: '<path d="M12 2 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="m8 12 3 3 5-6"/>',
    ausbildung: '<path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12v5c3.5 3 8.5 3 12 0v-5M22 10v7"/>',
    'ausbildung-pma':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM8 12h8M8 16h5"/>',
    'ausbildung-pka':'<path d="M12 3 4 6v6c0 5 4 8 8 10 4-2 8-5 8-10V6zM9 12l2 2 4-5"/>',
    'ausbildung-kka':'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M8 10h4M10 8v4"/>',
    'ausbildung-ausbilder':'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 7a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
    'ausbildung-materialien':'<path d="M4 4h6a3 3 0 0 1 2 2 3 3 0 0 1 2-2h6v15h-6a3 3 0 0 0-2 2-3-2H4zM12 6v15"/>',
    'ausbildung-unterricht':'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="m12 16-5 5m5-5 5 5M10 7l5 3-5 3z"/>',
    'ausbildung-pruefungen':'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 10h8M8 14h4m1 3 2 2 3-4"/>',
    praktika: '<path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12v5c3.5 3 8.5 3 12 0v-5M22 10v7"/>',
    kue: '<path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M13 3v5h5M10 13h11m-4-4 4 4-4 4"/>',
    dis: '<path d="M12 3v18M4 7h16M5 7l-3 7h6L5 7zM19 7l-3 7h6l-3-7zM8 21h8"/>',
    rout: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    abm: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    botcfg: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6M9 13v1M15 13v1M9 17h6M2 13v2M22 13v2"/>',
    chk: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
    texte: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    rl: '<path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1zM12 6v15"/>',
    org: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="9" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5M12 12v5"/>',
    sperr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    geb: '<path d="M3 21h18M5 21V11h14v10M9 11V7h6v4M12 3v4M5 16h14"/>',
    jub: '<circle cx="12" cy="8" r="6"/><path d="M8 13 6 22l6-3 6 3-2-9"/>',
    bl: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5 18.5 18.5"/>',
    system: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
    meldungen: '<path d="M3 11v3l4 1 2 5h3l-2-5 9 3V7l-9 3H5a2 2 0 0 0-2 1zM21 10v5"/>',
    benachrichtigungen: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    design: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 1-4 2 2 0 0 1 1-4h2a3 3 0 0 0 3-3 9 9 0 0 0-9-7z"/><circle cx="7.5" cy="10" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="17" cy="10" r="1"/>',
    backup: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 2 16 2 16 0V5M4 12v7c0 2 16 2 16 0v-7"/><path d="M9 17h6"/>',
    rechtesimulator: '<path d="M12 2 20 6v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="m8 12 3 3 5-6"/>',
    statistik: '<path d="M3 21h18M5 17V9h4v8M11 17V4h4v13M17 17v-6h4v6"/><path d="M3 21V3"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M18 6v6M15 9h6"/>',
    papierkorb: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    log: '<path d="M7 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h8M9 12h8M9 16h5"/>'
  }[id] || '';
  return '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

