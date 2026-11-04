# OneShot — Execution Integrity for AI Agents on NEAR

> **One decision. One shot.** Ambiguous execution is how approved agents multiply trades: every retry was individually approved, and together they can do real damage. OneShot makes decision execution exactly-once, enforced on-chain.

[![tests](https://img.shields.io/badge/contract_tests-10%2F10_passing-2BD576)](#verification) [![sandbox](https://img.shields.io/badge/live_sandbox_verified-real_on--chain_verdicts-2BD576)](#verification)

## The problem

An AI agent decides: *buy 500 NEAR of the asset*. It submits the trade. Execution is ambiguous — the ack is dropped, consensus is pending, the session hiccups. The agent's retry policy fires. Each retry is **individually approved** (passed the budget check), and together they can fill the same decision 5+ times. Traditional fix is a timeout — but a timeout never proves whether the first attempt landed. Timeouts can't distinguish `executed-but-silent` from `provably-dead`. OneShot can.

## What OneShot does

One **decision lifecycle** with two resolution paths, enforced by a NEAR contract:

1. **Content-bound decision identity** — the decision is hashed from semantic facts (agent account, asset, size, direction, slippage, expiry), not transaction bytes. Replay, gas-bump, and rerun retry classes all collapse into one identity.
2. **Three-state on-chain lifecycle** — `LIVE` (reservation locked) → `SETTLED` (consumed by the venue) or `EXPIRED` (provably dead, reservation released). Only downstream evidence — a real promise callback, or the objective passage of the identity's own expiry height — can resolve a state. A wall-clock timeout can never mint an execution.
3. **Reservation engine ("money in the air")** — every attempt atomically locks spend against an agent-wide **in-flight ceiling**. Total unsettled exposure is a hard, on-chain cap across ALL decisions at once.
4. **Zero-oracle resolution** — resolution is closed with native NEAR promise callbacks (the venue's own receipt settles the decision on-chain). No indexer, no external verifier, no trust base.
5. **Scoped keys by design** — agents run with a function-call access key scoped to the guard (guard-bypass via the approval path is cryptographically impossible: the key authorized for spending can only call `execute_decision`).

## Layout

```
oneshot/
├── contract/          NEAR guard contract (Rust, near-sdk v5) + mock venue
│   ├── Cargo.toml     oneshot-guard + mock-venue workspace
│   └── src/lib.rs     decision registry, reservation engine, promise callback resolution
├── sdk/               TypeScript SDK (@oneshot-guard/sdk) — decision key derivation,
│                      wrapAgentWithOneShot, executeDecision, checkDecision
├── api/               Live event-streamer: boots a private NEAR Sandbox, deploys the REAL
│                      contract pair, drives naive-vs-guarded agents through the real
│                      lifecycle, streams SimulationEvents over WebSocket (/ws)
├── app/               Frontend (Vite + React): / landing, /demo chaos console (LIVE + Replay),
│                      /how-it-works, /builders
└── README.md
```

## Quickstart

Requires: Rust (wasm32-unknown-unknown target), Node 22+, [bun](https://bun.sh).

```bash
# 1 — build the contracts (guard + mock venue, shared workspace)
cd contract
cargo build --release --target wasm32-unknown-unknown --workspace
cd ..

# 2 — install the workspace (app, sdk, api)
bun install

# 3 — start the live API (private NEAR Sandbox, real contract deploys)
bun run api             # → ws://localhost:8787/ws

# 4 — start the app
cd app && bun install && bun run dev    # → http://localhost:3000/demo
```

Then open **http://localhost:3000/demo**, toggle **LIVE MODE** (default when `VITE_API_URL` is set), and press **Run**. The console streams a real sandbox run: naive agent fills ×6 while guarded agent blocks ×5 — every block is an on-chain verdict, not a mock.

To run in **Replay Mode** instead (deterministic, no sandbox): unset `VITE_API_URL` in `app/.env`.

## SDK

```typescript
import { wrapAgentWithOneShot, decisionKey } from '@oneshot-guard/sdk';

const guarded = wrapAgentWithOneShot(
  { accountId: 'my-agent.near', secretKey: process.env.AGENT_SECRET_KEY },
  {
    guardContract: process.env.GUARD_CONTRACT!, // deployed guard account
    maxInFlightCeiling: '100000000000000000000000000',
    near: { networkId: 'testnet', nodeUrl: 'https://rpc.testnet.near.org' },
    venue: { contract: 'v1.rhea-exchange.near', method: 'execute' },
    onEvent: (e) => console.log(e),
  }
);

// Registers (or tightens) the agent's on-chain in-flight cap. Idempotent.
await guarded.ensureCeiling();

// One decision → at most one live execution. LIVE/SETTLED rejections are
// deterministic; the SDK resolves the lifecycle by on-chain evidence.
const result = await guarded.executeDecision({
  asset: 'NEAR/USDC',
  size: 500,
  direction: 'BUY',
  slippageTolerance: 0.005,
  expirySec: 60,
});

// Audit any decision at any time:
const view = await guarded.checkDecision(result.decisionId); // LIVE | SETTLED | EXPIRED
```

`decisionKey(agentAccount, params)` — the identity scheme the contract uses — is exported alone so indexers and auditors can precompute the same key from your agent's intent log.

## Contract surface

| Method | Kind | Meaning |
| --- | --- | --- |
| `execute_decision(args)` | change + payable | Reserve → go LIVE → forward to venue → resolution callback. LIVE/SETTLED identities deterministically reject. |
| `on_resolution(id)` | callback (private) | Promise settlement: success → SETTLED, failure → EXPIRED + release. |
| `resolve_expired(id)` | change | Anybody may finalize an identity whose height-expiry objectively passed. |
| `set_agent_config(ceiling)` | change | Agent's in-flight ceiling. |
| `get_decision(id)` / `get_in_air(agent)` / `get_agent_config(agent)` | view | Lifecycle audit trail. |

## Verification

Run it all locally — every claim below is a command, not prose:

```bash
cd contract && cargo test        # 10 unit tests: retry-blocked, settled-permanent,
                                 # failure-releases, ceiling-reverts, supersede, expiry
cd api && bun run src/index.ts   # boots a private NEAR Sandbox, deploys the real wasm pair,
                                 # then any /demo LIVE run shows only real verdicts
```

Unit tests prove the invariants: a retry while LIVE is rejected; a SETTLED decision keeps rejecting forever; a failed downstream call provably releases the reservation and permits a fresh attempt; the ceiling reverts atomically; supersede never double-counts; expiry transitions only past the objective height.

## Tracks

Primary: **AI Security & Defense** — this is a defense mechanism for financial agent autonomy.
Secondary: **Unstoppable DeFi** — security at the settlement layer of permissionless execution.

## Status & honest notes

- Contracts verified in a private NEAR Sandbox (near-workspaces v5) with REAL on-chain verdicts; unit tests cover the invariants above.
- Mainnet deployment (`oneshot-guard.near`) is planned for post-hackathon; nothing here depends on that address.
- The SDK's `executeDecision` talks to any deployed guard; venue adapters target Rhea (direct promise) and NEAR Intents (via 1Click status reads) — the sandbox demo uses the bundled mock venue harness so the guard's mechanics are the thing under test.

## License

MIT
