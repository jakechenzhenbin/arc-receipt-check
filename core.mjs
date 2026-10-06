export const CHAIN_ID = 5042;
export const RPC_URL = 'https://rpc.mainnet.arc.io';
export const SYSTEM_EMITTER = '0xfffffffffffffffffffffffffffffffffffffffe';
export const ERC20_EMITTER = '0x3600000000000000000000000000000000000000';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = '0x0000000000000000000000000000000000000000';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const WORD = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]+$/;

export function address(value) {
  const s = String(value || '').trim();
  if (!ADDRESS.test(s) || s.toLowerCase() === ZERO) throw new Error('Enter a non-zero 0x wallet address (40 hex characters).');
  return s.toLowerCase();
}
export function hash(value) {
  const s = String(value || '').trim();
  if (!HASH.test(s)) throw new Error('Enter a full transaction hash (0x + 64 hex characters).');
  return s.toLowerCase();
}
export function units18(value) {
  const s = String(value).trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(s) || s.length > 98) throw new Error('Enter a positive USDC amount with up to 18 decimal places.');
  const [whole, fractional = ''] = s.split('.');
  const units = BigInt(whole) * 10n ** 18n + BigInt(fractional.padEnd(18, '0'));
  if (units <= 0n || units > (2n ** 256n - 1n)) throw new Error('The expected amount must be positive and fit uint256.');
  return units;
}
export function format18(value) {
  const n = BigInt(value);
  const sign = n < 0n ? '-' : '';
  const magnitude = n < 0n ? -n : n;
  const fraction = (magnitude % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return sign + (magnitude / 10n ** 18n).toString() + (fraction ? '.' + fraction : '');
}
function hexNumber(value, label) {
  if (!HEX.test(value || '')) throw new Error('Missing or invalid ' + label + ' in RPC response.');
  return BigInt(value);
}
function topicAddress(value) {
  if (!WORD.test(value || '') || !/^0x0{24}/i.test(value)) throw new Error('Malformed USDC transfer address in receipt.');
  return '0x' + value.slice(-40).toLowerCase();
}
export function decodeTransfers(logs) {
  if (!Array.isArray(logs)) throw new Error('Receipt has no valid log list.');
  const transfers = [];
  const seen = new Set();
  let erc20Logs = 0;
  for (const log of logs) {
    const emitter = String(log.address || '').toLowerCase();
    if (String(log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if (emitter === ERC20_EMITTER) erc20Logs++;
    if (emitter !== SYSTEM_EMITTER) continue;
    if (log.removed || log.topics.length !== 3 || !WORD.test(log.data || '')) throw new Error('Malformed or removed native USDC transfer log.');
    const logIndex = hexNumber(log.logIndex, 'log index').toString();
    if (seen.has(logIndex)) throw new Error('RPC receipt contains duplicate native log indexes.');
    seen.add(logIndex);
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    const raw = BigInt(log.data);
    transfers.push({ from, to, raw: raw.toString(), amount: format18(raw), logIndex,
      kind: from === ZERO ? 'mint' : to === ZERO ? 'burn' : from === to ? 'self' : 'transfer' });
  }
  if (erc20Logs && !transfers.length) throw new Error('ERC-20 logs are present but native system logs are missing. Unable to verify complete USDC movements.');
  return { transfers, erc20Logs };
}

export function verifyReceipt(data, expected) {
  const { transaction: tx, receipt, block } = data;
  const recipient = address(expected.recipient);
  const required = units18(expected.amount);
  const txHash = hash(expected.hash);
  if (hexNumber(data.chainId, 'chain ID') !== BigInt(CHAIN_ID)) throw new Error('This RPC is not Arc Mainnet (5042).');
  if (!tx || !receipt || !block) throw new Error('Transaction is pending or not found. A final receipt and block are required.');
  if (tx.chainId && hexNumber(tx.chainId, 'transaction chain ID') !== BigInt(CHAIN_ID)) throw new Error('Transaction chain mismatch.');
  if (hash(tx.hash) !== txHash || hash(receipt.transactionHash) !== txHash) throw new Error('Transaction and receipt hashes do not match the request.');
  if (hash(tx.blockHash) !== hash(block.hash) || hash(receipt.blockHash) !== hash(block.hash)
      || hexNumber(tx.blockNumber, 'transaction block') !== hexNumber(block.number, 'block number')
      || hexNumber(receipt.blockNumber, 'receipt block') !== hexNumber(block.number, 'block number')) throw new Error('Receipt does not match the final block.');
  const status = hexNumber(receipt.status, 'execution status');
  if (status !== 0n && status !== 1n) throw new Error('Unexpected execution status.');
  const fee = hexNumber(receipt.gasUsed, 'gas used') * hexNumber(receipt.effectiveGasPrice, 'effective gas price');
  const decoded = status === 1n ? decodeTransfers(receipt.logs) : { transfers: [], erc20Logs: 0 };
  if (status === 1n && hexNumber(tx.value, 'native value') > 0n && !decoded.transfers.length) throw new Error('Native value was sent but system transfer evidence is missing.');
  let incoming = 0n, outgoing = 0n;
  for (const transfer of decoded.transfers) {
    // Mints, burns, self-transfers are not invoice payments. Contract forwarding
    // is included, but funds forwarded out of the payee are deducted.
    if (transfer.kind !== 'transfer') continue;
    if (transfer.to === recipient) incoming += BigInt(transfer.raw);
    if (transfer.from === recipient) outgoing += BigInt(transfer.raw);
  }
  const net = incoming - outgoing;
  const result = status !== 1n ? 'failed' : net <= 0n ? 'no-payment' : net < required ? 'underpaid' : net === required ? 'matched' : 'overpaid';
  const timestamp = Number(hexNumber(block.timestamp, 'block timestamp'));
  if (!Number.isSafeInteger(timestamp)) throw new Error('Invalid block timestamp.');
  return {
    schema: 'arc-receipt-check/v1', chainId: CHAIN_ID, source: RPC_URL,
    checkedAt: new Date().toISOString(), transactionHash: txHash,
    blockHash: block.hash, blockNumber: hexNumber(block.number, 'block number').toString(),
    blockTime: new Date(timestamp * 1000).toISOString(), execution: status === 1n ? 'success' : 'failed',
    result, recipient, expectedAmount: format18(required), receivedAmount: format18(incoming),
    outgoingAmount: format18(outgoing), netReceivedAmount: format18(net), feeUsdc: format18(fee),
    invoiceReference: String(expected.reference || '').slice(0, 120),
    canonicalTransferCount: decoded.transfers.length, excludedErc20Logs: decoded.erc20Logs,
    transfers: decoded.transfers, explorerUrl: 'https://explorer.arc.io/tx/' + txHash,
    notes: [
      'Only native system Transfer logs (18 decimals) are counted. ERC-20 mirror logs and gas are excluded from received amount.',
      'The invoice reference is a local label, not an on-chain payment identifier. A transaction can be reused; reconcile invoice allocation separately.',
      'This is a read-only RPC check, not a signed attestation or tax invoice. Identity of the payer is not authenticated.',
      'Net explicit transfers to the recipient are checked. RPC truth, off-chain agreements, and any unrelated balance changes are outside this check.'
    ]
  };
}
