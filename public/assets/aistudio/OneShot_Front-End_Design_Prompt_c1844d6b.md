# OneShot: Front-End Design Prompt

Paste everything below the line into the AI agent that will build the front end. It is written as a full design and build brief. The product facts come from the OneShot Product and Architecture Brief, which should be attached alongside this prompt.

---

## 0. Your role

You are a senior product designer and front-end engineer building the website for **OneShot**, execution integrity for AI agents on NEAR. The site will be screened by reviewers from a16z, NEAR Protocol, Helios, Mumtaz, Electric Capital and Dragonfly, plus automated agents that read the README. They have about four minutes. The site is a demonstration instrument, not a brochure. It must feel like infrastructure a fund partner would forward to a colleague.

This project has no relation to any other brand or product. Do not borrow names, logos or visual language from anything else. The identity below is complete on its own.

## 1. Positioning in one breath

Headline: **One decision. One shot.** Subline: *Ambiguous execution is how approved agents multiply trades. OneShot makes decision execution exactly-once, enforced on-chain.*

The whole site exists to make a judge feel one thing: an agent that cannot tell whether its trade landed will retry, every retry will pass its safety checks, and the sum of them is damage. OneShot closes that gap at the settlement layer.

## 2. Feel and identity

Think serious infrastructure, a Linear and Vercel console hybrid. Quiet, dense, precise. Restrained neon, zero decoration. No gradients behind text, no glassmorphism, no floating blobs, no parallax, no stock illustrations, no emoji, no robot imagery.

**Colour tokens** (define as CSS variables, dark theme only)

- `--bg` #0A0E14, page background
- `--surface` #0F141C, panels
- `--surface-2` #151B25, raised rows and inputs
- `--border` #1F2733, 1px hairlines everywhere
- `--text` #E6EAF0, primary text
- `--muted` #8A94A6, secondary text and labels
- `--danger` #FF5A36, unprotected agent, duplicate fills, damage
- `--live` #F5A524, LIVE state and the reservation bar
- `--settled` #2BD576, SETTLED and success
- `--expired` #5B6577, EXPIRED
- `--blocked` #7C8CA8, a retry rejected by the guard

Colour discipline: red means money was lost. Green means resolved safely. Amber means money is in the air. A blocked retry on the protected side is a **success**, so never paint it red. Use the calm slate `--blocked` with a small shield-line glyph. Each accent appears only for its meaning.

**Type**

- Display and body: Space Grotesk (fallback Inter). Tight tracking on large headings, weights 500 and 600 only.
- Everything the machine produces (metrics, hashes, timestamps, console lines, state tags): JetBrains Mono, tabular numerals on. Numbers must look like they come from a machine, because they do.
- Scale: 72/76 hero, 40/44 section, 20/28 lead, 15/24 body, 12/16 mono labels in uppercase with 0.06em tracking.

**Shape and space**

- 4px base grid. Radius 6px on panels, 4px on chips. 1px borders instead of shadows. One subtle inner glow allowed on the active reservation bar only.
- Max content width 1200px. Console pages go full-bleed up to 1440px.

## 3. Signature element: the reservation bar ("money in the air")

This is the product in one glance. It must look identical everywhere it appears.

- A thin horizontal bar, 6px tall, full width of its container, `--surface-2` track.
- On LIVE it fills left to right in `--live` up to the reserved amount, with a faint pulse on the leading edge.
- A small vertical tick on the track marks the agent's global in-flight ceiling.
- On SETTLED it drains right to left over 600ms and a single `--settled` flash runs the length of the bar. On EXPIRED it drains and fades to `--expired`.
- Label above it in mono: `IN THE AIR  $500.00 / $500.00 CEILING`.
- Reuse it in the hero, in the top meters of the demo, inside each decision card, and in the builders page diagram.

## 4. Site map and navigation

Four routes: `/` landing, `/demo`, `/how-it-works`, `/builders`.

