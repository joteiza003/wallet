import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../wix-backend/walletBinary.js',import.meta.url),'utf8');
const {allowedBinaryUrl,readBinary}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('only HTTPS provider and Wix CDN allowed, no credentials or lookalike domains',()=>{
 for(const url of ['https://walletmcppass.com/download/a','https://abc.filesusr.com/a','https://static.wixstatic.com/a'])assert.equal(allowedBinaryUrl(url),true);
 for(const url of ['http://walletmcppass.com/download/a','https://walletmcppass.com.evil.test/a','https://me:secret@walletmcppass.com/download/a','https://localhost/a'])assert.equal(allowedBinaryUrl(url),false);
});
test('binary fetch rejects untrusted URL before network',async()=>assert.rejects(readBinary('https://evil.test/a')));
