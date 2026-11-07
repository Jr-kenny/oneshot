# OneShot — testnet status (verified 2026-11-05, updated 2026-11-07)

## Live on NEAR testnet (faucet tokens)
- Guard: oneshot-guard.testnet — https://explorer.testnet.near.org/accounts/oneshot-guard.testnet
- Venue (mock venue wasm): venue.oneshot-guard.testnet
- Ref venue (REAL Ref Finance testnet swap): ref-venue.oneshot-guard.testnet — https://explorer.testnet.near.org/accounts/ref-venue.oneshot-guard.testnet
- Mock verifier: verifier.oneshot-guard.testnet
- Demo agent: agent.oneshot-guard.testnet
- Master account creation tx: BKqP9vDv2mfA6rEm3kJ25uGL42BURTKMWep2LFTpk6Sz
- These accounts are a fresh project set created for testnet verification.

## Live demo run 2 — guarded REAL Ref Finance swap (2026-11-07)
Script: scripts/testnet-ref-demo.cjs. Ref venue contract: contract/ref-venue/
(near-sdk 5.17, unit tests 4/4). Deploy script: scripts/testnet-ref-deploy.cjs.
- Ref exchange: ref-finance-101.testnet (verified from ref-finance/guide
  contracts.md and the ref-sdk testnet config). wNEAR: wrap.testnet.
  Testnet USDC: usdc.fakes.testnet ("Bridged USDC", USDC.e, 6 decimals,
  ft_metadata read from chain). Pool 2896: wNEAR/USDC.e SIMPLE_POOL,
  fee 30 (0.3%).
- Direct-path proof first (agent EOA, no guard): 0.01 wNEAR -> 39,708
  USDC.e base units (0.039708 USDC.e), exactly the get_return quote.
  Swap tx: GFhYAPN1GHmnB2YVUJS3ySgUqNPeLGngYmBiMUXP7THn
  (wrap tx ErVuWkfVPCYd9AeEX2SiH4J3FiquLUqzchwmhTRRGq9c, 0.05 NEAR -> wNEAR).
- Guarded decision 5c48eab191bbca0382d0ac07cffeaa3c9a6c34c00211db1d7d5098eca5fd595c:
  LIVE on chain, 0.01 NEAR reserved, ref venue wrapped it and swapped it
  on Ref pool 2896, promise callback settled it, in_air back to 0.
- Guarded trade tx: BehuJ1bQ83UzHhn2rNeJRyeos1iPJnkKrLRTbKjBQLMU
- Ref venue chain-read: swaps 0 -> 1, USDC.e balance 0 -> 39,316 base units
  (0.039316 USDC.e, matching the pre-swap get_return quote of 39,316).
  The USDC.e proceeds sit in the ref-venue contract; read back from
  usdc.fakes.testnet ft_balance_of for ref-venue.oneshot-guard.testnet.
- Guarded retries x3 on the same decision: all blocked on chain,
  "ONESHOT: retry blocked — decision already SETTLED". Venue swaps stayed 1.
- Guard change for run 2: VENUE_GAS 15 -> 100 TGas (the Ref chain needs a
  wrap hop + ft_transfer_call + the swap inside it, ~90 TGas). Guard wasm
  redeployed 2026-11-07; state layout unchanged and verified preserved:
  run-1 decision 4285793a…467438 still reads SETTLED after the redeploy.
- Funding notes (all faucet NEAR, project accounts only): ref-venue
  subaccount created with 1 NEAR, topped up 1 NEAR from the master
  (tx 8fL7PbhciZvgyHPcnQHsSxBQCBuVpm5GtmYeTnEFxjKC) because the 161 KB
  wasm needs ~1.61 NEAR of storage stake; master topped up 1 NEAR from
  the mock venue account (tx 65KfvfChQV1N5DVqf6RmNstkx8bjC53XwfpLffxHs2Z4)
  to cover the guard redeploy. Ref-venue storage deposits:
  wrap.testnet DaaK7nMTzpZ6w8mmszxVyovWZPr767ru2CpmCmGJ9mkA,
  usdc.fakes.testnet DEVmw8oy2Qor5ePQAMwsoinY55jM1jTRWpULkYBQL9Bb.

## Pool-price honesty note (read before quoting a price)
- Testnet pools are seeded at arbitrary ratios by whoever created them;
  they do NOT track market prices. Of 84 wNEAR/USDC.e pools on
  ref-finance-101.testnet (2,911 pools total), pool 2896 is the one whose
  implied price is closest to a real NEAR price (~$4/NEAR at swap time:
  8.005 USDC.e vs 2 wNEAR). The big pools quote absurd prices (e.g. pool 54
  implies ~217M USDC.e per NEAR) — deep nominal liquidity, nonsense price.
  The run-2 swap is real (real AMM, real tokens, real tx, quote-matched
  output); the ~$4 implied price is a testnet artefact, not a market price.

