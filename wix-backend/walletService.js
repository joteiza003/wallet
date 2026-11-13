import {randomBytes} from 'crypto';
import wixSecretsBackend from 'wix-secrets-backend';
import { CONFIG, ERRORS, extractPassId, isValidRecord, mapPass, limitDayUTC, errorResult } from 'backend/walletCore';
import {findByQr, save, todayCreatedCount, logResult} from 'backend/walletRepository';
import {createPass} from 'backend/walletProvider';
import {persistPass} from 'backend/walletStorage';

// Operational note: Wix CMS updates are not atomic CAS locks. This MVP performs
// a best-effort guard; before high traffic enable an atomic queue/locking backend.
export async function generateFromQr(rawQr) {
  const qr=extractPassId(rawQr);
  if(!qr) return errorResult('BAD_QR');
  let r;
  try {r=await findByQr(qr);}catch(e){console.error(e);return errorResult('GENERIC');}
  if(!r) return errorResult('NOT_FOUND');
  if(!isValidRecord(r)) return errorResult('INVALID');
  const now=Date.now();
  // Reuse only if persistent file exists or upstream temporary URL has not expired.
  if(r.walletStatus==='generated' && r.downloadToken && (r.mediaFileUrl || (r.providerUrl && new Date(r.providerExpiresAt).getTime()>now+60000))) {
    return {ok:true,state:'ready',downloadPath:`/_functions/walletDownload?token=${encodeURIComponent(r.downloadToken)}`,stored:!!r.mediaFileUrl};
  }
  if(r.walletStatus==='generating' && r.lockUntil && new Date(r.lockUntil).getTime()>now) return errorResult('BUSY');
  const day=limitDayUTC();
  if(await todayCreatedCount(day)>=CONFIG.dailyLimit) return errorResult('LIMIT');
  r.walletStatus='generating'; r.lockUntil=new Date(now+CONFIG.lockMinutes*60000);
  try {
    r=await save(r);
    const contactEmail=await wixSecretsBackend.getSecret('WALLET_CONTACT_EMAIL');
    const resp=await createPass(mapPass(r,contactEmail));
    if(resp.code!=='OK') {
      r.walletStatus='error';r.lockUntil=null;await save(r);
      return errorResult(resp.code);
    }
    const stored=await persistPass(resp.url,r);
    r.walletStatus='generated';
    r.walletSerial=resp.serial;
    r.providerUrl=resp.url;
    r.providerExpiresAt=new Date(resp.expiresAt);
    r.mediaFileUrl=stored.mediaFileUrl;
    r.walletGeneratedAt=new Date();
    r.lockUntil=null;
    // Use a random, non-sequential bearer download token.
    r.downloadToken = r.downloadToken || randomBytes(32).toString('hex');
    await save(r);
    await logResult('created',r.passId,day);
    return {ok:true,state:'ready',downloadPath:`/_functions/walletDownload?token=${encodeURIComponent(r.downloadToken)}`,stored:!!r.mediaFileUrl,expiresAt:stored.mediaFileUrl?null:resp.expiresAt};
  }catch(e){
    console.error('wallet generation failed',e);
    try {r.walletStatus='error';r.lockUntil=null;await save(r);}catch(_ignored){}
    return errorResult('GENERIC');
  }
}
