/**
 * Personal status is independent of Hauptberuf/Nebenberuf employment.
 */
export const PERSONNEL_STATUSES=Object.freeze([
  'Aktiv','Abgemeldet','Inaktiv','Suspendiert','Gekündigt','freihalten'
]);

export function validPersonnelStatus(value,{creating=false}={}){
  return typeof value==='string'&&PERSONNEL_STATUSES.includes(value)&&
    (!creating||value!=='Gekündigt');
}

/**
 * One-time guarded repair for the existing wrongly inserted Mark Clark record.
 * A positional SQL INSERT bug wrote "Hauptberuf" into the status field.
 * Do not touch another occupant of service number 48 or a changed status.
 * The update is transactional, idempotent and recorded in personal_audit.
 */
export async function repairMarkClarkStatus(pool){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await client.query(
      "UPDATE personal SET status='Aktiv'"+
      " WHERE personalnummer=48"+
      " AND lower(btrim(coalesce(vorname,'')))='mark'"+
      " AND lower(btrim(coalesce(nachname,'')))='clark'"+
      " AND status='Hauptberuf'"+
      " AND beschaeftigungsart='Hauptberuf'"+
      " AND administrativ_geloescht_am IS NULL"+
      " RETURNING personalnummer"
    );
    if(result.rowCount===1){
      await client.query(
        'INSERT INTO personal_audit(personalnummer,user_id,aenderungen) VALUES($1,NULL,$2::jsonb)',
        [48,JSON.stringify({status:{alt:'Hauptberuf',neu:'Aktiv'}})]
      );
      await client.query(
        "INSERT INTO log(user_id,aktion,art) VALUES(NULL,$1,'edit')",
        ['Personal 48: ungültigen Status aus Neuanlage korrigiert']
      );
    }
    await client.query('COMMIT');
    if(result.rowCount===1)console.log('IDV: einmalige Personalstatus-Reparatur für DN 48 protokolliert.');
    return result.rowCount===1;
  }catch(err){
    await client.query('ROLLBACK').catch(()=>{});
    throw err;
  }finally{client.release();}
}