Top nav, 56px, sticky, `--bg` with a bottom hairline: wordmark "OneShot" on the left (set in Space Grotesk 600, with a small solid circle in `--live` before it, nothing else), links Demo, How it works, Builders, and on the right one button **Run chaos demo** (solid `--text` on dark, dark text) that routes to `/demo` and auto starts a run. On mobile the links collapse into a bottom sheet and the button stays visible.

Footer: GitHub, contract address (mono, copy button), NEAR network label, one line "Built for the NEAR hackathon". Nothing else.

## 5. Page 1: Landing (`/`)

Full scroll, six sections. Every section earns its place.

**5.1 Hero.** Left aligned headline "One decision. One shot." with the subline below, two buttons: **Run chaos demo** (primary) and **Read the mechanism** (ghost, anchors to section 5.4). Directly beneath, full width, the **uncertainty window animation**. This single visual carries the whole problem, so build it carefully.

Uncertainty window animation, looping every 14 seconds, two horizontal lanes stacked, each with the timeline from left to right:

- Left edge: a node labelled `DECISION  buy 500 USDC of NEAR`. A packet leaves it and travels right toward a node labelled `SETTLEMENT`.
- In the middle there is a shaded zone labelled `UNCERTAINTY WINDOW` (hatched fill in `--surface-2`). The packet enters it and stalls. A mono caption reads `ack: none`.
- **Top lane, UNPROTECTED**: after a beat the packet's timer expires and a second packet spawns from the decision, then a third, fourth, fifth, staggered 700ms apart. Each one reaches settlement and lands as a red fill. A counter on the right climbs `DUPLICATE FILLS 0 > 4` and `DAMAGE $0 > $2,000` in `--danger`. Caption: "Five approved. $2,500 spent against a $500 authorization."
- **Bottom lane, ONESHOT**: the first packet enters the zone and the reservation bar fills amber. Later retry packets reach a small gate icon just before the zone, bounce back with a `--blocked` flash and the tag `LIVE: retry blocked`. One packet settles green. Counter reads `EXECUTIONS 1`, `DAMAGE $0`.
- Reduced motion: replace with a static two-lane end state and a play button.

Below the animation, a single sentence callout in a bordered strip: *A card network places a hold on your funds the moment you commit. The money is yours, but it is not available until capture or release. OneShot is that hold, for AI agents, on-chain.*

**5.2 The problem in three cards.** Three equal cards, each with a mono index (01, 02, 03), a bold one line title, two lines of body. Copy:

- 01 *Three retry classes, none binary-catchable.* Replay, a gas or deadline bump, or a whole new decision loop with fresh prices. Nonces, tx hashes and idempotency keys each catch one of the three.
- 02 *The isolated-approval trap.* Every retry passes its own check. Five valid retries is $2,500 against a $500 authorization.
- 03 *Unknown is the most expensive state.* The chain says happened or did not. The agent lives in the spectrum between. Nobody owns the gap.

Under the cards, one centered line in 24px: "The settlement layer knows everything. The agent knows almost nothing. OneShot moves the truth, and the enforcement, across that gap."

**5.3 The lifecycle.** A horizontal strip showing the three states as chips connected by lines: `LIVE` (amber), `SETTLED` (green), `EXPIRED` (gray), with the table from the brief rendered as a compact 3 row grid underneath (state, meaning, budget, retry allowed). Highlight the one absolute rule in a bordered callout: *A new execution is only possible if the decision is EXPIRED. A timeout can never create an execution. Only resolved evidence can.*

**5.4 The mechanism teaser.** Four small cards in one row (stack on mobile): Decision-bound identity, Lifecycle, Reservation, Resolution by evidence. Each has a mono label, one sentence, and a tiny glyph drawn from simple lines. Link "Full mechanism" to `/how-it-works`.

**5.5 Proof strip.** A dark band with three live metric tiles pulled from the last demo run (or the replay data, clearly badged): `DUPLICATE FILLS` unprotected vs guarded, `DAMAGE` unprotected vs guarded, `PEAK IN THE AIR`. Under it a button **Run it yourself**.

**5.6 Closing.** Headline "One decision. One shot." again, two buttons, footer.

