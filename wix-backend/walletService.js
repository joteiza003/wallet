import {randomBytes} from 'crypto';
import {isValidRecord,extractPassId,mapPass,limitDayUTC,errorResult} from 'backend/walletCore';
import {recordsMatch} from 'backend/walletSyncCore';
import {findByQr,getById,save,acquireGeneration,releaseGeneration,reserveQuota,logResult} from 'backend/walletRepository';
import {createPass} from 'backend/walletProvider';
import {persistPass} from 'backend/walletStorage';

function cached(r){
  return r.walletStatus==='generated' && /^[a-f0-9]{64}$/.test(r.downloadToken||'') &&
    (r.mediaFileUrl || r.providerUrl && new Date(r.providerExpiresAt).getTime()>Date.now()+60000);
}
function ready(r){return {ok:true,state:'ready',downloadPath:`/_functions/walletDownload?token=${r.downloadToken}`,
  stored:!!r.mediaFileUrl,expiresAt:r.mediaFileUrl?null:r.providerExpiresAt};}

export async function generateFromQr(rawQr){
  const qr=extractPassId(rawQr);
  if(!qr)return errorResult('BAD_QR');
  let r,owner,locked=false;
  try{
    r=await findByQr(qr);
    if(!r)return errorResult('NOT_FOUND');
    if(!isValidRecord(r))return errorResult('INVALID');
    if(cached(r))return ready(r);
    owner=randomBytes(16).toString('hex');
    locked=await acquireGeneration(r._id,owner);
    if(!locked)return errorResult('BUSY');
    r=await getById(r._id);
    if(!isValidRecord(r))return errorResult('INVALID');
    if(cached(r))return ready(r);
    const contact='baztangoinfo@gmail.com';
    const payload=mapPass(r,contact);
    const day=limitDayUTC();
    if(!await reserveQuota(day))return errorResult('LIMIT');
    const result=await createPass(payload);
    if(result.code!=='OK')return errorResult(result.code);
    const stored=await persistPass(result.url,r);
    const current=await getById(r._id);
    if(!isValidRecord(current)||!recordsMatch(r,current))return errorResult('INVALID');
    const next={...current,walletStatus:'generated',walletSerial:result.serial,providerUrl:result.url,
      providerExpiresAt:new Date(result.expiresAt),mediaFileUrl:stored.mediaFileUrl,
      walletGeneratedAt:new Date(),downloadToken:randomBytes(32).toString('hex')};
    await save(next);
    await logResult('created',r.passId,day);
    return ready(next);
  }catch(_error){
    console.error('wallet generation failed');
    return errorResult('GENERIC');
  }finally{
    if(locked)try{await releaseGeneration(r._id,owner);}catch{console.error('wallet lock release failed');}
  }
}
