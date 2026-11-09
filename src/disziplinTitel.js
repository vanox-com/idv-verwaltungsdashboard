/* Read-only presentation enrichment for disciplinary warnings.
 * Generated document titles come from the document registry (authoritative).
 * The slot's original t/sachverhalt must remain unchanged for audit/editing.
 */
export function disziplinTitelErgaenzen(disziplin, dokumente){
 const titles=new Map();
 for(const doc of dokumente||[]){
  if(doc?.typ!=='abmahnung'||!doc?.url||!doc?.titel)continue;
  const nr=Number(doc.personalnummer);
  if(!Number.isSafeInteger(nr)||nr<1)continue;
  titles.set(JSON.stringify([nr,doc.url]),String(doc.titel));
 }
 return (disziplin||[]).map(akte=>({
  ...akte,
  slots:Array.isArray(akte.slots)?akte.slots.map(slot=>{
   if(!slot||!slot.u)return slot;
   const titel=titles.get(JSON.stringify([Number(akte.nr),slot.u]));
   return titel?{...slot,titel}:slot;
  }):akte.slots
 }));
}
