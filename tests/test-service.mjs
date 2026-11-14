import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
async function service(overrides={}){
 const coreText=readFileSync(new URL('../wix-backend/walletCore.js',import.meta.url),'utf8');
 const core=await import('data:text/javascript;base64,'+Buffer.from(coreText).toString('base64'));
 const syncText=readFileSync(new URL('../wix-backend/walletSyncCore.js',import.meta.url),'utf8');
 const sync=await import('data:text/javascript;base64,'+Buffer.from(syncText).toString('base64'));
 let record={_id:'id',source:'baztango-manager',status:'valid',qrValue:'R1_1',passId:'R1_1',holderName:'Prueba'};
 let calls=0;
 const mocks={
  crypto:{randomBytes},'wix-secrets-backend':{default:{getSecret:async()=> 'organizer@real-domain.com'}},
  'backend/walletCore':core,'backend/walletSyncCore':sync,
  'backend/walletRepository':{
   findByQr:async()=>({...record}),getById:async()=>({...record}),save:async r=>record={...r},
   acquireGeneration:async()=>true,releaseGeneration:async()=>{},reserveQuota:async()=>true,
   todayCreatedCount:async()=>0,
   logResult:async()=>{},...overrides.repository,
  },
  'backend/walletProvider':{createPass:async()=>{calls++;if(overrides.cancel)record.status='cancelled';return {code:'OK',url:'https://walletmcppass.com/download/a',serial:'one',expiresAt:'2099-01-01'};}},
  'backend/walletStorage':{persistPass:async()=>({mediaFileUrl:'private'})},
 };
 const context=vm.createContext({Buffer,console,Date,URL});
 const module=new vm.SourceTextModule(readFileSync(new URL('../wix-backend/walletService.js',import.meta.url),'utf8'),{context});
 await module.link(async name=>{
   const values=mocks[name];if(!values)throw new Error('Unmocked import '+name);
   return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
 });
 await module.evaluate();
 return {generate:()=>module.namespace.generateFromQr('R1_1'),get record(){return record;},get calls(){return calls;}};
}
test('generates accepted records and reuses current pass without a second provider call',async()=>{
 const s=await service();assert.equal((await s.generate()).ok,true);assert.equal((await s.generate()).ok,true);assert.equal(s.calls,1);
});
test('fails closed if cancelled while provider is generating',async()=>{
 const s=await service({cancel:true});assert.equal((await s.generate()).ok,false);assert.equal(s.record.status,'cancelled');assert.equal(s.record.downloadToken,undefined);
});
test('lock and quota denial never call provider',async()=>{
 for(const repository of [{acquireGeneration:async()=>false},{reserveQuota:async()=>false}]){
  const s=await service({repository});assert.equal((await s.generate()).ok,false);assert.equal(s.calls,0);
 }
});