## 6. Page 2: Live demo (`/demo`), this page is the product

A console, not a marketing page. Full bleed, dense, terminal grade. No hero, no scroll hunting. Everything for a four minute evaluation fits above the fold on a 1440 by 900 screen.

**Layout, top to bottom**

1. **Control bar** (48px): left, a big **Run chaos demo** button and a **Reset** button. Middle, chaos controls as compact segmented inputs: `Swallow ack` (on by default), `Resolution delay` (3s, 8s, 15s, 30s), `Retry count` (3, 5, 8), `Decision size` ($100, $500, $1,000). Right, a connection chip: `LIVE API` (green dot) or `REPLAY` (gray dot).
2. **Meter row** (three tiles across the full width, always visible, sticky while scrolling): `DUPLICATE FILLS`, `CUMULATIVE DAMAGE ($)`, `MONEY IN THE AIR`. The first two show two values each, unprotected in `--danger` and OneShot in `--settled`. The third is the reservation bar at large size with the ceiling tick.
3. **Split view** (two equal columns, a 1px divider, a small "same decision, same chaos" label centered on the seam): left **UNPROTECTED AGENT**, right **ONESHOT AGENT**.
4. Each column contains, from top to bottom: a header with agent name and wallet balance (mono, animating down on the left as it drains); the **decision timeline strip**; the **event console**; a footer with the outcome line.

**Decision timeline strip.** A horizontal track per decision. It reads `decision 0x9f3a…c21e` then a chip `LIVE` (amber) then `SETTLED` (green) or `EXPIRED` (gray). Beneath the chip, name the resolution event in mono: `promise callback` or `1Click status read`. On the unprotected side there is no lifecycle, so show a row of red numbered attempts instead: `attempt 1`, `attempt 2` and so on, each ending in a red `FILLED` stamp. On the protected side, each retry draws as a short branch off the strip that ends at a `--blocked` stop mark with `LIVE: retry blocked`. This is what makes the mechanism legible rather than merely asserted.

**Event console.** Monospace, 12px, newest at the bottom, auto scroll with a pause on hover. Line format: `[00:03.142] retry_attempted  class=replay  attempt=2`. Colour only the state word. Keep it quiet; no icons.

**Outcome line** (bottom of each column, appears at the end of a run). Left: `5 EXECUTIONS. $2,500 SPENT AGAINST $500 AUTHORIZED.` in `--danger`. Right: `1 EXECUTION. $500 SETTLED. 4 RETRIES BLOCKED.` in `--settled`.

**Run behaviour.** Pressing Run starts both agents at the same instant with the same decision. The chaos proxy executes the trade, swallows the ack, and the resolution arrives after the chosen delay. Show a thin banner above the columns while it runs: `CHAOS PROXY: trade executed, ack swallowed, resolution in 12s`, with a countdown.

**Honesty rules for this page.** Every number is measured. If the API is unreachable, fall back to **Replay mode** and show a persistent `REPLAY` badge and the text "Recorded from a real mainnet run on \<date>" with the transaction links. Never present scripted numbers as live. Provide a small `View on explorer` link on every settled decision.

**Mobile.** Meters stay sticky on top. The two agents become tabs (Unprotected | OneShot) with a third "Side by side" toggle that shrinks both to cards.

## 7. Page 3: How it works (`/how-it-works`)

One screen of diagram, no walls of text. Two diagrams, drawn as clean SVG with thin lines, mono labels and the colour tokens above.

**Diagram A, the guard loop.** Left to right: `Agent` > `Guard contract (execute_decision)` > `Venue` > `Callback` > `Lifecycle (LIVE > SETTLED / EXPIRED)`. Under the Guard box, three small labelled parts: Decision registry, Reservation engine, Callback resolver. Animate a single packet along the path on scroll into view and light the reservation bar on LIVE.

**Diagram B, two oracles, one lifecycle.** Two rows feeding the same lifecycle box.

