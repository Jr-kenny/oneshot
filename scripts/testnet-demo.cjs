// Run from the repo root with near-api-js installed; keys are read from
// ~/.near-credentials/testnet/ and are never in this repo.
// OneShot Step 2/3 — live testnet demo run (faucet tokens only).
// Guard: oneshot-guard.testnet, Venue: venue.oneshot-guard.testnet,
// Agent: agent.oneshot-guard.testnet (1 NEAR, funded at deploy).
// Steps, all chain-read:
//   1. baseline venue fills
//   2. NAIVE: agent calls venue.execute directly 3x -> fills +3 (no guard)
//   3. GUARDED: agent calls guard.execute_decision once -> fills +1, decision SETTLED via callback
//   4. GUARDED RETRIES: same decision 3x more -> all blocked (already SETTLED), fills unchanged
//   5. Final chain reads: fills, decision state, in_air
// Prints account ids, decision id, tx hashes and chain-read counts only.
// Never prints keys.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const na = require("near-api-js");
const GUARD = "oneshot-guard.testnet";
const VENUE = "venue.oneshot-guard.testnet";
const AGENT = "agent.oneshot-guard.testnet";
const NEAR24 = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n; // n NEAR, 6dp precision
const TGAS = 300n * 10n ** 12n;
function decisionKey(agent, p) {
  const base = { agent, asset: p.asset, size: p.size.toFixed(2), dir: p.direction, slip: p.slippageTolerance, exp: p.expirySec };
  return crypto.createHash("sha256").update(JSON.stringify({ v: 1, ...base })).digest("hex");
}
async function currentHeight(provider) {
  const b = await provider.query({ request_type: "block", finality: "final" }).catch(() => null);
  // near-api-js v5 provider.query for block returns via JsonRpcProvider directly:
  return b;
}
(async () => {
  const keyStore = new na.keyStores.InMemoryKeyStore();
  const agentKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", AGENT + ".json"), "utf8"));
  await keyStore.setKey("testnet", AGENT, na.KeyPair.fromString(agentKey.secret_key));
  const near = await na.connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org", keyStore, headers: {} });
  const agent = await near.account(AGENT);
  const provider = agent.connection.provider;
  const view = async (contractId, methodName, args) => agent.viewFunction({ contractId, methodName, args });
  const baseline = await view(VENUE, "get_fills", {});
  console.log("baseline venue fills (chain):", baseline);
  // Naive x3
  for (let i = 1; i <= 3; i++) {
    const out = await agent.functionCall({ contractId: VENUE, methodName: "execute", args: { payload: JSON.stringify({ attempt: i }) }, gas: 100n * 10n ** 12n, attachedDeposit: 0n });
    console.log(`naive attempt ${i} tx:`, out.transaction.hash, "https://explorer.testnet.near.org/transactions/" + out.transaction.hash);
  }
  const afterNaive = await view(VENUE, "get_fills", {});
  console.log("after naive x3, venue fills (chain):", afterNaive, "delta:", afterNaive - baseline);
  // Guarded x1
  const params = { asset: "NEAR/USDC", size: 500, direction: "BUY", slippageTolerance: 0.005, expirySec: 600 };
  const id = decisionKey(AGENT, params);
  console.log("guarded decision_id:", id);
  const block = await provider.block({ finality: "final" });
  const height = Number(block.header.height);
  console.log("current height:", height);
  const deposit = NEAR24(0.01);
  const out = await agent.functionCall({
    contractId: GUARD, methodName: "execute_decision",
    args: { args: { decision_id: id, venue: VENUE, method: "execute", args: JSON.stringify({ asset: "NEAR/USDC", direction: "BUY", slippage: 0.005 }), deposit: deposit.toString(), expiry_height: height + 600 } },
    gas: TGAS, attachedDeposit: deposit,
  });
  console.log("guarded attempt 1 tx:", out.transaction.hash, "https://explorer.testnet.near.org/transactions/" + out.transaction.hash);
  // Poll for settlement via callback
  let decision = null;
  for (let i = 0; i < 30; i++) {
    decision = await view(GUARD, "get_decision", { decision_id: id }).catch(() => null);
    if (decision && decision.state !== "Live") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("guarded decision after callback:", JSON.stringify(decision));
  const afterGuarded = await view(VENUE, "get_fills", {});
  console.log("after guarded x1, venue fills (chain):", afterGuarded, "delta vs naive:", afterGuarded - afterNaive);
  // Guarded retries x3 — must all be blocked
  const blocked = [];
  for (let i = 2; i <= 4; i++) {
    try {
      await agent.functionCall({
        contractId: GUARD, methodName: "execute_decision",
        args: { args: { decision_id: id, venue: VENUE, method: "execute", args: JSON.stringify({ asset: "NEAR/USDC", direction: "BUY", slippage: 0.005 }), deposit: deposit.toString(), expiry_height: height + 600 } },
        gas: TGAS, attachedDeposit: deposit,
      });
      blocked.push(`retry ${i}: NOT BLOCKED (unexpected)`);
    } catch (e) {
      const msg = String(e.message || e);
      blocked.push(`retry ${i}: blocked (${msg.includes("already SETTLED") ? "already SETTLED" : msg.includes("state is LIVE") ? "LIVE" : msg.slice(0, 120)})`);
    }
  }
  blocked.forEach((b) => console.log(b));
  const finalFills = await view(VENUE, "get_fills", {});
  const finalDecision = await view(GUARD, "get_decision", { decision_id: id });
  const inAir = await view(GUARD, "get_in_air", { agent: AGENT });
  console.log("final venue fills (chain):", finalFills);
  console.log("final decision:", JSON.stringify(finalDecision));
  console.log("final in_air (yocto):", inAir);
  console.log("SUMMARY: naive fills =", afterNaive - baseline, "| guarded fills =", afterGuarded - afterNaive, "| guarded retries blocked =", blocked.filter((b) => b.includes("blocked")).length, "/ 3 | final fills =", finalFills);
  process.exit(0);
})().catch((e) => { console.error("DEMO FAILED:", (e.message || String(e)).slice(0, 1500)); process.exit(1); });
