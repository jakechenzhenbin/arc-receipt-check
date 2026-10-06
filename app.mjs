import { RPC_URL, hash, address, units18, verifyReceipt } from './core.mjs';
const $ = id => document.getElementById(id);
let evidence = null, busy = false, requestId = 0;
const states = ['empty', 'loading', 'error', 'result'];
function setState(state) {
  for (const name of states) $(name + '-state').hidden = name !== state;
  $('receipt-panel').setAttribute('aria-busy', String(state === 'loading'));
}
async function rpc(method, params) {
  // Only fixed read-only methods and the public mainnet endpoint are used.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(RPC_URL, {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({jsonrpc:'2.0',id:++requestId,method,params}), signal:controller.signal});
      if (!response.ok) throw new Error('Arc RPC returned HTTP ' + response.status + '.');
      const data = await response.json();
      if (data.error) throw new Error('Arc RPC: ' + (data.error.message || 'request failed'));
      if (!Object.hasOwn(data,'result')) throw new Error('Arc RPC returned no result.');
      return data.result;
    } catch (error) {
      if (attempt === 1) {
        if (error.name === 'AbortError') throw new Error('The mainnet request timed out. Try again later.');
        if (error instanceof TypeError) throw new Error('Could not reach Arc Mainnet. Check your connection and try again.');
        throw error;
      }
    } finally { clearTimeout(timer); }
  }
}
function fact(label,value) {
  const row = document.createElement('div'); row.className = 'fact-row';
  const dt = document.createElement('dt'); dt.textContent = label;
  const dd = document.createElement('dd'); dd.textContent = value;
  row.append(dt,dd); $('facts').append(row);
}
function render(result) {
  const labels = {matched:'Amount matched',overpaid:'More than expected',underpaid:'Less than expected','no-payment':'No payment to recipient',failed:'Transaction failed'};
  const details = {matched:'The net explicit USDC credit equals the expected amount.',overpaid:'The recipient received more than the expected amount. Check the allocation before closing the invoice.',underpaid:'The recipient received less than the expected amount.', 'no-payment':'This transaction does not show a positive net payment to the expected recipient.',failed:'Execution failed. No payment is verified.'};
  $('verdict').textContent = labels[result.result];
  $('verdict').className = 'verdict ' + (result.result === 'matched' ? '' : ['underpaid','overpaid'].includes(result.result) ? 'warn' : 'bad');
  $('net-amount').textContent = result.netReceivedAmount;
  $('verdict-detail').textContent = details[result.result];
  $('facts').replaceChildren();
  for (const [key,value] of [
    ['Expected', result.expectedAmount + ' USDC'], ['Recipient',result.recipient],
    ['Incoming',result.receivedAmount + ' USDC'], ['Outgoing',result.outgoingAmount + ' USDC'],
    ['Gas paid',result.feeUsdc + ' USDC'],['Execution',result.execution === 'success' ? 'Successful · final block' : 'Failed · final block'],
    ['Block',result.blockNumber],['Block time',result.blockTime],['Transaction',result.transactionHash],
    ['Reference',result.invoiceReference || '—'],['Checked at',result.checkedAt]]) fact(key,value);
  $('explorer-link').href = result.explorerUrl;
  $('transfer-summary').textContent = 'USDC movements (' + result.canonicalTransferCount + ')';
  $('transfer-list').replaceChildren();
  for (const movement of result.transfers) {
    const item = document.createElement('div'); item.className='transfer';
    const amount = document.createElement('strong'); amount.textContent=movement.amount + ' USDC · ' + movement.kind;
    const from = document.createElement('div'); from.className='flow'; from.textContent='From ' + movement.from;
    const to = document.createElement('div'); to.className='flow'; to.textContent='To   ' + movement.to;
    item.append(amount,from,to); $('transfer-list').append(item);
  }
  $('count-note').textContent = result.canonicalTransferCount + ' canonical transfer(s) counted; ' + result.excludedErc20Logs + ' ERC-20 mirror log(s) excluded. Gas is separate.';
  setState('result');
}
$('verify-form').addEventListener('submit',async event=>{
  event.preventDefault(); if (busy) return;
  evidence = null;
  try {
    const expected = {hash:hash($('tx-hash').value),recipient:address($('recipient').value),amount:$('amount').value.trim(),reference:$('reference').value.trim()};
    units18(expected.amount);
    busy=true; $('verify-button').disabled=true; $('example-button').disabled=true;
    for (const input of $('verify-form').querySelectorAll('input')) input.disabled=true;
    setState('loading');
    const chainId = await rpc('eth_chainId',[]);
    if (BigInt(chainId) !== 5042n) throw new Error('The endpoint is not Arc Mainnet (5042).');
    const [transaction,receipt] = await Promise.all([rpc('eth_getTransactionByHash',[expected.hash]),rpc('eth_getTransactionReceipt',[expected.hash])]);
    if (!transaction || !receipt) throw new Error('No final receipt was found on Arc Mainnet. The transaction may be pending, missing, or on another network.');
    const block = await rpc('eth_getBlockByHash',[receipt.blockHash,false]);
    const raw = {chainId,transaction,receipt,block};
    const result = verifyReceipt(raw,expected);
    evidence = {verification:result,expected,raw}; render(result);
  } catch (error) { $('error-message').textContent=error.message; setState('error'); }
  finally {busy=false;$('verify-button').disabled=false;$('example-button').disabled=false;
    for (const input of $('verify-form').querySelectorAll('input')) input.disabled=false;}
});
$('example-button').addEventListener('click',async()=>{
  try {
    const response = await fetch('./example.json');
    if (!response.ok) throw new Error('The public example could not be loaded.');
    const data = await response.json();
    $('tx-hash').value=hash(data.hash); $('recipient').value=address(data.recipient); $('amount').value=data.amount;
    $('reference').value='PUBLIC-EXAMPLE'; $('example-note').hidden=false; evidence=null; setState('empty');
  } catch (error) { $('error-message').textContent=error.message; setState('error'); }
});
for (const id of ['tx-hash','recipient','amount','reference']) $(id).addEventListener('input',()=>{
  evidence=null; if (!busy) setState('empty'); $('example-note').hidden=true;
});
$('download-button').addEventListener('click',()=>{
  if (!evidence || busy) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href=url; link.download='arc-receipt-'+evidence.verification.transactionHash.slice(2,14)+'.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('print-button').addEventListener('click',()=>{ if(evidence && !busy) window.print(); });
