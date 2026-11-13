import wixData from 'wix-data';
import { CONFIG } from 'backend/walletCore';
const o = {suppressAuth:true, consistentRead:true};
export async function findByQr(qr) {
  const r = await wixData.query(CONFIG.collection).eq('qrValue',qr).limit(2).find(o);
  return r.items.length === 1 ? r.items[0] : null;
}
export async function getById(id) {return wixData.get(CONFIG.collection,id,o);}
export async function save(record) {return wixData.update(CONFIG.collection,record,o);}
export async function todayCreatedCount(day) {
  // Only completed generations count toward the local quota.
  return wixData.query(CONFIG.logCollection).eq('utcDay',day).eq('result','created').count(o);
}
export async function logResult(result,passId,day) {
  await wixData.insert(CONFIG.logCollection,{result, passId,utcDay:day,createdAt:new Date()},o);
}
