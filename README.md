# OneShot — Execution Integrity for AI Agents on NEAR

> **One decision. One shot.** Ambiguous execution is how approved agents multiply trades: every retry was individually approved, and together they can do real damage. OneShot makes decision execution exactly-once, enforced on-chain.

[![tests](https://img.shields.io/badge/contract_tests-13%2F13_passing-2BD576)](#verification) [![testnet](https://img.shields.io/badge/live_testnet_verified-real_on--chain_verdicts-2BD576)](#verification)

## The problem, in plain English

An AI agent that trades for you does not usually fail because it makes a bad decision. It fails because it cannot tell what happened after it made a good one.

Imagine the agent makes a sensible, in-budget decision: buy $500 of an asset. It sends that trade off. Then it hears nothing back.

That silence could mean three very different things. The trade might still be waiting to be filled. It might have already filled, but the confirmation got lost on the way back. Or it might never happen at all.

From the agent's side, all three look exactly the same: nothing came back. So it does what any normal program does when it thinks something failed. It tries again.

And that is where the real damage happens.

Each retry, on its own, looks fine. It passes the budget check. It follows the rules. But if the first trade actually did go through quietly, and then the second and third trades go through as well, the agent has now bought the same thing three times. It meant to spend $500. It has spent $1,500. No single trade broke the rules, but together they blew the budget and doubled the position.

A timeout does not fix this, because a timeout is not proof. A timeout just means "I waited and I heard nothing." It cannot tell you whether the first attempt landed or whether it is provably dead. And a normal retry limit does not fix it either, because even a limit of one retry still leaves the agent blind about what happened to the first attempt.

The problem is not the trade. The problem is knowing.

### What OneShot does about it, in plain English

OneShot gives the decision itself a life story, separate from each individual attempt to carry it out.

First, every decision gets an identity based on what it actually is — who the agent is, what asset it is buying or selling, how much, in which direction, with what price tolerance, and for how long it is valid — not based on the exact bytes of one transaction. That way, a replay, a gas bump, or a simple rerun all collapse into the same decision, instead of looking like three different trades.

Second, that decision can only ever be in one of three states.

If it is LIVE, an attempt for that decision is currently out in the world and not yet provably dead. The money for it is held aside, like a hold on a bank card: not spent yet, but not available to spend on anything else. While it is LIVE, no new attempt may be created for that decision. Retries are blocked, and the agent gets a clear answer instead of a vague timeout.

If it is SETTLED, the trade has happened. The held money becomes spent money. If the agent tries again, it does not make a second trade. It just gets back the original receipt.

If it is EXPIRED, the attempt is provably dead. Its deadline has passed, there was no settlement, and the money that was held aside is released. Only then is a new attempt safe, because the old one cannot come back to life.

Third, the money held aside is capped across all decisions at once. That cap is called the money in the air. No matter how many decisions are live at the same time, the total amount that is unsettled can never go over that cap. That is what stops individually approved retries from adding up into damage: the budget is enforced for the decision and for the agent as a whole, not checked fresh on every single attempt.

In short, the agent never has to guess from silence again. It gets one of three clear answers: settled with a receipt, live so do not retry, or expired so a new attempt is safe.

### How OneShot knows, today

Today, OneShot enforces this with a guard contract on NEAR. The agent sends its trade through the guard, not straight to the venue. The guard locks the reservation, forwards the trade to the venue, and then closes the loop with the venue's own on-chain callback: success means SETTLED, failure means EXPIRED and the reservation is released. If the deadline passes without a settlement, anyone can finalise the decision as EXPIRED, because that deadline is written into the decision itself.

NEAR's fast finality — about 1.2 seconds — is what makes this practical. Waiting to know for sure takes seconds, not minutes, so the agent is not stuck waiting forever for one decision while it could be working on others.

### What is built today, and what is next

What is built today is the guard, the decision identity, the three-state lifecycle, and the money-in-the-air cap, verified on NEAR testnet with real on-chain guard verdicts (see STATUS-TESTNET.md): guard on oneshot-guard.testnet, venue on venue.oneshot-guard.testnet, mock verifier on verifier.oneshot-guard.testnet. In the testnet demo, the naive agent filled 3 times while the guarded decision filled exactly once and 3 further guarded retries were blocked on chain as already SETTLED. The testnet venue is a mock venue and the testnet verifier is a mock verifier, both labelled as such — the guard's decisions are real, the trade and the Intents settlement in that demo are not yet real.

What is next, and not yet built, is a real mainnet Intents settlement: using the Verifier's one-time ticket number, the nonce, as the source of truth for whether an intent is live, settled, or dead, with a real venue instead of a mock one, and a 1Click dry quote with the correct token id. That is the planned production path. It is not claimed as built here.

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
cd contract && cargo test        # 13 unit tests: retry-blocked, settled-permanent,
                                 # failure-releases, ceiling-reverts, supersede, expiry
cd api && bun run src/index.ts   # boots a private NEAR Sandbox, deploys the real wasm pair,
                                 # then any /demo LIVE run shows only real verdicts
```

Unit tests prove the invariants: a retry while LIVE is rejected; a SETTLED decision keeps rejecting forever; a failed downstream call provably releases the reservation and permits a fresh attempt; the ceiling reverts atomically; supersede never double-counts; expiry transitions only past the objective height.

## Tracks

Primary: **AI Security & Defense** — this is a defense mechanism for financial agent autonomy.
Secondary: **Unstoppable DeFi** — security at the settlement layer of permissionless execution.

## Status & honest notes

- Contracts verified on NEAR testnet with REAL on-chain verdicts (STATUS-TESTNET.md); unit tests cover the invariants above. Guard contract tests: 13/13. Agent loop: 7/7. Intents adapter: 3/3. Mock verifier: 5/5.
- Mainnet deployment (`oneshot-guard.near`) is planned for post-hackathon; nothing here depends on that address. Testnet deployment (oneshot-guard.testnet) is live and used for verification only.
- The SDK's `executeDecision` talks to any deployed guard; venue adapters target Rhea (direct promise) and NEAR Intents (via 1Click status reads) — the testnet demo uses the bundled mock venue harness so the guard's mechanics are the thing under test, and the testnet verifier is a mock verifier, not intents.near.

## License

MIT
