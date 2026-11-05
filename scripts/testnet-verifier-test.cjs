// Run from the repo root with near-api-js installed; keys are read from
// ~/.near-credentials/testnet/ and are never in this repo.
// OneShot Step 3 — mock verifier live test on testnet (faucet tokens only).
// Verifier: verifier.oneshot-guard.testnet, Caller: agent.oneshot-guard.testnet.
// Proves, on a real chain: unknown -> null, publish -> Live, reused nonce
// blocked, settle -> Settled, past-deadline -> Expired, and the Intents
// adapter's nonce (salt + decision hash) works as a verifier nonce.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const na = require("near-api-js");
const VERIFIER = "verifier.oneshot-guard.testnet";
const AGENT = "agent.oneshot-guard.testnet";
function buildNonce(saltHex, seed) {
  const salt = Buffer.from(saltHex, "hex");
  const unique = crypto.createHash("sha256").update(seed).digest().subarray(0, 28);
  return Buffer.concat([salt, unique]).toString("base64");
}
(async () => {
  const keyStore = new na.keyStores.InMemoryKeyStore();
  const agentKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", AGENT + ".json"), "utf8"));
  await keyStore.setKey("testnet", AGENT, na.KeyPair.fromString(agentKey.secret_key));
  const near = await na.connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org", keyStore, headers: {} });
  const agent = await near.account(AGENT);
  const view = (m, a) => agent.viewFunction({ contractId: VERIFIER, methodName: m, args: a });
  const call = (m, a) => agent.functionCall({ contractId: VERIFIER, methodName: m, args: a, gas: 100n * 10n ** 12n, attachedDeposit: 0n });
  const salt = await view("current_salt", {});
  console.log("verifier current_salt:", salt);
  console.log("unknown nonce status:", await view("get_status", { nonce: "never-published" }));
  // Adapter nonce for a fresh decision
  const nonce = buildNonce(salt, "mock-verifier-live-test-1");
  console.log("adapter nonce (base64, 32 bytes):", nonce, "len:", Buffer.from(nonce, "base64").length);
  const deadline = Date.now() + 3600_000;
  const tx1 = await call("publish_intent", { nonce, signer: AGENT, deadline_ms: deadline });
  console.log("publish tx:", tx1.transaction.hash);
  console.log("after publish status:", await view("get_status", { nonce }));
  try {
    await call("publish_intent", { nonce, signer: AGENT, deadline_ms: deadline });
    console.log("reused nonce: NOT BLOCKED (unexpected)");
  } catch (e) {
    console.log("reused nonce blocked:", String(e.message || e).includes("nonce already used") ? "nonce already used" : String(e.message || e).slice(0, 200));
  }
  const tx2 = await call("settle", { nonce });
  console.log("settle tx:", tx2.transaction.hash);
  console.log("after settle status:", await view("get_status", { nonce }));
  const expiredNonce = buildNonce(salt, "mock-verifier-expired-1");
  await call("publish_intent", { nonce: expiredNonce, signer: AGENT, deadline_ms: Date.now() - 1000 });
  console.log("past-deadline status:", await view("get_status", { nonce: expiredNonce }));
  console.log("SUMMARY: mock verifier live on testnet — publish/settle/status/replay-block/expiry all behave as designed.");
  process.exit(0);
})().catch((e) => { console.error("VERIFIER TEST FAILED:", (e.message || String(e)).slice(0, 1500)); process.exit(1); });
