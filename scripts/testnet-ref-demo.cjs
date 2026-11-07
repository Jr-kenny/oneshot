// Run from the repo root with near-api-js installed; keys are read from
// ~/.near-credentials/testnet/ and are never in this repo.
// OneShot roadmap item 3 — live testnet demo run 2: GUARDED REAL REF SWAP.
// Guard: oneshot-guard.testnet, Ref venue: ref-venue.oneshot-guard.testnet,
// Agent: agent.oneshot-guard.testnet (faucet NEAR only).
// Steps, all chain-read:
//   1. Quote pool 2896 (wNEAR/USDC.e) for 0.01 wNEAR via get_return.
//   2. GUARDED: agent calls guard.execute_decision once, venue = ref venue,
//      deposit 0.01 NEAR -> venue wraps it and swaps it on Ref Finance
//      testnet (ref-finance-101.testnet). Decision goes LIVE, then the
//      promise callback settles it once the swap chain succeeds.
//   3. Verify on chain: decision SETTLED, venue get_swaps +1, venue
//      USDC.e balance up by the quoted amount (minus fee/slippage).
//   4. GUARDED RETRIES: same decision 3x more -> all blocked on chain
//      ("already SETTLED"), no second swap.
// Prints account ids, decision id, tx hashes and chain-read counts only.
// Never prints keys.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const na = require("near-api-js");
const GUARD = "oneshot-guard.testnet";
const VENUE = "ref-venue.oneshot-guard.testnet";
const AGENT = "agent.oneshot-guard.testnet";
const REF = "ref-finance-101.testnet";
const USDC = "usdc.fakes.testnet";
const POOL = 2896;
const NEAR24 = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n; // n NEAR, 6dp precision
const TGAS = 300n * 10n ** 12n;
function decisionKey(agent, p) {
  const base = { agent, asset: p.asset, size: p.size.toFixed(2), dir: p.direction, slip: p.slippageTolerance, exp: p.expirySec };
  return crypto.createHash("sha256").update(JSON.stringify({ v: 1, ...base })).digest("hex");
}
(async () => {
  const keyStore = new na.keyStores.InMemoryKeyStore();
  const agentKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", AGENT + ".json"), "utf8"));
  await keyStore.setKey("testnet", AGENT, na.KeyPair.fromString(agentKey.secret_key));
  const near = await na.connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org", keyStore, headers: {} });
  const agent = await near.account(AGENT);
  const view = async (contractId, methodName, args) => agent.viewFunction({ contractId, methodName, args });

  const deposit = NEAR24(0.01);
  const quote = await view(REF, "get_return", { pool_id: POOL, token_in: "wrap.testnet", amount_in: deposit.toString(), token_out: USDC });
  const quoteOut = BigInt(quote);
  const minOut = (quoteOut * 95n) / 100n; // 5% slippage tolerance
  console.log("pool 2896 quote: 0.01 wNEAR ->", quoteOut.toString(), "USDC.e base units (6dp); min_out:", minOut.toString());
  const swapsBefore = Number(await view(VENUE, "get_swaps", {}));
  const usdcBefore = BigInt(await view(USDC, "ft_balance_of", { account_id: VENUE }));
  console.log("ref venue swaps before (chain):", swapsBefore, "| USDC.e balance before:", usdcBefore.toString());

  // Fresh decision identity: same shape as run 1 but expirySec 900, so this
  // is a NEW decision (run 1's id is already SETTLED and must stay that way).
  const params = { asset: "NEAR/USDC", size: 500, direction: "BUY", slippageTolerance: 0.005, expirySec: 900 };
  const id = decisionKey(AGENT, params);
  console.log("guarded decision_id:", id);
  const block = await agent.connection.provider.block({ finality: "final" });
  const height = Number(block.header.height);
  console.log("current height:", height);
  const payload = JSON.stringify({ pool_id: POOL, min_amount_out: minOut.toString() });
  const out = await agent.functionCall({
    contractId: GUARD, methodName: "execute_decision",
    args: { args: { decision_id: id, venue: VENUE, method: "execute", args: payload, deposit: deposit.toString(), expiry_height: height + 900 } },
    gas: TGAS, attachedDeposit: deposit,
  });
  console.log("guarded attempt 1 tx:", out.transaction.hash, "https://explorer.testnet.near.org/transactions/" + out.transaction.hash);
  // Poll for settlement via callback (swap chain takes a few blocks)
  let decision = null;
  for (let i = 0; i < 45; i++) {
    decision = await view(GUARD, "get_decision", { decision_id: id }).catch(() => null);
    if (decision && decision.state !== "Live") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("guarded decision after callback:", JSON.stringify(decision));
  const swapsAfter = Number(await view(VENUE, "get_swaps", {}));
  const usdcAfter = BigInt(await view(USDC, "ft_balance_of", { account_id: VENUE }));
  const lastSwap = await view(VENUE, "get_last_swap", {});
  console.log("ref venue swaps after (chain):", swapsAfter, "delta:", swapsAfter - swapsBefore);
  console.log("ref venue USDC.e balance after:", usdcAfter.toString(), "delta:", (usdcAfter - usdcBefore).toString(), "base units =", Number(usdcAfter - usdcBefore) / 1e6, "USDC.e");
  console.log("ref venue last_swap:", JSON.stringify(lastSwap));
  const inAir = await view(GUARD, "get_in_air", { agent: AGENT });
  console.log("final in_air (yocto):", inAir);
  // Guarded retries x3 — must all be blocked, and must NOT swap again
  const blocked = [];
  for (let i = 2; i <= 4; i++) {
    try {
      await agent.functionCall({
        contractId: GUARD, methodName: "execute_decision",
        args: { args: { decision_id: id, venue: VENUE, method: "execute", args: payload, deposit: deposit.toString(), expiry_height: height + 900 } },
        gas: TGAS, attachedDeposit: deposit,
      });
      blocked.push(`retry ${i}: NOT BLOCKED (unexpected)`);
    } catch (e) {
      const msg = String(e.message || e);
      blocked.push(`retry ${i}: blocked (${msg.includes("already SETTLED") ? "already SETTLED" : msg.includes("state is LIVE") ? "LIVE" : msg.slice(0, 120)})`);
    }
  }
  blocked.forEach((b) => console.log(b));
  const swapsFinal = Number(await view(VENUE, "get_swaps", {}));
  const usdcFinal = BigInt(await view(USDC, "ft_balance_of", { account_id: VENUE }));
  console.log("final ref venue swaps (chain):", swapsFinal, "| final USDC.e balance:", usdcFinal.toString());
  console.log("SUMMARY: guarded Ref swap =", swapsAfter - swapsBefore, "| USDC.e received =", Number(usdcAfter - usdcBefore) / 1e6, "| decision =", decision ? decision.state : "unknown", "| guarded retries blocked =", blocked.filter((b) => b.includes("blocked")).length, "/ 3 | swaps after retries =", swapsFinal);
  if (decision?.state !== "Settled" || swapsAfter - swapsBefore !== 1 || swapsFinal !== swapsAfter) {
    console.error("REF DEMO MISMATCH: expected exactly 1 settled swap and 3 blocked retries");
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error("REF DEMO FAILED:", (e.message || String(e)).slice(0, 2000)); process.exit(1); });
