import { CHAIN_ID, hash } from './core.mjs';

export async function readReceiptData(rpc, requestedHash) {
  const txHash = hash(requestedHash);
  const chainId = await rpc('eth_chainId', []);
  if (BigInt(chainId) !== BigInt(CHAIN_ID)) throw new Error('The endpoint is not Arc Mainnet (5042).');
  const [byHash, receipt] = await Promise.all([
    rpc('eth_getTransactionByHash', [txHash]),
    rpc('eth_getTransactionReceipt', [txHash])
  ]);
  if (!receipt) throw new Error('No final receipt was found on Arc Mainnet. The transaction may be pending, missing, or on another network.');
  const blockHash = hash(receipt.blockHash);
  let transaction = byHash;
  let transactionLookup = 'eth_getTransactionByHash';
  if (!transaction) {
    // Some nodes retain historical receipts and blocks but prune the hash index.
    // Fetch the real transaction from its block; never reconstruct its fields.
    if (!/^0x[0-9a-fA-F]+$/.test(receipt.transactionIndex || '')) throw new Error('The receipt has no valid transaction index.');
    transaction = await rpc('eth_getTransactionByBlockHashAndIndex', [blockHash, receipt.transactionIndex]);
    transactionLookup = 'eth_getTransactionByBlockHashAndIndex';
  }
  if (!transaction) throw new Error('The receipt exists, but transaction details are unavailable from this RPC. No payment conclusion can be made.');
  const block = await rpc('eth_getBlockByHash', [blockHash, false]);
  return { chainId, transaction, receipt, block, transactionLookup };
}
