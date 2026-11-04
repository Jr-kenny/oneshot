ONE SHOT — Product & Architecture Brief
For the web developer + site design. Core product positioning and mechanisms are fixed; the UI executes this brief.

1. The one-liner
OneShot — execution integrity for AI agents. One decision, one shot.

Agents that trade and move money don't fail because they choose badly. They fail because they can't know what happened to what they already did — so they retry, and every retry was individually approved while the aggregate is damage. OneShot makes a decision exactly-once at the settlement layer: one decision, at most one live execution, total exposure capped — enforced by an on-chain contract, not by the agent's good behavior.

2. The problem (this is the hero narrative — the site must make judges feel it)
There's a gap between the moment an agent decides and the moment a trade is confirmed. Inside that window, the agent is blind: the transaction may be queued, dropped, outbid, or about to land — and the agent cannot tell which. When its timeout fires, "unknown" gets treated as "failed," and the agent re-approves.

Three things make this dangerous rather than merely annoying:

Three retry classes, none binary-catchable. The agent can resubmit the identical signed transaction (replay), re-approve the same trade with different bytes (gas/deadline bump), or re-run its whole decision loop with fresh market prices — a different transaction that is economically the same intent. Nonces, tx hashes, and ordinary idempotency keys each catch only one of the three. Nothing at the transaction layer can identify all three as the same decision.
The isolated-approval trap. Every retry passes safety checks independently: "$500 is within budget — approved." Five retries, each individually valid, is $2,500 against a $500 authorization. Per-transaction approval cannot see cumulative intent.
"Unknown" is the most expensive state in finance. The layer the agent trusts (the chain) grades outcomes as happened/not-happened, while the agent experiences a spectrum of uncertainty. Nobody owns the gap — so agents guess, and guessing with money multiplies.
One sentence for the deck: "The settlement layer knows everything. The agent knows almost nothing. OneShot moves the truth — and the enforcement — across that gap."

3. The mechanism (what actually exists)
Four components, each doing one job:

a. Decision-bound identity. Every economic decision gets a content-derived ID — hash of (agent account, semantic decision: asset, size, direction, slippage bounds, expiry) — not derived from the transaction bytes. All three retry classes collapse into one identity because the identity is the decision, not the transmission.

b. The lifecycle. Every decision is in exactly one of three states, with one absolute rule:

State	Meaning	Budget	Retry allowed?
LIVE	An execution attempt is in flight	Reserved	No — blocked by the contract
SETTLED	Execution resolved; effects known	Consumed	Returns the original result, never re-executes
EXPIRED	Deadline passed and provably dead	Released	Fresh attempt is safe
Rule: a new execution for a decision is only possible if that decision is EXPIRED. A timeout can never create an execution; only resolved evidence can.

c. The reservation ("money in the air"). When a decision goes LIVE, the guard reserves the envelope spend. The reservation is released only on provable resolution — settlement (consumed) or expiration (released). Plus one refinement: a global in-flight ceiling across all of an agent's decisions, reserved atomically — so even a confused agent generating "new" decisions can never have more than its ceiling at risk. Dedup is the convenience; the ceiling is the guarantee.

d. Resolution by evidence, never by guess — one lifecycle, two oracles.

Direct NEAR execution (venue: Rhea): every spend routes through the OneShot guard contract. NEAR's promise-callbacks mean the contract itself learns whether the downstream call succeeded or failed, and updates the lifecycle on-chain — no oracle, no indexer, no guessing.
NEAR Intents (venue: intents.near): settlement status is read from the 1Click execution status + verifier ledger state. Deadline passed without settlement = provably EXPIRED; a retry is then genuinely safe.
Enforcement: the agent's access key is a scoped function-call key allowed to call only the guard (execute_decision). Bypass isn't discouraged — it's impossible at the account level.
Roll in one demonstration line for the README: "A card network places a hold on your funds the moment you commit — the money is yours, but it's not available until capture or release. OneShot is that hold, for AI agents, on-chain."

