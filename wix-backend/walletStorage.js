import { mediaManager } from 'wix-media-backend';
import { fetch } from 'wix-fetch';
import {fetchPass} from 'backend/walletProvider';
// Store original signed bytes rather than regenerate when a visitor returns.
// Wix Media Manager support for custom pkpass MIME must be tested on the target site.
export async function persistPass(providerUrl,record) {
  const buffer=await fetchPass(providerUrl);
  try {
    const file=await mediaManager.upload('/wallet-passes',buffer,`pass-${record._id}.pkpass`,{
      mediaOptions:{mimeType:'application/vnd.apple.pkpass',mediaType:'document'},
      metadataOptions:{isPrivate:true,isVisitorUpload:false},
    });
    return {mediaFileUrl:file.fileUrl,bytes:buffer.length};
  } catch(e) {
    console.error('Wix media storage unavailable for pkpass',e);
    // Short-lived provider copy is still valid. Never falsely claim permanent storage.
    return {mediaFileUrl:'',bytes:buffer.length};
  }
}
export async function downloadStored(mediaFileUrl) {
  const url=await mediaManager.getDownloadUrl(mediaFileUrl);
  const res=await fetch(url);
  if(!res.ok)throw new Error('Wix media download failed');
  return Buffer.from(await res.arrayBuffer());
}
