import {collections} from 'wix-data.v2';
import {elevate} from 'wix-auth';
const text=keys=>keys.split(' ').map(key=>({key,displayName:key,type:'TEXT'}));
const dates=keys=>keys.split(' ').map(key=>({key,displayName:key,type:'DATETIME'}));
const permissions={read:'ADMIN',insert:'ADMIN',update:'ADMIN',remove:'ADMIN'};
export const COLLECTION_SCHEMAS=[
  {_id:'WalletAcceptedReservations',displayName:'WalletAcceptedReservations',permissions,fields:[
    ...text('source sourceEdition reservationId passId qrValue holderName eventName organizationName passType dateLabel sessionLabel venue status backgroundColor foregroundColor labelColor walletStatus walletSerial providerUrl mediaFileUrl downloadToken syncRun'),
    ...dates('relevantDate providerExpiresAt lockUntil walletGeneratedAt sourceSyncedAt'),
  ]},
  {_id:'WalletGenerationLog',displayName:'WalletGenerationLog',permissions,fields:[
    ...text('result passId utcDay owner snapshotId'),...dates('createdAt lockUntil'),
    {key:'expectedCount',displayName:'expectedCount',type:'NUMBER'},
  ]},
];
export async function prepareCollections(){
  const list=await elevate(collections.listDataCollections)({paging:{limit:1000}});
  const present=new Set((list.collections||[]).map(c=>c._id));
  for(const schema of COLLECTION_SCHEMAS){
    if(!present.has(schema._id)){await elevate(collections.createDataCollection)(schema);continue;}
    const current=await elevate(collections.getDataCollection)(schema._id);
    const fields=new Map(current.fields.map(f=>[f.key,f]));
    for(const f of schema.fields){
      if(fields.has(f.key)&&fields.get(f.key).type!==f.type)throw new Error('FIELD_TYPE_MISMATCH');
      if(!fields.has(f.key))fields.set(f.key,f);
    }
    await elevate(collections.updateDataCollection)({...current,fields:[...fields.values()],permissions});
  }
  return COLLECTION_SCHEMAS.map(s=>s._id);
}
