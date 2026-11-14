import { fetch } from 'wix-fetch';
import { CONFIG, validProviderUrl, isZip } from 'backend/walletCore';
import {readBinary} from 'backend/walletBinary';
export async function createPass(payload) {
  const res = await fetch(CONFIG.providerUrl, {method:'post',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if (res.status === 402 || res.status === 429) return {code:'LIMIT'};
  if (!res.ok) {console.error('wallet provider error status',res.status);return {code:'GENERIC'};}
  const json = await res.json();
  if (!validProviderUrl(json.download_url)) return {code:'GENERIC'};
  const lifetime=Number(json.expires_in_seconds||3600);
  if(!Number.isFinite(lifetime)||lifetime<=0)return {code:'GENERIC'};
  return {code:'OK', url:json.download_url, serial:json.serial_number, expiresAt:new Date(Date.now()+Math.min(lifetime,3600)*1000).toISOString()};
}
export async function fetchPass(url) {
  if (!validProviderUrl(url)) throw new Error('Invalid provider URL');
  const buf = await readBinary(url);
  if(!isZip(buf) || buf.length > 10*1024*1024) throw new Error('Not a valid small ZIP pkpass');
  return buf;
}
