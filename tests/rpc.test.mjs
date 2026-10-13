import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readReceiptData } from '../dist/rpc.mjs';
import { verifyReceipt } from '../dist/core.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/mainnet-payment.json', import.meta.url), 'utf8'));
const expected = JSON.parse(readFileSync(new URL('../dist/example.json', import.meta.url), 'utf8'));
function responses({ primary = fixture.transaction, receipt = fixture.receipt, fallback = fixture.transaction } = {}) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    switch (method) {
      case 'eth_chainId': return fixture.chainId;
      case 'eth_getTransactionByHash': return primary;
      case 'eth_getTransactionReceipt': return receipt;
      case 'eth_getTransactionByBlockHashAndIndex': return fallback;
      case 'eth_getBlockByHash': return fixture.block;
      default: throw new Error('Unexpected RPC method: ' + method);
    }
  };
  return { rpc, calls };
}
test('a pruned transaction hash index falls back to the real block transaction', async () => {
  const { rpc, calls } = responses({ primary: null });
  const data = await readReceiptData(rpc, expected.hash);
  assert.equal(verifyReceipt(data, expected).result, 'matched');
  assert.equal(data.transactionLookup, 'eth_getTransactionByBlockHashAndIndex');
  assert.deepEqual(calls.find(c => c.method === data.transactionLookup).params,
    [fixture.receipt.blockHash, fixture.receipt.transactionIndex]);
});
test('a complete hash lookup does not need a block-index transaction lookup', async () => {
  const { rpc, calls } = responses();
  const data = await readReceiptData(rpc, expected.hash);
  assert.equal(verifyReceipt(data, expected).result, 'matched');
  assert.equal(calls.filter(c => c.method === 'eth_getTransactionByBlockHashAndIndex').length, 0);
});
test('a fallback transaction with a different hash is rejected', async () => {
  const { rpc } = responses({ primary: null, fallback: { ...fixture.transaction, hash: '0x' + 'a'.repeat(64) } });
  const data = await readReceiptData(rpc, expected.hash);
  assert.throws(() => verifyReceipt(data, expected), /hashes do not match/);
});
test('a missing receipt never fabricates a transaction or a payment', async () => {
  const { rpc, calls } = responses({ primary: null, receipt: null });
  await assert.rejects(readReceiptData(rpc, expected.hash), /No final receipt/);
  assert.equal(calls.some(c => c.method === 'eth_getTransactionByBlockHashAndIndex'), false);
});
test('unavailable transaction details and malformed indexes fail without a verdict', async () => {
  const missing = responses({ primary: null, fallback: null });
  await assert.rejects(readReceiptData(missing.rpc, expected.hash), /transaction details are unavailable/);
  const invalid = responses({ primary: null, receipt: { ...fixture.receipt, transactionIndex: 'unexpected' } });
  await assert.rejects(readReceiptData(invalid.rpc, expected.hash), /no valid transaction index/);
  assert.equal(invalid.calls.some(c => c.method === 'eth_getTransactionByBlockHashAndIndex'), false);
});
