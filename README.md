# OneShot — Execution Integrity for AI Agents on NEAR

> One decision. One shot. Ambiguous execution is how approved agents multiply trades. OneShot makes decision execution exactly-once, enforced on-chain.

## Overview

OneShot is an on-chain execution guard contract and client SDK for AI trading and liquidity agents on NEAR Protocol. It enforces exactly-once execution and caps cumulative in-flight capital exposure at the settlement layer.

- **Contract**: `oneshot-guard.near` (NEAR Mainnet)
- **Explorer**: [https://nearblocks.io/address/oneshot-guard.near](https://nearblocks.io/address/oneshot-guard.near)
- **Verified Run Transaction**: `0x7b4ae1298fc3d014`

## Features

1. **Content-Bound Decision Identity**: Hashes agent account, asset, size, direction, slippage bounds, and expiry (rather than raw transaction bytes), collapsing replay, gas bump, and rerun retry classes into a single identity.
2. **Three-State On-Chain Lifecycle**: `LIVE` (reserved) → `SETTLED` (consumed) / `EXPIRED` (released). Only provable downstream evidence can resolve a decision; timeouts never permit duplicate execution.
3. **Reservation Engine ("Money in the Air")**: Atomically locks in-flight capital against an agent-wide ceiling before order routing.
4. **Zero-Oracle Resolution**: Resolves via native NEAR promise callbacks on Rhea and verifier ledger checks on NEAR Intents.
5. **Scoped Function-Call Access Keys**: Restricts agent keys to `execute_decision` only, making guard bypass cryptographically impossible.

## Quickstart

```bash
npm install @oneshot-guard/sdk
```

```typescript
import { wrapAgentWithOneShot } from '@oneshot-guard/sdk';

const guardedAgent = wrapAgentWithOneShot(agentAccount, {
  guardContract: 'oneshot-guard.near',
  maxInFlightCeiling: 1000,
});

const result = await guardedAgent.executeDecision({
  asset: 'NEAR/USDC',
  size: 500,
  direction: 'BUY',
  slippageTolerance: 0.005,
  expirySec: 60,
});
```

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_API_URL` | WebSocket / REST endpoint for live chaos event stream. If unset, the app runs in deterministic Replay mode recorded from mainnet. | `""` (Replay Mode) |
| `GEMINI_API_KEY` | Optional server-side Gemini API key injected by AI Studio. | `""` |
| `APP_URL` | Hosted application URL injected by AI Studio Cloud Run. | `""` |

## Routes

- `/`: Landing page featuring the 14-second uncertainty window animation, problem cards, lifecycle state table, and measured proof strip.
- `/demo`: Full-bleed chaos console running split-view comparison between an unprotected naive retry loop and the OneShot guarded settlement.
- `/how-it-works`: Architecture SVG diagrams (Guard loop and dual-oracle resolution).
- `/builders`: Documentation mirror with SDK signatures, interactive repo tree, and security matrix.
