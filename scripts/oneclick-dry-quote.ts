// OneShot roadmap item 4 — real 1Click dry quote (dry:true, $0, commits nothing).
//
// Resolves the token ids from the live 1Click token list
// (GET https://1click.chaindefuser.com/v0/tokens) instead of guessing them,
// then requests a dry quote for wNEAR -> USDC on NEAR via the adapter's
// dryQuote() (POST https://1click.chaindefuser.com/v0/quote, dry:true).
// A dry quote returns no depositAddress and commits no trade; nothing is
// deposited, nothing is spent. Run with: bun run scripts/oneclick-dry-quote.ts
//
// Verified 2026-11-07: USDC on NEAR is
//   nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
// (6 decimals, from the token list). Native NEAR has no entry in the list;
// wNEAR (nep141:wrap.near, 24 decimals) is the listed NEAR-side asset.
//
// Two things the earlier probes got wrong, found 2026-11-07 by testing
// each field in isolation (all requests dry:true):
//   - depositType ORIGIN_CHAIN fails for a NEAR origin with a bare
//     "Internal server error" (HTTP 400); depositType INTENTS works.
//   - recipientType DESTINATION_CHAIN fails for a NEAR destination the
//     same way; recipientType INTENTS works.
// 1Click is mainnet-only, so the recipient/refund account is the
// mainnet-style oneshot-guard.near (format only — a dry quote moves no
// funds). Cross-checks that day: USDC arb -> USDC eth ($1,000) and
// wNEAR -> USDC eth (100 NEAR, INTENTS) also quoted fine, proving the
// request shape is valid and the failures were pair/routing-specific.

import { dryQuote, ONECLICK_BASE } from "../adapter/intents-adapter";

const NEAR_USDC =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const WNEAR = "nep141:wrap.near";
// Mainnet-style Intents account (format only — dry quotes move no funds).
const RECIPIENT = "oneshot-guard.near";

async function main() {
  // 1. Resolve token ids from the live token list, not from memory.
  const tokensRes = await fetch(`${ONECLICK_BASE}/tokens`);
  if (!tokensRes.ok) throw new Error(`token list failed: ${tokensRes.status}`);
  const tokens: any[] = await tokensRes.json();
  const usdcNear = tokens.find(
    (t) => t.blockchain === "near" && t.symbol === "USDC"
  );
  const wnear = tokens.find((t) => t.assetId === WNEAR);
  console.log("token list entries:", tokens.length);
  console.log("USDC on NEAR:", JSON.stringify(usdcNear));
  console.log("wNEAR:", JSON.stringify(wnear));
  if (!usdcNear || usdcNear.assetId !== NEAR_USDC) {
    throw new Error("USDC-on-NEAR asset id changed or missing from token list");
  }

  // 2. Dry quote: 0.1 wNEAR -> USDC on NEAR, EXACT_INPUT, 1% slippage.
  // NEAR-side legs go through INTENTS (see header note above).
  const quoteRequest = {
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: WNEAR,
    depositType: "INTENTS",
    destinationAsset: NEAR_USDC,
    amount: "100000000000000000000000", // 0.1 wNEAR (24 decimals)
    refundTo: RECIPIENT,
    refundType: "INTENTS",
    recipient: RECIPIENT,
    recipientType: "INTENTS",
    deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    quoteWaitingTimeMs: 10000,
  };
  console.log("quote request:", JSON.stringify(quoteRequest, null, 2));
  const quote = await dryQuote(quoteRequest);
  console.log("dry quote response:", JSON.stringify(quote, null, 2));
}

main().catch((e) => {
  console.error("DRY QUOTE FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
