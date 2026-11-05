I want this to be as perfect as Linear's website or Apple Notes: simple purpose, simple architecture, simple design, simple implementation. Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout. Every decision should elevate the user experience (UX), developer experience (DX) and agent experience (AX) at once, without breaking anything.

## Hackathon Engineering & Competitive Execution Standard

Build to win, not just to participate. The submission checklist is the floor, not the target. Meeting the minimum makes a project eligible for judging. It does not make it competitive.

### 1. Understand the ecosystem before building

Before implementation, inspect the hackathon requirements, judging criteria, tracks, sponsors, partners, SDKs, APIs, protocols, and developer tools. Understand what each technology actually enables and how it could genuinely serve this product.

Do not build a generic app that could have been submitted to any hackathon, and do not force integrations to increase the partner count. Every integration must serve a real purpose in the architecture or product.

### 2. Product before presentation

The actual product is the priority. A polished UI, landing page, simulated interaction, recorded walkthrough, or impressive presentation is not a completed product.

Implement the real system: real application logic, functional backend services, smart contracts and on-chain functionality, real transactions and verifiable state changes, real API and SDK integrations, auth and security where appropriate, persistent state, error handling, and transaction lifecycle management including edge cases.

Mocks may be used during development and testing. They must never be presented as implemented production functionality.

### 3. Beyond the minimum, without feature inflation

An MVP is a starting point, not a stopping point. After the core works, strengthen what materially increases quality, technical credibility, or competitive value: technical depth, originality, real-world usefulness, security and reliability, UX, ecosystem integration, scalability, and demonstrable innovation.

Do not add features just to inflate the feature list, and do not add unnecessary complexity.

Tie-breaker with the simplicity rule above: simplicity wins unless the extra work materially increases verifiable competitive value. If it does not, cut it.

### 4. Executable and independently verifiable

The project must have an actual executable version: a deployed app judges can test, or a reproducible local environment.

Core functionality must be independently testable. Transactions and state changes must be verifiable. Provide contract addresses, transaction hashes, and verification links where applicable, plus test accounts, credentials, and setup instructions where needed. The repository must contain the actual implementation.

A UI that only works in isolation is insufficient when the product requires a functioning backend or blockchain integration.

### 5. Demo as presentation, not as cover

The demo must communicate: the problem, why it matters, the solution, how the actual application works, the technical architecture, the ecosystem technologies used, the actual user journey, verifiable functionality and results, and what makes this different from competing submissions.

Demonstrate real functionality wherever possible. Do not rely on slides, screenshots, mockups, or narration to conceal incomplete implementation.

### 6. Compete against the field, not the checklist

Regularly challenge the work like an engineer, product architect, and competition strategist:

- Against 50 competing submissions, why should this stand out?
- What have we implemented that others overlooked?
- Are our integrations meaningful or superficial?
- Is the implementation genuinely impressive?
- Can someone independently verify our claims?
- Does it solve the problem better than existing alternatives?
- What weaknesses could cause judges to reject or downgrade it?

Identify weaknesses early and address them. Do not assume completing the requested features automatically makes the project competitive.

### 7. Execution

Do not wait to be told about every technical opportunity, missing integration, or implementation weakness. Proactively investigate, reason, propose improvements, and execute approved decisions.

Understand the complete problem and architecture before implementation. Verify continuously during implementation that the actual system works. After implementation, critically evaluate the result against the judging criteria.

Do not stop at the first working version if substantial improvements are still necessary. Do not make major product-direction changes or introduce unnecessary scope without justification and approval.

### 8. Completion criteria

Never declare a project complete simply because the UI is ready, the demo is recorded, the README is written, the repository is public, the submission form is complete, or a few interactions work.

Completion requires evidence that:

- The core product has actually been implemented and its essential functionality works.
- Required integrations are real.
- The application is executable and independently verifiable.
- Critical failures and known limitations are documented.
- Submission materials accurately represent the implementation.
- The project has been evaluated against the judging criteria.

Distinguish clearly between implemented, tested, deployed, simulated, and planned functionality. Never claim something works without verifying it.

Do not mistake minimum compliance for excellence. Do not mistake a convincing presentation for engineering. Do not mistake a working UI for a working application.

Build the actual product. Leverage the ecosystem. Prove that it works. Make it difficult for judges to overlook.

## OneShot verification checklist

Before claiming anything is done or real, check it against this list:

- Contract: `cd contract && cargo test` — all 13 unit tests must pass: retry-blocked, settled-permanent, failure-releases, ceiling-reverts, supersede, and expiry, plus cancel-by-executor-releases, cancel-by-non-executor-rejected, and cancel-of-settled-rejected (Step 1, tested 2026-11-05: 13 passed, 0 failed).
- Agent loop: `bun test api/src/agent-loop.test.ts` — 7 checks, same params on every retry, PENDING is not failure (Step 2, tested 2026-11-05).
- Intents adapter: `bun test adapter/intents-adapter.test.ts` — 3 checks, same decision + salt = same nonce (Step 3, tested 2026-11-05).
- Mock verifier: `cd contract/mock-verifier && cargo test` — 5 checks, publish/settle/replay-block/expiry (Step 3, tested 2026-11-05).
- Live demo: testnet run 1 (2026-11-05, STATUS-TESTNET.md) is the current real on-chain verdict: guard oneshot-guard.testnet, venue venue.oneshot-guard.testnet, naive fills 3, guarded fills 1, guarded retries blocked 3/3 as already SETTLED, final fills 4 chain-read. Only LIVE testnet runs count as real on-chain verdicts. The earlier private sandbox runs are superseded by this testnet run for the same code, because the old sandbox (neard 2.6.2, protocol 77) rejects this near-sdk 5 wasm while testnet (protocol 88) accepts it.
- Replay mode is deterministic and simulated. Label it as simulated. Never present it as an on-chain verdict.
- The testnet mock venue is a harness to test the guard's mechanics. It is not a real venue integration. The testnet mock verifier is a stand-in for intents.near, not intents.near itself. Rhea (direct promise) and NEAR Intents (via 1Click status reads) are venue targets — do not claim them as live integrations unless verified. No mainnet Intents settlement is claimed; 1Click dry quote and simulate_intents probes are documented with their limits in STATUS-TESTNET.md.
- Mainnet deployment (`oneshot-guard.near`) is planned for post-hackathon. It is not deployed. Do not claim a mainnet address, transaction, or deployment that does not exist. Testnet deployment (oneshot-guard.testnet) is for verification only and is not the author's rewards account.
- For every feature in a status update, demo, README, or submission, label it as implemented, tested, deployed, simulated, or planned. If it cannot be verified, say so.
