// Run from the repo root with near-api-js installed; keys are read from
// ~/.near-credentials/testnet/ and are never in this repo.
// OneShot roadmap item 3 — deploy the REAL Ref Finance testnet venue.
//   Ref venue: ref-venue.oneshot-guard.testnet (new subaccount, 1 NEAR)
//   Ref exchange: ref-finance-101.testnet, wNEAR wrap.testnet,
//   USDC.e usdc.fakes.testnet, default pool 2896 (wNEAR/USDC.e).
// Also redeploys the guard wasm to oneshot-guard.testnet: the ONLY guard
// change is VENUE_GAS 15 -> 100 TGas (the Ref chain needs a wrap hop +
// an ft_transfer_call + the swap inside it). The guard state layout is
// unchanged, so the redeploy preserves all decision records — verified
// at the end by re-reading the run-1 decision (must still be SETTLED).
// Master: oneshot-guard.testnet (fresh project account, faucet NEAR,
// NOT the user's rewards account).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const na = require("near-api-js");
const NEAR24 = (n) => BigInt(n) * 10n ** 24n;
const MASTER = "oneshot-guard.testnet";
const REF_VENUE = "ref-venue." + MASTER;
const WASM = {
  guard: "contract/target/wasm32-unknown-unknown/release/oneshot_guard.wasm",
  refVenue: "contract/target/wasm32-unknown-unknown/release/oneshot_ref_venue.wasm",
};
// Run-1 guarded decision id (mock venue) — must still read SETTLED after redeploy.
const RUN1_DECISION = "4285793a876108bd3f04285943f31857e54f90ec35b45e1c857ebbe05a467438";
function saveKey(accountId, kp) {
  const dir = path.join(os.homedir(), ".near-credentials", "testnet");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, accountId + ".json"),
    JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), secret_key: kp.toString() }, null, 2),
    { mode: 0o600 });
}
(async () => {
  for (const [name, p] of Object.entries(WASM)) {
    if (!fs.existsSync(p)) throw new Error(`missing wasm: ${p} — run: cd contract && cargo build --release --target wasm32-unknown-unknown --workspace`);
  }
  const keyStore = new na.keyStores.InMemoryKeyStore();
  const masterKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", MASTER + ".json"), "utf8"));
  await keyStore.setKey("testnet", MASTER, na.KeyPair.fromString(masterKey.secret_key));
  const near = await na.connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org", keyStore, headers: {} });
  const master = await near.account(MASTER);
  const view = async (acc, c, m, a) => acc.viewFunction({ contractId: c, methodName: m, args: a });

  // 1 — create + deploy the ref venue subaccount (skip create if it exists)
  const kp = na.KeyPair.fromRandom("ed25519");
  let created = false;
  const exists = await near.connection.provider.query({
    request_type: "view_account", account_id: REF_VENUE, finality: "final",
  }).then(() => true).catch(() => false);
  if (!exists) {
    await master.createAccount(REF_VENUE, kp.getPublicKey(), NEAR24(3));
    created = true;
    saveKey(REF_VENUE, kp);
    console.log("created ref venue account:", REF_VENUE);
  } else {
    console.log("ref venue account already exists, redeploying code only:", REF_VENUE);
  }
  await keyStore.setKey("testnet", REF_VENUE, created ? kp : na.KeyPair.fromString(JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", REF_VENUE + ".json"), "utf8")).secret_key));
  const venueAcc = await near.account(REF_VENUE);
  await venueAcc.deployContract(fs.readFileSync(WASM.refVenue));
  console.log("deployed ref venue wasm to", REF_VENUE);
  await venueAcc.functionCall({ contractId: REF_VENUE, methodName: "new", args: {}, gas: 300n * 10n ** 12n, attachedDeposit: 0n });
  console.log("ref venue config:", JSON.stringify(await view(venueAcc, REF_VENUE, "get_config", {})));
  console.log("ref venue swaps:", await view(venueAcc, REF_VENUE, "get_swaps", {}));

  // 2 — register the venue on both FT contracts (it must hold wNEAR briefly + USDC.e)
  for (const token of ["wrap.testnet", "usdc.fakes.testnet"]) {
    const bal = await view(venueAcc, token, "storage_balance_of", { account_id: REF_VENUE });
    if (bal && bal.total !== undefined) {
      console.log("already registered on", token, JSON.stringify(bal));
      continue;
    }
    const bounds = await view(venueAcc, token, "storage_balance_bounds", {});
    const out = await venueAcc.functionCall({ contractId: token, methodName: "storage_deposit", args: { account_id: REF_VENUE }, gas: 30n * 10n ** 12n, attachedDeposit: BigInt(bounds.min) });
    console.log("storage_deposit", token, "tx:", out.transaction.hash);
  }

  // 3 — redeploy the guard (VENUE_GAS bump only; state layout unchanged)
  console.log("redeploying guard wasm to", MASTER, "(VENUE_GAS 15 -> 100 TGas)...");
  await master.deployContract(fs.readFileSync(WASM.guard));
  const run1 = await view(master, MASTER, "get_decision", { decision_id: RUN1_DECISION });
  console.log("run-1 decision after guard redeploy:", JSON.stringify(run1));
  if (!run1 || run1.state !== "Settled") throw new Error("guard state NOT preserved by redeploy — run-1 decision is not Settled");
  console.log("guard state preserved: run-1 decision still SETTLED.");
  console.log("ref venue USDC.e balance:", await view(venueAcc, "usdc.fakes.testnet", "ft_balance_of", { account_id: REF_VENUE }));
  console.log("REF VENUE DEPLOY DONE:", REF_VENUE, "https://explorer.testnet.near.org/accounts/" + REF_VENUE);
  process.exit(0);
})().catch((e) => { console.error("REF DEPLOY FAILED:", (e.message || String(e)).slice(0, 2000)); process.exit(1); });
