import {get} from 'node:https';
const MAX_BYTES=10*1024*1024;
export function allowedBinaryUrl(value){
  try{
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && (!u.port || u.port==='443') &&
      (u.hostname==='walletmcppass.com' && u.pathname.startsWith('/download/') ||
       u.hostname.endsWith('.wixstatic.com') || u.hostname.endsWith('.filesusr.com'));
  }catch{return false;}
}
// wix-fetch solo ofrece text/json: https conserva los bytes originales de la firma.
export async function readBinary(url,redirects=0){
  if(!allowedBinaryUrl(url) || redirects>3)throw new Error('BINARY_URL');
  return new Promise((resolve,reject)=>{
    const request=get(url,res=>{
      if([301,302,303,307,308].includes(res.statusCode)){
        res.resume();
        const next=new URL(res.headers.location||'',url).href;
        readBinary(next,redirects+1).then(resolve,reject);return;
      }
      if(res.statusCode!==200 || Number(res.headers['content-length'])>MAX_BYTES){res.resume();reject(new Error('BINARY_HTTP'));return;}
      let length=0;const chunks=[];
      res.on('data',chunk=>{length+=chunk.length;if(length>MAX_BYTES){request.destroy(new Error('BINARY_SIZE'));return;}chunks.push(chunk);});
      res.on('end',()=>resolve(Buffer.concat(chunks)));
      res.on('error',reject);
      res.on('aborted',()=>reject(new Error('BINARY_ABORTED')));
    });
    request.setTimeout(15000,()=>request.destroy(new Error('BINARY_TIMEOUT')));
    request.on('error',reject);
  });
}
