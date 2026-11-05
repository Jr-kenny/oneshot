// Run from the repo root with near-api-js installed; keys are read from
// ~/.near-credentials/testnet/ and are never in this repo.
// OneShot Step 3 — direct testnet deploy (near-api-js v5, no workspaces).
// Master: oneshot-guard.testnet (fresh, faucet 10 NEAR, NOT the user's
// rewards account). Guard deploys directly to the master account.
// Subaccounts: venue / verifier / agent under the master, funded 2 / 2 / 1 NEAR.
// Keys for subaccounts are saved to ~/.near-credentials/testnet/ (600) and
// are NEVER printed or committed.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const na = require("near-api-js");
const NEAR24 = (n) => BigInt(n) * 10n ** 24n;
const MASTER = "oneshot-guard.testnet";
const WASM = {
  guard: "contract/target/wasm32-unknown-unknown/release/oneshot_guard.wasm",
  venue: "contract/target/wasm32-unknown-unknown/release/mock_venue.wasm",
  verifier: "contract/mock-verifier/target/wasm32-unknown-unknown/release/oneshot_mock_verifier.wasm",
};
function saveKey(accountId, kp) {
  const dir = path.join(os.homedir(), ".near-credentials", "testnet");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, accountId + ".json"),
    JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), secret_key: kp.toString() }, null, 2),
    { mode: 0o600 });
}
(async () => {
  const keyStore = new na.keyStores.InMemoryKeyStore();
  const masterKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", MASTER + ".json"), "utf8"));
  await keyStore.setKey("testnet", MASTER, na.KeyPair.fromString(masterKey.secret_key));
  const near = await na.connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org", keyStore, headers: {} });
  const master = await near.account(MASTER);
  console.log("master:", MASTER);
  console.log("deploying guard to master...");
  await master.deployContract(fs.readFileSync(WASM.guard));
  await master.functionCall({ contractId: MASTER, methodName: "new", args: { default_ceiling: NEAR24(100).toString() }, gas: 300n * 10n ** 12n, attachedDeposit: 0n });
  console.log("guard:", MASTER, "https://explorer.testnet.near.org/accounts/" + MASTER);
  for (const [sub, amount, wasm, init] of [
    ["venue", 2, WASM.venue, { methodName: "new", args: {} }],
    ["verifier", 2, WASM.verifier, { methodName: "new", args: { salt: "01020304" } }],
  ]) {
    const id = sub + "." + MASTER;
    const kp = na.KeyPair.fromRandom("ed25519");
    saveKey(id, kp);
    await keyStore.setKey("testnet", id, kp);
    await master.createAccount(id, kp.getPublicKey(), NEAR24(amount));
    const acc = await near.account(id);
    await acc.deployContract(fs.readFileSync(wasm));
    await acc.functionCall({ contractId: id, methodName: init.methodName, args: init.args, gas: 300n * 10n ** 12n, attachedDeposit: 0n });
    console.log(sub + ":", id, "https://explorer.testnet.near.org/accounts/" + id);
  }
  const agentId = "agent." + MASTER;
  const agentKp = na.KeyPair.fromRandom("ed25519");
  saveKey(agentId, agentKp);
  await master.createAccount(agentId, agentKp.getPublicKey(), NEAR24(1));
  console.log("agent:", agentId, "https://explorer.testnet.near.org/accounts/" + agentId);
  const venue = await near.account("venue." + MASTER);
  const verifier = await near.account("verifier." + MASTER);
  console.log("venue get_fills:", await venue.viewFunction({ contractId: "venue." + MASTER, methodName: "get_fills", args: {} }));
  console.log("verifier current_salt:", await verifier.viewFunction({ contractId: "verifier." + MASTER, methodName: "current_salt", args: {} }));
  const bal = await master.getAccountBalance();
  console.log("master available balance (NEAR):", Number(bal.available) / 1e24);
  process.exit(0);
})().catch((e) => { console.error("DEPLOY FAILED:", (e.message || String(e)).slice(0, 1500)); process.exit(1); });
