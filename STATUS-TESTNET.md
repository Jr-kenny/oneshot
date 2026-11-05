# OneShot — testnet status (verified 2026-11-05)

## Live on NEAR testnet (faucet tokens)
- Guard: oneshot-guard.testnet — https://explorer.testnet.near.org/accounts/oneshot-guard.testnet
- Venue (mock venue wasm): venue.oneshot-guard.testnet
- Mock verifier: verifier.oneshot-guard.testnet
- Demo agent: agent.oneshot-guard.testnet
- Master account creation tx: BKqP9vDv2mfA6rEm3kJ25uGL42BURTKMWep2LFTpk6Sz
- These accounts are a fresh project set created for testnet verification.

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
- Agent loop: 7/7. Intents adapter: 3/3. Mock verifier: 5/5.

## Honest limitations — read before judging
- The venue in the testnet demo is the mock venue, not a real DEX.
  The guard's decisions are real on-chain verdicts; the trade itself
  in that demo is a mock fill, labelled as such.
- The verifier on testnet is a mock verifier, NOT intents.near.
  It copies the nonce/deadline/settled shape so the adapter can be
  proven end to end for $0. It does no real cross-chain settlement
  and checks no NEP-413 signature.
- No mainnet Intents settlement is claimed. Two dry-run probes were
  done and their limits are stated: 1Click dry quote rejected our
  guessed USDC asset ids ("tokenOut is not valid") — the correct
  1Click token id is still to be taken from their token list, not
  guessed; simulate_intents on intents.near returned a format error
  ("missing field `signed`"), meaning a full simulation needs a real
  mainnet signer signature.
