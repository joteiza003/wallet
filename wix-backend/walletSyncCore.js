// Contrato privado de sincronización. Ningún dato de pago o contacto es aceptado.
export const PASS_FIELDS = Object.freeze(['source','sourceEdition','reservationId','passId','qrValue',
  'holderName','eventName','organizationName','passType','dateLabel','sessionLabel','venue',
  'relevantDate','status','backgroundColor','foregroundColor','labelColor']);
export function validateItems(items,edition) {
  if(!/^20\d{2}$/.test(edition) || !Array.isArray(items) || items.length>50)throw new Error('BAD_SYNC');
  const seen=new Set();
  for(const r of items){
    if(!r || Object.keys(r).some(k=>!PASS_FIELDS.includes(k)) ||
      Object.values(r).some(v=>typeof v!=='string' || v.length>1000) ||
      r.source!=='baztango-manager' || r.sourceEdition!==edition || r.status!=='valid' ||
      !r.passId?.trim() || r.qrValue!==r.passId || r.qrValue.length>500 ||
      !r.holderName?.trim() || !r.reservationId?.trim() || !r.eventName?.trim() || seen.has(r.passId))throw new Error('BAD_SYNC');
    if(r.relevantDate && !Number.isFinite(Date.parse(r.relevantDate)))throw new Error('BAD_SYNC');
    seen.add(r.passId);
  }
  return items;
}
export function recordsMatch(a,b){return PASS_FIELDS.every(k=>(a[k]||'')===(b[k]||''));}
export function mergeRecord(previous,item,run){
  const same=previous && recordsMatch(previous,item);
  const next={...previous,...Object.fromEntries(PASS_FIELDS.map(k=>[k,item[k]||null])),syncRun:run,sourceSyncedAt:new Date()};
  if(!same)Object.assign(next,{walletStatus:'pending',downloadToken:null,mediaFileUrl:null,
    providerUrl:null,providerExpiresAt:null,walletSerial:null,walletGeneratedAt:null,lockUntil:null});
  return next;
}
