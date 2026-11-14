import wixData from 'wix-data';
import {createHash,timingSafeEqual} from 'crypto';
import wixSecretsBackend from 'wix-secrets-backend';
import {response} from 'wix-http-functions';
import {CONFIG} from 'backend/walletCore';
import {validateItems,mergeRecord} from 'backend/walletSyncCore';
import {prepareCollections} from 'backend/walletCollections';
import {acquireGeneration,releaseGeneration} from 'backend/walletRepository';
const options={suppressAuth:true,suppressHooks:true,consistentRead:true};
const reply=(status,data)=>response({status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
const stableId=(edition,id)=>createHash('sha256').update(JSON.stringify([edition,id])).digest('hex').slice(0,32);
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}

// Solo servidor-a-servidor. Reutiliza el secreto ya instalado para Manager.
export async function syncRequest(request){
  let stage='authorization';
  try{
    const supplied=/^Bearer (.+)$/i.exec(request.headers?.authorization||request.headers?.Authorization||'')?.[1]||'';
    const expected=await wixSecretsBackend.getSecret('baztango-reservations-export-token');
    if(!supplied || !expected || !equal(supplied,expected))return reply(403,{ok:false});
    stage='body';
    const body=await request.body.json();
    if(!body || JSON.stringify(body).length>750000)return reply(413,{ok:false});
    const {edition,snapshotId,action}=body;
    if(!/^20\d{2}$/.test(edition) || !/^[a-f0-9]{64}$/.test(snapshotId))return reply(400,{ok:false});
    if(action==='prepare'){stage='prepare';return reply(200,{ok:true,collections:await prepareCollections()});}
    stage='lock';
    const lockId='sync-'+edition;
    let lock=await wixData.get(CONFIG.logCollection,lockId,options);
    if(action==='begin'){
      if(!Number.isInteger(body.count)||body.count<0||body.count>5000)return reply(400,{ok:false});
      if(lock && lock.snapshotId!==snapshotId && new Date(lock.lockUntil).getTime()>Date.now())return reply(409,{ok:false});
      const next={_id:lockId,snapshotId,expectedCount:body.count,lockUntil:new Date(Date.now()+15*60000),result:'sync',utcDay:''};
      // insert evita que dos clientes empiecen simultáneamente una edición nueva.
      if(lock)await wixData.update(CONFIG.logCollection,next,options);
      else await wixData.insert(CONFIG.logCollection,next,options);
      return reply(200,{ok:true});
    }
    if(!lock || lock.snapshotId!==snapshotId || new Date(lock.lockUntil).getTime()<Date.now())return reply(409,{ok:false});
    if(action==='upsert'){
      const items=validateItems(body.items,edition);
      for(const item of items){
        const id=stableId(edition,item.passId);
        if(!await acquireGeneration(id,snapshotId))return reply(409,{ok:false});
        try{
          const previous=await wixData.get(CONFIG.collection,id,options);
          const record={...mergeRecord(previous,item,snapshotId),_id:id};
          if(previous)await wixData.update(CONFIG.collection,record,options);
          else await wixData.insert(CONFIG.collection,record,options);
        }finally{await releaseGeneration(id,snapshotId);}
      }
      return reply(200,{ok:true,count:items.length});
    }
    if(action==='finish'){
      const ids=body.passIds;
      if(!Array.isArray(ids)||ids.length!==lock.expectedCount||new Set(ids).size!==ids.length || ids.some(id=>typeof id!=='string'||!id||id.length>500))return reply(400,{ok:false});
      // No revocar nada si falta un lote: se puede reanudar el mismo snapshot.
      const current=[];
      let page=await wixData.query(CONFIG.collection).eq('source','baztango-manager').eq('sourceEdition',edition).limit(1000).find(options);
      current.push(...page.items);
      while(page.hasNext()){page=await page.next();current.push(...page.items);}
      const expectedIds=new Set(ids);
      const applied=new Set(current.filter(r=>r.syncRun===snapshotId && r.status==='valid').map(r=>r.passId));
      if(ids.some(id=>!applied.has(id)))return reply(409,{ok:false});
      let revoked=0;
      for(const r of current){
        if(!expectedIds.has(r.passId) && r.status!=='cancelled'){
          if(!await acquireGeneration(r._id,snapshotId))return reply(409,{ok:false});
          try{
            const fresh=await wixData.get(CONFIG.collection,r._id,options);
            await wixData.update(CONFIG.collection,{...fresh,status:'cancelled',walletStatus:'pending',downloadToken:null,
              mediaFileUrl:null,providerUrl:null,providerExpiresAt:null,lockUntil:null},options);
          }finally{await releaseGeneration(r._id,snapshotId);}
          revoked++;
        }
      }
      // Conservar manifiesto completado permite repetir finish tras un timeout.
      await wixData.update(CONFIG.logCollection,{...lock,result:'synced',lockUntil:new Date(Date.now()+60000)},options);
      return reply(200,{ok:true,active:ids.length,revoked});
    }
    return reply(400,{ok:false});
  }catch(error){console.error('walletSync failed at '+stage+': '+String(error?.message||error));return reply(500,{ok:false,code:'SYNC_FAILED',stage});}
}