4. What we're shipping (repo & backend reality the site must reflect)
oneshot/
├── contract/          # Rust guard contract: decision registry, reservation engine,
│                      #   execute_decision(), promise-callback resolution, TTL/GC
├── sdk/               # TypeScript: drop-in agent wrapper (execute_decision, check_decision)
├── demo/
│   ├── naive-agent/   # No guard: retries on timeout, double-buys, drains wallet
│   ├── guarded-agent/ # Same logic, OneShot SDK
│   └── chaos-proxy/   # Executes the trade but swallows the ack — the villain
├── api/               # Small Node service: runs demo sessions, streams events over WS,
│                      #   reads guard contract + verifier state for the dashboard
└── site/              # The website (this brief)
Key backend facts the site and demo depend on:

Demo venue: dust-sized real swaps on NEAR mainnet (intents have no testnet deployment — this is deliberate: real money in flight), plus direct-guard execution against a Rhea-style venue.
The chaos proxy sits at the SDK layer, so the demo works identically regardless of venue.
The api/ service is the site's backend: it triggers runs, streams lifecycle events over WebSocket, and exposes the "$ in the air" and duplicate-fill metrics in real time.
5. The website — what it is, page by page
Audience: hackathon judges (a16z-grade investors, NEAR core team) first, developers second. They have 4 minutes. The site is a demonstration instrument, not a brochure.

Page 1 — Hero / Concept
Headline: "One decision. One shot." Subline: "Ambiguous execution is how approved agents multiply trades. OneShot makes decision execution exactly-once — enforced on-chain."
Immediately below: the uncertainty window animation — a decision leaves the agent, hangs, the naive path spirals into N red duplicate executions and a climbing loss counter; the OneShot path collapses into ONE settled execution. This one visual must carry the entire problem. If the site does one thing well, it's this.
Card-network hold metaphor as a one-sentence callout.
Page 2 — Live Demo (this page is the product)
A console, not a marketing page. Dark, dense, terminal-grade (think Linear/Vercel-console hybrid). It runs the actual chaos harness:

Run chaos demo — one button, one command for the evaluator.
Split view: UNPROTECTED agent (left) vs ONESHOT agent (right) — same decision, same chaos.
The villain: chaos controls user-visible or pre-scripted — "execute trade, swallow the ack, delay resolution N seconds."
Left panel visibly fires retry after retry; duplicate fills tick up; wallet balance drains.
Right panel: each retry attempt meets a decision-state rejection (LIVE — retry blocked), exactly one execution, and the lifecycle strip updates live.
Three persistent meters across the top: duplicate fills · cumulative damage ($) · money currently in the air (the reservation, live).
Decision timeline strip per agent: decision hash → LIVE (amber) → SETTLED (green) / EXPIRED (gray), with the resolution event named (promise callback / status read). This makes the mechanism legible, not just asserted.
Page 3 — How it works
The four-component mechanism above as a clean diagram: agent → guard contract → venue → callback → lifecycle. Plus the two-oracle diagram (direct venue vs intents). Keep it one screen, no walls of text.

Page 4 — For builders
README mirror: quickstart, SDK surface (3 methods), architecture diagram, contract address, security model paragraph (what's enforced vs what's cooperative — stated honestly), roadmap (Chain Signatures = one guard for every chain an agent touches).

What the site must NOT be: marketing fluff, fake screenshots, buzzword walls. Every number on the demo page is measured, not claimed. Judges screen the README with automated agents — the site should read like something a fund partner would forward.

6. Design direction for the developer (the Gemini/AI Studio prompt ingredients)
Identity: serious infrastructure. Dark interface (near-black, #0A0E14-ish), one accent — safety-anthem red/orange for danger/unprotected, a settled green for resolved, amber for LIVE. restrained neon, zero decoration.
Type: Inter or Space Grotesk for display; JetBrains Mono or equivalent for every live console output and metric. Numbers should look like they come from a machine, because they do.
Signature element: the "money in the air" meter — it should be visually distinct everywhere it appears (a thin reservation bar that fills on LIVE and drains on resolution), because it's the product in one glance.
Motion: purposeful only — the retry-cascade animation in the hero, live event feed on the demo page. No parallax, no floating blobs.
Tone of copy: declarative, zero hype. "Five approved retried. $2,500 spent against a $500 authorization." Let the mechanics do the persuading.
