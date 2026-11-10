/**
 * Cutover safety contract: pure validation only. No database connections.
 * All release claims are manual evidence gates, NOT replaced by green CI.
 */
export const REQUIRED_RELEASE_GATES=Object.freeze([
  'critical_feature_parity','all_102_plus_api_routes','complete_bootstrap_contract',
  'audit_and_archive_parity','sse_concurrency_and_conflict_tests',
  'all_roles_security_tests','document_oauth_copnet_tests',
  'real_data_cryptographic_comparison','staging_acceptance'
]);
export const FINAL_ACKNOWLEDGEMENTS=Object.freeze({
  IDV_WRITES_STOPPED:'YES',
  IDV_WRITE_FREEZE_VERIFIED:'YES',
  IDV_BACKUP_CONFIRMED:'RESTORE_TESTED',
  IDV_STAGING_ACCEPTED:'PASSED',
  IDV_ROLLBACK_CONFIRMED:'YES',
  IDV_CUTOVER_CONFIRMED:'I_AUTHORIZE_DATA_MIGRATION',
  MYSQL_COPY_CONFIRM:'EMPTY_NEW_DATABASE',
  MYSQL_SCHEMA_CONFIRM:'EMPTY_NEW_DATABASE'
});

export function readinessErrors(config){
  const errors=[];
  if(!config||typeof config!=='object'||Array.isArray(config)||
     !config.releases||typeof config.releases!=='object'||Array.isArray(config.releases))
    return ['Freigabedatei fehlt oder ist ungültig'];
  if(config.schema_import_real_mysql8!==true||config.smoke_pdo_mysql8!==true)
    errors.push('Technische MySQL8/PDO-Grundprüfungen nicht freigegeben');
  const unexpected=Object.keys(config.releases).filter(k=>!REQUIRED_RELEASE_GATES.includes(k));
  for(const gate of unexpected)errors.push('Unbekannter Freigabepunkt: '+gate);
  for(const gate of REQUIRED_RELEASE_GATES)
    if(config.releases[gate]!==true)errors.push('Freigabepunkt offen: '+gate);
  return errors;
}

function databaseUrl(value,protocols){
  if(!value||typeof value!=='string')return null;
  try{
    const url=new URL(value);
    if(!protocols.includes(url.protocol)||!url.hostname||!url.pathname||
       url.pathname==='/'||!url.username)return null;
    return {host:url.hostname.toLowerCase(),name:decodeURIComponent(url.pathname.slice(1))};
  }catch{return null;}
}

export function executionErrors(env){
  const errors=[];
  for(const [name,value] of Object.entries(FINAL_ACKNOWLEDGEMENTS))
    if(env[name]!==value)errors.push('Verbindliche Bestätigung fehlt: '+name);
  const source=databaseUrl(env.SOURCE_DATABASE_URL,['postgres:','postgresql:']);
  const target=databaseUrl(env.MYSQL_DESTINATION_URL,['mysql:']);
  if(!source)errors.push('PostgreSQL-Quellverbindung fehlt oder ist ungültig');
  if(!target)errors.push('MySQL-Zielverbindung fehlt oder ist ungültig');
  for(const [label,expected,actual] of [
    ['Quelle',env.IDV_EXPECTED_SOURCE_DATABASE,source?.name],
    ['Ziel',env.IDV_EXPECTED_TARGET_DATABASE,target?.name]
  ]){
    if(typeof expected!=='string'||!expected||
       !/^[a-zA-Z0-9_-]{2,128}$/.test(expected))
      errors.push(label+': ausdrücklich bestätigter Datenbankname fehlt');
    else if(actual!==undefined&&actual!==expected)
      errors.push(label+': Datenbankname weicht von der ausdrücklichen Bestätigung ab');
  }
  if(source&&target&&source.host===target.host&&source.name===target.name)
    errors.push('Quelle und Ziel dürfen nicht denselben Host und Datenbanknamen haben');
  return errors;
}
