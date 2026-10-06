import {readFileSync,writeFileSync} from 'node:fs';
import {decodeTransfers,format18,verifyReceipt} from './dist/core.mjs';
const data=JSON.parse(readFileSync(new URL('./fixtures/mainnet-payment.json',import.meta.url),'utf8'));
const net=new Map();
for(const t of decodeTransfers(data.receipt.logs).transfers){
  if(t.kind!=='transfer')continue;
  net.set(t.to,(net.get(t.to)||0n)+BigInt(t.raw));
  net.set(t.from,(net.get(t.from)||0n)-BigInt(t.raw));
}
const candidate=[...net].find(([to,amount])=>amount>0n);
if(!candidate)throw new Error('The captured public transaction has no positive net recipient.');
const expected={hash:data.transaction.hash,recipient:candidate[0],amount:format18(candidate[1])};
const verified=verifyReceipt(data,expected);
if(verified.result!=='matched')throw new Error('Mainnet sample did not match.');
writeFileSync(new URL('./dist/example.json',import.meta.url),JSON.stringify({...expected,note:'Public third-party transaction. Not user income.'},null,2)+'\n');
writeFileSync(new URL('./fixtures/mainnet-result.json',import.meta.url),JSON.stringify(verified,null,2)+'\n');
console.log(JSON.stringify({publicTransaction:expected.hash,canonicalTransfers:verified.canonicalTransferCount,excludedMirrors:verified.excludedErc20Logs,matchedAmount:verified.netReceivedAmount,feeUsdc:verified.feeUsdc}));
