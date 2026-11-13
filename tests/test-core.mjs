import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// load the Wix-independent module through data: import to avoid project module mode confusion.
const text=readFileSync(new URL('../wix-backend/walletCore.js',import.meta.url),'utf8');
const core=await import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
assert.equal(core.extractPassId(' TEST_WALLET_001 '),'TEST_WALLET_001');
assert.equal(core.extractPassId(''),null);

const r={passId:'TEST_WALLET_001',qrValue:'TEST_WALLET_001',holderName:'Persona de prueba',eventName:'BAZTANGO 20',passType:'Canaro +',status:'valid',dateLabel:'26–29 NOVIEMBRE 2026'};
const p=core.mapPass(r,'contact@baztango.test');
assert.equal(p.barcode_message,'TEST_WALLET_001');
assert.equal(p.x402_ready,false);
assert.equal(p.style,'eventTicket');
assert.equal(core.isValidRecord({...r,status:'cancelled'}),false);
assert.equal(core.validProviderUrl('https://walletmcppass.com/download/abc'),true);
assert.equal(core.validProviderUrl('https://walletmcppass.com.evil.org/download/abc'),false);
assert.equal(core.isZip(Buffer.from([0x50,0x4b,0x03,0x04,0x00])),true);
assert.equal(core.limitDayUTC(new Date('2026-11-13T23:59:00Z')),'2026-11-13');
console.log('7 tests OK: QR / payload / status / URL / ZIP / UTC');
