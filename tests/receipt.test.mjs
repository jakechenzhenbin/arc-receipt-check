import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyReceipt,units18,format18,SYSTEM_EMITTER,ERC20_EMITTER,TRANSFER_TOPIC} from '../dist/core.mjs';
const A='0x1111111111111111111111111111111111111111', B='0x2222222222222222222222222222222222222222';
const C='0x3333333333333333333333333333333333333333', ZERO='0x'+'0'.repeat(40);
const HASH='0x'+'a'.repeat(64), BLOCK='0x'+'b'.repeat(64);
const hex=n=>'0x'+BigInt(n).toString(16);
const topic=a=>'0x'+a.slice(2).padStart(64,'0');
function log(from,to,amount,index=0,emitter=SYSTEM_EMITTER){return {address:emitter,topics:[TRANSFER_TOPIC,topic(from),topic(to)],data:'0x'+BigInt(amount).toString(16).padStart(64,'0'),logIndex:hex(index)};}
function raw(logs=[log(A,B,units18('20'))]){return {chainId:'0x13b2',transaction:{hash:HASH,chainId:'0x13b2',blockHash:BLOCK,blockNumber:'0x1',value:'0x0'},receipt:{transactionHash:HASH,blockHash:BLOCK,blockNumber:'0x1',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x4a817c800',logs},block:{hash:BLOCK,number:'0x1',timestamp:'0x6ac00000'}};}
const expected={hash:HASH,recipient:B,amount:'20'};
test('real mainnet receipt matches and excludes ERC-20 mirror logs',()=>{
 const d=JSON.parse(readFileSync(new URL('../fixtures/mainnet-payment.json',import.meta.url),'utf8'));
 const e=JSON.parse(readFileSync(new URL('../dist/example.json',import.meta.url),'utf8'));
 const r=verifyReceipt(d,e);
 assert.equal(r.result,'matched');assert.ok(r.excludedErc20Logs>0);assert.equal(r.netReceivedAmount,e.amount);
});
test('two representations of one 20 USDC transfer count once',()=>{
 const r=verifyReceipt(raw([log(A,B,units18('20')),log(A,B,20000000n,1,ERC20_EMITTER)]),expected);
 assert.equal(r.netReceivedAmount,'20');assert.equal(r.result,'matched');assert.equal(r.excludedErc20Logs,1);
});
test('sub-six-decimal native precision is preserved exactly',()=>{
 const amount='20.000000000000000001';const r=verifyReceipt(raw([log(A,B,units18(amount))]),{...expected,amount});
 assert.equal(r.netReceivedAmount,amount);assert.equal(format18(units18(amount)),amount);
});
test('fake token transfer with standard topic is never treated as USDC',()=>{
 const r=verifyReceipt(raw([log(A,B,units18('20'),0,C)]),expected);assert.equal(r.result,'no-payment');
});
test('successful payment to the wrong address does not pass',()=>{
 assert.equal(verifyReceipt(raw(),{...expected,recipient:C}).result,'no-payment');
});
test('underpayment and overpayment remain distinct from an exact match',()=>{
 assert.equal(verifyReceipt(raw([log(A,B,units18('19.999999'))]),expected).result,'underpaid');
 assert.equal(verifyReceipt(raw([log(A,B,units18('20.000001'))]),expected).result,'overpaid');
});
test('receipt gas is separate from the expected recipient credit',()=>{
 const r=verifyReceipt(raw(),expected);assert.equal(r.netReceivedAmount,'20');assert.equal(r.feeUsdc,'0.00042');
});
test('a recipient forwarding the funds does not retain the payment',()=>{
 const r=verifyReceipt(raw([log(A,B,units18('20')),log(B,C,units18('20'),1)]),expected);
 assert.equal(r.netReceivedAmount,'0');assert.equal(r.result,'no-payment');
});
test('mint, burn and self-transfer logs are not invoice payments',()=>{
 const r=verifyReceipt(raw([log(ZERO,B,units18('20')),log(B,ZERO,units18('5'),1),log(B,B,units18('20'),2)]),expected);
 assert.equal(r.result,'no-payment');
});
test('failed transactions do not verify even with misleading movement logs',()=>{
 const d=raw();d.receipt.status='0x0';assert.equal(verifyReceipt(d,expected).result,'failed');
});
test('missing native logs cannot be reconstructed by adding ERC-20 events',()=>{
 assert.throws(()=>verifyReceipt(raw([log(A,B,20000000n,0,ERC20_EMITTER)]),expected),/system logs are missing/);
});
test('chain, receipt hash and final block mismatches are rejected',()=>{
 const d=raw();d.chainId='0x1';assert.throws(()=>verifyReceipt(d,expected),/not Arc/);
 const e=raw();e.receipt.transactionHash=BLOCK;assert.throws(()=>verifyReceipt(e,expected),/hashes do not match/);
 const f=raw();f.block.hash=HASH;assert.throws(()=>verifyReceipt(f,expected),/final block/);
});
test('pending or absent receipt never yields a payment verdict',()=>{
 const d=raw();d.receipt=null;assert.throws(()=>verifyReceipt(d,expected),/pending or not found/);
});
test('duplicate native log indexes are rejected rather than counted twice',()=>{
 assert.throws(()=>verifyReceipt(raw([log(A,B,units18('20')),log(A,B,units18('20'))]),expected),/duplicate/);
});
test('removed and malformed canonical logs are rejected',()=>{
 const l=log(A,B,units18('20'));l.removed=true;assert.throws(()=>verifyReceipt(raw([l]),expected),/removed/);
 const m=log(A,B,units18('20'));m.topics[1]='0x'+'f'.repeat(64);assert.throws(()=>verifyReceipt(raw([m]),expected),/Malformed/);
});
test('non-positive, exponent, excessive precision and uint256 overflow amounts are rejected',()=>{
 for(const amount of ['0','-1','1e3','20.0000000000000000001','0x20','1,000',('9'.repeat(90))])assert.throws(()=>units18(amount));
});