- Row 1: Direct NEAR execution, venue Rhea. The contract learns the result from its own promise callback. Caption: "No oracle. No indexer. No guessing."
- Row 2: NEAR Intents, venue intents.near. Status comes from the 1Click execution status plus verifier ledger state. Caption: "Deadline passed without settlement means provably EXPIRED, so a retry is genuinely safe."

Beneath, a compact three item row: **Decision-bound identity** (hash of agent account, asset, size, direction, slippage bounds, expiry, not the transaction bytes), **Global in-flight ceiling** (reserved atomically across all the agent's decisions: dedup is the convenience, the ceiling is the guarantee), **Scoped access key** (the agent can call only `execute_decision`, so bypass is impossible at the account level).

## 8. Page 4: For builders (`/builders`)

A README mirror styled like documentation. Left sticky table of contents, right content, max 760px prose.

Sections in order: **Quickstart** (install, three lines to wrap an agent, copy buttons on every code block), **SDK surface** (three methods: `execute_decision`, `check_decision`, plus the wrapper entry point, each with signature, return type and a short example), **Architecture** (the repo tree from the brief rendered as a collapsible tree), **Contract** (address, network, explorer link, verified badge), **Security model** (a two column table: *Enforced on-chain* vs *Cooperative*, stated honestly), **Roadmap** (Chain Signatures: one guard for every chain an agent touches). Use a bordered code block style with a language tag and a copy button. Keep the headings machine readable and in plain semantic HTML so automated agents can parse the page.

## 9. Data contract for the front end

Build the console against a WebSocket stream and develop against a local mock that emits the same events. Switch with `VITE_API_URL`. If unset, run in Replay mode.

Event shape (JSON): `{ t, agent, decision_id, type, data }`

Types: `run_started`, `decision_created`, `attempt_submitted`, `ack_swallowed`, `retry_attempted` (data: class = replay | bump | rerun), `retry_blocked` (data: reason = LIVE), `decision_live` (data: reserved), `decision_settled` (data: via = promise\_callback | status\_read, tx), `decision_expired`, `fill` (data: amount, tx), `metrics_tick` (data: duplicate\_fills, damage, in\_air, ceiling), `run_finished`.

Replay script for the default $500 run, so the page is demoable offline: t=0.0 decision created and attempt 1 submitted; t=0.4 trade executes, ack swallowed; t=3.0, 6.0, 9.0, 12.0, 15.0 retries fire. Unprotected: each retry fills, five fills, $2,500 damage. OneShot: each retry is blocked, one fill, in-air stays $500 until `decision_settled` at t=14 via promise callback, then drains to $0.

## 10. Copy rules

- Declarative, zero hype. No exclamation marks. No words like revolutionary, seamless, next generation, supercharge.
- Prefer concrete figures: "Five approved retried. $2,500 spent against a $500 authorization."
- Do not use em dashes anywhere in the copy. Use periods, commas and colons.
- Sentence case for headings, uppercase mono only for labels and state tags.

## 11. Accessibility and performance

- WCAG AA contrast on every text and state colour. State is never conveyed by colour alone: always pair with a word (`LIVE`, `SETTLED`, `EXPIRED`, `BLOCKED`).
- Full keyboard operation, visible focus ring in `--text` at 2px offset. `prefers-reduced-motion` disables the hero loop and the pulse.
- Largest Contentful Paint under 2 seconds. No heavy animation libraries. Draw the hero and diagrams as inline SVG with CSS and a light timeline controller.
- Dark theme only, `color-scheme: dark`. Responsive from 360px to 1440px. Set a proper title, description and Open Graph card (dark card, the headline, the reservation bar).

## 12. What the site must not be

No marketing fluff, no fake screenshots, no stock imagery, no buzzword walls, no fabricated testimonials or logos, no unverifiable numbers. If a number is not measured, it is not on the page.

## 13. Build order

1. Tokens, type and the reservation bar component.
2. The mock event stream and the `/demo` console (it is the product).
3. The hero uncertainty animation.
4. Landing sections.
5. How it works diagrams.
6. Builders page.
7. Polish: accessibility pass, Replay mode badges, Open Graph.

Deliver a working front end with all four routes, the mock stream, and a short README listing the environment variables.
