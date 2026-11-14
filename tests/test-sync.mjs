import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const source=readFileSync(new URL('../wix-backend/walletSyncCore.js',import.meta.url),'utf8');
const {validateItems,mergeRecord,recordsMatch}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const item={passId:'R1_1',qrValue:'R1_1',holderName:'Persona de prueba',eventName:'BAZTANGO 20',passType:'Canaro',sourceEdition:'2026',reservationId:'R1',status:'valid',source:'baztango-manager'};
test('accepted without payment or ticket fields are eligible',()=>assert.equal(validateItems([item],'2026').length,1));
test('rejects duplicates, cancelled, wrong edition and unknown fields',()=>{
 assert.throws(()=>validateItems([item,item],'2026'));
 for(const patch of [{status:'cancelled'},{sourceEdition:'2025'},{email:'private@example.com'},{holderName:''}])
  assert.throws(()=>validateItems([{...item,...patch}],'2026'));
});
test('identical sync preserves cached pass; changed holder invalidates it',()=>{
 const previous={...item,_id:'stable',walletStatus:'generated',downloadToken:'secret',mediaFileUrl:'private'};
 assert.equal(recordsMatch(previous,item),true);
 assert.equal(mergeRecord(previous,item,'run').downloadToken,'secret');
 const changed=mergeRecord(previous,{...item,holderName:'Nuevo titular'},'run');
 assert.equal(changed._id,'stable');
 assert.equal(changed.downloadToken,null);
 assert.equal(changed.mediaFileUrl,null);
 assert.equal(changed.walletStatus,'pending');
});