## Live demo run 1 — naive vs guarded, chain-read (2026-11-05)
Log: oneshot-step3/testnet-run-1.log (in the work branch staging, not main yet)
- Naive (no guard): venue.execute directly x3 -> venue fills 3.
- Guarded decision 4285793a876108bd3f04285943f31857e54f90ec35b45e1c857ebbe05a467438:
  LIVE on chain, 0.01 NEAR reserved, venue filled once, promise callback
  settled it, in_air back to 0.
- Guarded retries x3 on the same decision: all blocked on chain,
  "ONESHOT: retry blocked — decision already SETTLED".
- Final venue fills, chain-read: 4 (3 naive + 1 guarded, exactly as designed).
- Guarded trade tx: GrEXMPm4QEjCBRkyCFzccfFcD42KLBgmZKdi7rPboTvM

## Mock verifier live test (2026-11-05)
- Unknown nonce -> null. Publish adapter nonce -> Live. Reused nonce ->
  blocked ("nonce already used"). Settle -> Settled. Past deadline -> Expired.
- Adapter nonce used: AQIDBMbZD+zoYia0YFVXCS76vgE1qNcc5rw0afWlhmA=
  (salt 01020304 from verifier current_salt + decision hash, 32 bytes).

## Unit tests
- Guard contract: 13/13 (Step 1, incl. cancel).
- Agent loop: 7/7. Intents adapter: 5/5. Mock verifier: 5/5.
- Ref venue: 4/4 (payload parsing/defaults, 2026-11-07).

## Real 1Click dry quote (roadmap item 4) — completed 2026-11-07
- Token list: GET https://1click.chaindefuser.com/v0/tokens (216 entries).
  USDC on NEAR, from the list (not guessed):
  `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`
  (6 decimals, price $0.999718). Native NEAR has no token-list entry;
  wNEAR `nep141:wrap.near` (24 decimals) is the NEAR-side asset.
- Reproducer: `bun run scripts/oneclick-dry-quote.ts` (uses the adapter's
  dryQuote(), POST /v0/quote with dry:true — free, no depositAddress is
  returned, nothing is deposited or spent).
- Live result, 2026-11-07 02:25 UTC: 0.1 wNEAR -> 0.374346 USDC
  (amountOut `374346`, amountOutUsd $0.37424, minAmountOut `370602`,
  timeEstimate 12s, refundFee `0`, withdrawFee `0`).
  Correlation id `e9df204c-48f8-470c-abbd-f2701c81cf8f`.
  Full request/response in the script's output; the script re-resolves
  the token ids from the live token list on every run.
- What the earlier probes got wrong (found by testing each field in
  isolation, all dry:true): depositType ORIGIN_CHAIN fails for a NEAR
  origin and recipientType DESTINATION_CHAIN fails for a NEAR
  destination, both with a bare HTTP 400 `{"message":"Internal server
  error"}`. The working shape is depositType INTENTS, refundType
  INTENTS, recipientType INTENTS. Cross-checks the same day: USDC arb
  -> USDC eth ($1,000) and wNEAR -> USDC eth (100 NEAR, INTENTS) also
  quoted fine, so the failures were pair/routing-specific, not the
  request shape. 1Click is mainnet-only, so the recipient/refund
  account is the mainnet-style `oneshot-guard.near` (format only — a
  dry quote moves no funds).
- This is a dry quote only, NOT a settlement: no trade was made, no
  deposit address was issued, and no solver filled anything.

## Honest limitations — read before judging
- The venue in testnet demo run 1 is the mock venue, not a real DEX.
  The guard's decisions are real on-chain verdicts; the trade itself
  in that demo is a mock fill, labelled as such. Run 2 replaces it with
  a real Ref Finance testnet swap (see above); the mock venue is now
  run-1/sandbox only, and the frontend replay is a dramatization of the
  mock run, not of run 2.
- The USDC.e from the run-2 swap sits in the ref-venue contract, not in
  the agent's wallet — the venue has no forward-to-agent step yet. The
  amount is chain-readable (ft_balance_of) and the swap is exactly-once,
  but the agent does not end up holding the USDC.e.
- Testnet pool prices are arbitrary (see pool-price note above). Pool 2896
  was chosen for the sanest implied price and enough depth for a 0.01 NEAR
  swap; a larger swap would move it materially (only ~8 USDC.e / 2 wNEAR
  deep at run time).
- The verifier on testnet is a mock verifier, NOT intents.near.
  It copies the nonce/deadline/settled shape so the adapter can be
  proven end to end for $0. It does no real cross-chain settlement
  and checks no NEP-413 signature.
- No mainnet Intents settlement is claimed. Two dry-run probes were
  done and their limits are stated: the 1Click dry quote now succeeds
  with the correct token-list asset id (see "Real 1Click dry quote"
  above) — it is a price preview only, not a settlement; no deposit
  address was issued and nothing was deposited; simulate_intents on
  intents.near returned a format error ("missing field `signed`"),
  meaning a full simulation needs a real mainnet signer signature.
