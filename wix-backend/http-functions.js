// Merge these exports into Wix Studio's backend/http-functions.js.
// GitHub Pages is static. Wix is the only gateway to its private CMS and wallet-mcp.
import {response} from 'wix-http-functions';
import wixData from 'wix-data';
import {generateFromQr} from 'backend/walletService';
import {CONFIG,isZip,isValidRecord} from 'backend/walletCore';
import {fetchPass} from 'backend/walletProvider';
import {downloadStored} from 'backend/walletStorage';
import {syncRequest} from 'backend/walletSync';

// SECURITY: set this to the exact published origin (no path or trailing slash).
// For username.github.io/repo use https://username.github.io
// For custom domain use https://wallet.yourdomain.com
const ALLOWED_ORIGIN = 'https://joteiza003.github.io';
const headers = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type',
  'Vary':'Origin',
  'Cache-Control':'no-store',
};
function json(status,obj){return response({status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify(obj)});}
function originAllowed(request){return request.headers?.origin===ALLOWED_ORIGIN;}

export function options_walletGenerate(request) {
  if(!originAllowed(request)) return response({status:403,headers:{'Vary':'Origin'},body:''});
  return response({status:204,headers:{...headers,'Access-Control-Max-Age':'600'},body:''});
}
export const post_walletSync = syncRequest;
export async function post_walletGenerate(request) {
  if(!originAllowed(request))return json(403,{ok:false,code:'ORIGIN',message:'Origen no autorizado.'});
  try{
    const body=await request.body.json();
    if(!body || typeof body.qr!=='string' || body.qr.length>500)return json(400,{ok:false,code:'BAD_QR',message:'QR inválido.'});
    const r=await generateFromQr(body.qr);
    if(r.ok) {
      // Absolute Wix URL, so clients never need credentials or a provider URL.
      // request.headers.host might be untrusted: fixed hostname below.
      const BASE='https://www.joseba-bakartxo.com';
      return json(200,{ok:true,downloadUrl:BASE+r.downloadPath,stored:r.stored,expiresAt:r.expiresAt||null});
    }
    return json(r.code==='LIMIT'?429:r.code==='NOT_FOUND'?404:r.code==='BUSY'?409:400,r);
  }catch(err){console.error('walletGenerate failed');return json(500,{ok:false,code:'GENERIC',message:'No se pudo generar la entrada.'});}
}
export async function get_walletDownload(request) {
  const token=String(request.query?.token||'');
  if(!/^[a-f0-9]{64}$/.test(token))return response({status:400,body:'Enlace inválido'});
  const found=await wixData.query(CONFIG.collection).eq('downloadToken',token).limit(1).find({suppressAuth:true,consistentRead:true});
  const pass=found.items[0];
  if(!isValidRecord(pass) || pass.walletStatus!=='generated')return response({status:404,body:'Pase no disponible'});
  try{
    let bytes;
    if(pass.mediaFileUrl)bytes=await downloadStored(pass.mediaFileUrl);
    else if(pass.providerUrl && new Date(pass.providerExpiresAt).getTime()>Date.now())bytes=await fetchPass(pass.providerUrl);
    else return response({status:410,body:'El pase ha caducado. Solicita su regeneración.'});
    if(!isZip(bytes))throw new Error('Invalid pkpass zip');
    const current=await wixData.get(CONFIG.collection,pass._id,{suppressAuth:true,consistentRead:true});
    if(!isValidRecord(current)||current.downloadToken!==token)return response({status:410,body:'El pase ha cambiado. Solicita uno actualizado.'});
    return response({status:200,headers:{
      'Content-Type':'application/vnd.apple.pkpass',
      'Content-Disposition':'inline; filename="entrada-baztango.pkpass"',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    },body:bytes});
  }catch(err){console.error('walletDownload failed');return response({status:500,body:'No se pudo preparar el archivo'});}
}
