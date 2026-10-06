# Arc Receipt Check

A read-only Arc Mainnet USDC payment verifier. Enter a transaction hash, expected recipient and amount, then inspect the final transaction and export a reproducible JSON receipt.

## Why it exists

Arc's native USDC and ERC-20 USDC interfaces share one balance. One ERC-20 payment emits a native system `Transfer` at 18 decimals and an ERC-20 `Transfer` at 6 decimals. Generic receipt processing can count the payment twice or lose sub-six-decimal precision.

This utility counts only the canonical native system stream, separates gas costs, and checks net explicit USDC credit against the expected recipient and amount. The reference field is local and is never sent to RPC.

## Run locally

Requirements: Node.js 20+ for tests and Python 3 for the optional static server. No npm dependencies, SDK keys, wallet or database are needed.

```sh
npm test
npm run check
npm run serve
```

Open `http://127.0.0.1:8789/`. Production needs only the files in `dist/` served over HTTPS. Sites configuration in `.openai/hosting.json` is hosting metadata, not an Arc contract deployment.

## Verification

- Checks chain ID 5042, transaction and receipt hashes, final block hashes/numbers, and execution status.
- Reads system `Transfer` events from `0xfffffffffffffffffffffffffffffffffffffffe`, using 18-decimal integer arithmetic.
- Excludes `0x3600000000000000000000000000000000000000` mirror logs, arbitrary token logs, mints, burns and self-transfers from invoice amounts.
- Subtracts explicit transfers out of the recipient within the same transaction.
- Calculates gas separately as `gasUsed × effectiveGasPrice`, using 18 decimals.
- Refuses a conclusion for missing or inconsistent evidence; failed transactions never verify a payment.
- Supports JSON evidence export and printable receipts.

The fixtures include a public third-party mainnet transaction captured on 2026-10-06:

[`0xb4cd75307f130ec44cd0ce2e980fc821ee6caf750d16a0d3ae65a10b87bbb7cd`](https://explorer.arc.io/tx/0xb4cd75307f130ec44cd0ce2e980fc821ee6caf750d16a0d3ae65a10b87bbb7cd)

It has one canonical system transfer and one ERC-20 mirror. The sample net credit is 672.915391 USDC and gas is 0.0066900000003345 USDC. **This is not a payment to the builder or evidence of earnings.** `prepare-example.mjs` derives the public example and expected result from that captured receipt.

16 automated tests cover the public fixture and failure cases. Browser UI verification was not completed because access to the local browser preview was denied. Syntax, form asset links, HTML structure and static HTTP delivery are checked separately. A captured fixture does not establish that the live RPC will always be reachable from every user's network.

## Boundaries

- This project does not deploy or execute a smart contract. It is a mainnet-connected, read-only web application. Grant eligibility remains the organizer's decision.
- A reference is not cryptographically bound to a payment. Multiple invoices can reuse a transaction; invoice allocation must be reconciled separately.
- Payer identity is not authenticated. Contract forwarding is included in the canonical movement stream.
- It is an RPC check, not a signed attestation, tax invoice, independent full node, or receipt-proof verification.
- Net explicit transfers exclude gas and other non-event balance changes. It does not certify the final account balance.
- Native mint/burn credits do not count as invoice payments. No partial historical testnet event support is claimed.
- No wallet connection, signing, analytics, history storage, trading or transaction broadcasting.
- RPC errors produce an unknown result, never an assumption of payment.

## Official sources

- [Arc connection settings](https://docs.arc.io/arc/references/connect-to-arc)
- [USDC system events](https://docs.arc.io/arc/references/usdc-system-events)
- [EVM differences](https://docs.arc.io/arc/references/evm-differences)
- [Contract addresses](https://docs.arc.io/arc/references/contract-addresses)

Independent software; not affiliated with or endorsed by Circle or Arc. MIT license.
