import wixData from 'wix-data';
import { CONFIG } from 'backend/walletCore';
import {createHash} from 'crypto';
const o = {suppressAuth:true, consistentRead:true};
export async function findByQr(qr) {
  const r = await wixData.query(CONFIG.collection).eq('qrValue',qr).limit(2).find(o);
  return r.items.length === 1 ? r.items[0] : null;
}
export async function getById(id) {return wixData.get(CONFIG.collection,id,o);}
export async function save(record) {return wixData.update(CONFIG.collection,record,o);}
const generationId=id=>'gen-'+createHash('sha256').update(id).digest('hex').slice(0,32);
export async function acquireGeneration(id,owner){
  const key=generationId(id);
  try{await wixData.insert(CONFIG.logCollection,{_id:key,result:'lock',owner,createdAt:new Date()},o);return true;}
  catch(error){if(await wixData.get(CONFIG.logCollection,key,o))return false;throw error;}
}
export async function releaseGeneration(id,owner){
  const key=generationId(id),lock=await wixData.get(CONFIG.logCollection,key,o);
  if(lock?.owner===owner)await wixData.remove(CONFIG.logCollection,key,o);
}
// Insert atómico de cada plaza; los intentos fallidos consumen cuota por prudencia.
export async function reserveQuota(day){
  for(let slot=0;slot<CONFIG.dailyLimit;slot++){
    const key=`quota-${day}-${slot}`;
    try{await wixData.insert(CONFIG.logCollection,{_id:key,result:'reserved',utcDay:day,createdAt:new Date()},o);return true;}
    catch(error){if(!await wixData.get(CONFIG.logCollection,key,o))throw error;}
  }
  return false;
}
export async function logResult(result,passId,day) {
  await wixData.insert(CONFIG.logCollection,{result, passId,utcDay:day,createdAt:new Date()},o);
}
