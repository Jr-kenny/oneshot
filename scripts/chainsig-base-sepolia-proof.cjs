// OneShot Chain Signatures proof — Base Sepolia, TESTNET ONLY.
// Branch: chainsig-sepolia-proof. Never run on mainnet. Faucet tokens only.
// Never touches jrkenny.near (the rewards account).
//
// What this proves, in order:
//   1. The Sepolia address controlled by agent.oneshot-guard.testnet + path
//      "oneshot-sepolia-1" is derived from the MPC contract itself
//      (v1.signer-prod.testnet, derived_public_key view, domain 0 Secp256k1).
//   2. A guarded decision for that Sepolia transfer goes LIVE on the NEAR
//      testnet guard (oneshot-guard.testnet) and settles via its venue callback.
//   3. ONLY after the guard state is read back as Live/Settled does the script
//      ask the MPC signer to sign the Sepolia transaction. The gate check is
//      in this script (it reads get_decision first); the guard contract itself
//      does not yet call the MPC contract on-chain — that is the next step,
//      NOT claimed here.
//   4. The MPC signature is verified locally (recovered address == derived
//      address) and the signed tx is broadcast once to Sepolia.
//   5. A retry of the same decision is blocked by the guard on-chain
//      ("already SETTLED"), and NO second MPC sign or Sepolia broadcast is made.
//
// Funding: the derived Sepolia address needs Sepolia ETH for gas. If it has
// none, step 4's broadcast will fail with insufficient funds — the script
// records that instead of faking it, and the signed tx is kept for broadcast
// once the address is funded from a Sepolia faucet.
//
// Run from the repo root:  node scripts/chainsig-sepolia-proof.cjs
// Keys are read from ~/.near-credentials/testnet/ and are never in this repo.
// Uses near-api-js v5 (the v5 copy bundled in this repo's node_modules) plus
// bs58 / noble-hashes / secp256k1 copies already in node_modules/.bun.
// Sepolia side uses hand-rolled RLP + keccak256 (no ethers dependency).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const NA_PATH = path.join(__dirname, "..", "node_modules", ".bun", "near-api-js@5.1.1", "node_modules", "near-api-js");
const na = require(NA_PATH);

const GUARD = "oneshot-guard.testnet";
const VENUE = "venue.oneshot-guard.testnet"; // mock venue on NEAR testnet
const AGENT = "agent.oneshot-guard.testnet";
const MPC = "v1.signer-prod.testnet";
const PATH_DERIVATION = "oneshot-sepolia-1";
const SEPOLIA_CHAIN_ID = 84532;
const SEPOLIA_RPC = "https://sepolia.base.org";
const SEPOLIA_EXPLORER = "https://sepolia.basescan.org/tx/";
const NEAR24 = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
const TGAS = 300n * 10n ** 12n;

function decisionKeyV2(agent, p) {
  const base = { v: 2, agent, asset: p.asset, size: p.size, dir: p.direction, slip: p.slippageTolerance, exp: p.expirySec, sepolia_to: p.sepoliaTo, sepolia_value_wei: p.sepoliaValueWei };
  return crypto.createHash("sha256").update(JSON.stringify(base)).digest("hex");
}

async function sepoliaRpc(method, params) {
  const res = await fetch(SEPOLIA_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`Sepolia RPC ${method} error: ${JSON.stringify(j.error)}`);
  return j.result;
}

// Minimal RLP encoder (legacy type-0 tx only).
function rlpEncode(input) {
  const encodeLength = (len, offset) => {
    if (len < 56) return Buffer.from([offset + len]);
    const bl = Buffer.from(len.toString(16).padStart(2, "0"), "hex");
    return Buffer.concat([Buffer.from([offset + 55 + bl.length]), bl]);
  };
  if (Buffer.isBuffer(input)) {
    if (input.length === 1 && input[0] < 0x80) return input;
    return Buffer.concat([encodeLength(input.length, 0x80), input]);
  }
  if (Array.isArray(input)) {
    const out = Buffer.concat(input.map(rlpEncode));
    return Buffer.concat([encodeLength(out.length, 0xc0), out]);
  }
  throw new Error("rlp: unsupported input");
}
function toBuf(n) { // BigInt -> minimal big-endian buffer (0 => empty)
  if (n === 0n) return Buffer.alloc(0);
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return Buffer.from(hex, "hex");
}
function addrBuf(a) { return Buffer.from(a.replace(/^0x/, ""), "hex"); }

(async () => {
  const log = { startedAt: new Date().toISOString(), derivationPath: PATH_DERIVATION, mpc: MPC, guard: GUARD, agent: AGENT };
  const keyStore = new na.keyStores.InMemoryKeyStore();
  const agentKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".near-credentials", "testnet", AGENT + ".json"), "utf8"));
  await keyStore.setKey("testnet", AGENT, na.KeyPair.fromString(agentKey.secret_key));
  const near = await na.connect({ networkId: "testnet", nodeUrl: "https://rpc.testnet.near.org", keyStore, headers: {} });
  const agent = await near.account(AGENT);
  const view = async (contractId, methodName, args) => agent.viewFunction({ contractId, methodName, args });

  // 1. Derive Sepolia address from the MPC contract (on-chain view).
  const derivedPk = await view(MPC, "derived_public_key", { predecessor: AGENT, path: PATH_DERIVATION });
  log.derivedPublicKey = derivedPk;
  console.log("derived_public_key (agent predecessor):", derivedPk);
  // NEAR secp256k1 public keys are 64-byte x||y, base58-encoded.
  const bs58 = require(path.join(__dirname, "..", "node_modules", ".bun", "bs58@4.0.1", "node_modules", "bs58"));
  const rawPk = Buffer.from(bs58.decode(derivedPk.split(":")[1]));
  if (rawPk.length !== 64) throw new Error(`unexpected derived pubkey length ${rawPk.length}, expected 64`);
  // keccak256 via node crypto (sha3-256 is NOT keccak256, so use ethers-style
  // keccak from the noble hashes copy in this repo if present, else fail loudly).
  let keccak256;
  try {
    keccak256 = require(path.join(__dirname, "..", "node_modules", ".bun", "@noble+hashes@1.7.1", "node_modules", "@noble", "hashes", "sha3.js")).keccak_256;
  } catch (e) {
    throw new Error("keccak_256 not available in repo node_modules; install ethers to run this script");
  }
  const hash = keccak256(rawPk);
  const sepoliaAddress = "0x" + Buffer.from(hash.slice(12)).toString("hex");
  log.sepoliaAddress = sepoliaAddress;
  log.derivedPublicKeyRawHex = rawPk.toString("hex");
  console.log("Sepolia address (agent predecessor, path oneshot-sepolia-1):", sepoliaAddress);

  // 2. Sepolia chain state for that address.
  const balanceHex = await sepoliaRpc("eth_getBalance", [sepoliaAddress, "latest"]);
  const nonceHex = await sepoliaRpc("eth_getTransactionCount", [sepoliaAddress, "latest"]);
  const gasPriceHex = await sepoliaRpc("eth_gasPrice", []);
  log.sepoliaBalanceWei = BigInt(balanceHex).toString();
  log.sepoliaNonce = parseInt(nonceHex, 16);
  log.sepoliaGasPriceWei = BigInt(gasPriceHex).toString();
  console.log("Sepolia balance (wei):", log.sepoliaBalanceWei, "| nonce:", log.sepoliaNonce, "| gasPrice (wei):", log.sepoliaGasPriceWei);

  // 3. Guarded decision on NEAR testnet, content-bound to this Sepolia transfer.
  const valueWei = 1000000000000000n; // 0.001 Sepolia ETH, to self
  const params = { asset: "ETH-BASE-SEPOLIA", size: "0.001", direction: "SEND", slippageTolerance: 0.005, expirySec: 600, sepoliaTo: sepoliaAddress, sepoliaValueWei: valueWei.toString() };
  const decisionId = decisionKeyV2(AGENT, params);
  log.decisionId = decisionId;
  log.decisionParams = params;
  console.log("guarded decision_id:", decisionId);
  const block = await agent.connection.provider.block({ finality: "final" });
  const height = Number(block.header.height);
  const deposit = NEAR24(0.01);
  const out = await agent.functionCall({
    contractId: GUARD, methodName: "execute_decision",
    args: { args: { decision_id: decisionId, venue: VENUE, method: "execute", args: JSON.stringify({ asset: "ETH-BASE-SEPOLIA", direction: "SEND", slippage: 0.005 }), deposit: deposit.toString(), expiry_height: height + 600 } },
    gas: TGAS, attachedDeposit: deposit,
  });
  log.guardTxHash = out.transaction.hash;
  console.log("guard execute_decision tx:", out.transaction.hash, "https://explorer.testnet.near.org/transactions/" + out.transaction.hash);

  // Poll for settlement via the venue callback.
  let decision = null;
  for (let i = 0; i < 30; i++) {
    decision = await view(GUARD, "get_decision", { decision_id: decisionId }).catch(() => null);
    if (decision && decision.state !== "Live") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  log.guardDecisionAfterCall = decision;
  console.log("guard decision after callback:", JSON.stringify(decision));
  if (!decision || (decision.state !== "Live" && decision.state !== "Settled")) {
    throw new Error(`GATE REFUSED: guard decision state is ${decision && decision.state}, not Live/Settled — NOT signing`);
  }
  console.log(`GATE PASSED: guard decision is ${decision.state} (reservation was locked, decision is ${decision.state === "Settled" ? "settled on NEAR" : "live"}). Only now requesting the MPC signature.`);

  // 4. Build the Sepolia legacy tx and its signing hash (keccak256 of RLP).
  const gasPrice = BigInt(log.sepoliaGasPriceWei) * 2n > 100000000n ? BigInt(log.sepoliaGasPriceWei) * 2n : 100000000n; // 2x, min 0.1 gwei on Base Sepolia
  const txFields = [toBuf(BigInt(log.sepoliaNonce)), toBuf(gasPrice), toBuf(21000n), addrBuf(sepoliaAddress), toBuf(valueWei), Buffer.alloc(0), toBuf(BigInt(SEPOLIA_CHAIN_ID)), Buffer.alloc(0), Buffer.alloc(0)];
  const signingHash = Buffer.from(keccak256(rlpEncode(txFields)));
  log.sepoliaTx = { type: "legacy-0", chainId: SEPOLIA_CHAIN_ID, nonce: log.sepoliaNonce, gasPriceWei: gasPrice.toString(), gasLimit: 21000, to: sepoliaAddress, valueWei: valueWei.toString(), data: "0x" };
  log.signingHashHex = "0x" + signingHash.toString("hex");
  console.log("Sepolia signing hash:", log.signingHashHex);

  // 5. MPC sign — ONLY after the gate above. Verified live 2026-11-08:
  // the v2 testnet contract's sign method takes {request:{payload, path,
  // key_version}} (domain_id defaults to 0, Secp256k1) and REQUIRES a 1-yocto
  // attached deposit ("Attached deposit is lower than required. Attached: 0,
  // required: 1"). Wrong schemas fail at deserialization before any MPC work,
  // so a corrected retry for the same payload is still one signature.
  // The returned Signature is {scheme:"Secp256k1",
  // big_r:{affine_point:"03..."/"02..." (compressed point, x = r)},
  // s:{scalar:"..."}, recovery_id:0|1} — read it from the tx receipts via
  // provider.txStatus, NOT getTransactionLastResult.
  const payload = Array.from(signingHash);
  let sig = null; let signTxHash = null; let signArgsUsed = null;
  const attempts = [{ request: { payload, path: PATH_DERIVATION, key_version: 0 } }];
  for (const args of attempts) {
    const res = await agent.functionCall({ contractId: MPC, methodName: "sign", args, gas: TGAS, attachedDeposit: 1n });
    signTxHash = res.transaction.hash;
    signArgsUsed = args;
    console.log("MPC sign tx:", signTxHash, "https://explorer.testnet.near.org/transactions/" + signTxHash);
    for (let i = 0; i < 20; i++) {
      const st = await agent.connection.provider.txStatus(signTxHash, AGENT).catch(() => null);
      if (st) {
        for (const r of [...(st.receipts_outcome || []), ...(st.transaction_outcome ? [st.transaction_outcome] : [])]) {
          const sv = r.outcome && r.outcome.status && r.outcome.status.SuccessValue;
          if (sv) {
            try { const cand = JSON.parse(Buffer.from(sv, "base64").toString("utf8")); if (cand && cand.scheme === "Secp256k1") { sig = cand; break; } } catch (_) {}
          }
        }
      }
      if (sig) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (sig) break;
    console.log("MPC sign tx landed but no signature parsed yet; args used:", JSON.stringify(args));
  }
  log.mpcSignTxHash = signTxHash;
  log.mpcSignArgsUsed = signArgsUsed;
  log.mpcSignature = sig;
  if (!sig) throw new Error("MPC signature not recovered from the sign tx outcome — NOT broadcasting, see log");
  console.log("MPC signature:", JSON.stringify(sig));

  // 6. Assemble the signed legacy tx and verify the recovered sender.
  // Signature shape (verified live): big_r.affine_point is a compressed
  // secp256k1 point hex ("02"/"03" + 32-byte x); r is that x. s.scalar is hex.
  const r = Buffer.from(sig.big_r.affine_point.slice(2), "hex");
  const s = Buffer.from(sig.s.scalar, "hex");
  const recoveryId = sig.recovery_id;
  if (r.length !== 32 || s.length !== 32 || (recoveryId !== 0 && recoveryId !== 1)) throw new Error(`bad signature shape r=${r.length} s=${s.length} recovery_id=${recoveryId}`);
  const v = BigInt(SEPOLIA_CHAIN_ID) * 2n + 35n + BigInt(recoveryId);
  const signedFields = [toBuf(BigInt(log.sepoliaNonce)), toBuf(gasPrice), toBuf(21000n), addrBuf(sepoliaAddress), toBuf(valueWei), Buffer.alloc(0), toBuf(v), r, s];
  const rawTx = "0x" + rlpEncode(signedFields).toString("hex");
  log.signedRawTx = rawTx;
  log.mpcSignatureParsed = { r: "0x" + r.toString("hex"), s: "0x" + s.toString("hex"), recovery_id: recoveryId, v: v.toString() };
  // Verify sender by recovering the address from (hash, r, s, v) with noble secp256k1.
  const secp = require(path.join(__dirname, "..", "node_modules", ".bun", "secp256k1@5.0.1", "node_modules", "secp256k1"));
  const sigBytes = Buffer.concat([r, s]); // ecdsaRecover takes 64-byte r||s; recovery_id is a separate arg
  const recovered = secp.ecdsaRecover(sigBytes, recoveryId, signingHash, false);
  const recoveredAddr = "0x" + Buffer.from(keccak256(recovered.slice(1)).slice(12)).toString("hex");
  log.recoveredAddress = recoveredAddr;
  console.log("recovered sender address:", recoveredAddr, "| expected:", sepoliaAddress);
  if (recoveredAddr.toLowerCase() !== sepoliaAddress.toLowerCase()) throw new Error("signature verification FAILED: recovered address does not match derived address — NOT broadcasting");

  // 7. Broadcast once to Sepolia.
  try {
    const txHash = await sepoliaRpc("eth_sendRawTransaction", [rawTx]);
    log.sepoliaTxHash = txHash;
    log.sepoliaExplorer = SEPOLIA_EXPLORER + txHash;
    console.log("Sepolia tx broadcast:", txHash, log.sepoliaExplorer);
    // Wait for a receipt.
    for (let i = 0; i < 20; i++) {
      const rc = await sepoliaRpc("eth_getTransactionReceipt", [txHash]).catch(() => null);
      if (rc) { log.sepoliaReceipt = rc; console.log("Sepolia receipt:", JSON.stringify(rc)); break; }
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch (e) {
    log.sepoliaBroadcastError = String(e.message || e).slice(0, 500);
    console.log("Sepolia broadcast FAILED (recorded, not faked):", log.sepoliaBroadcastError);
  }

  // 8. Retry the same decision — must be blocked by the guard on-chain.
  let retryResult = null;
  try {
    await agent.functionCall({
      contractId: GUARD, methodName: "execute_decision",
      args: { args: { decision_id: decisionId, venue: VENUE, method: "execute", args: JSON.stringify({ asset: "ETH-BASE-SEPOLIA", direction: "SEND", slippage: 0.005 }), deposit: deposit.toString(), expiry_height: height + 600 } },
      gas: TGAS, attachedDeposit: deposit,
    });
    retryResult = "NOT BLOCKED (unexpected)";
  } catch (e) {
    retryResult = `blocked: ${String(e.message || e).slice(0, 200)}`;
  }
  log.retryResult = retryResult;
  console.log("guard retry of same decision:", retryResult);
  console.log("NO second MPC sign and NO second Sepolia broadcast were made.");
  const finalDecision = await view(GUARD, "get_decision", { decision_id: decisionId }).catch(() => null);
  log.guardDecisionFinal = finalDecision;
  fs.writeFileSync("/tmp/chainsig/proof-run-base-sepolia.json", JSON.stringify(log, null, 2));
  console.log("LOG WRITTEN: /tmp/chainsig/proof-run-base-sepolia.json");
  console.log("SUMMARY:", JSON.stringify({ sepoliaAddress, decisionId, guardTxHash: log.guardTxHash, guardState: decision && decision.state, mpcSignTxHash, sepoliaTxHash: log.sepoliaTxHash || null, broadcastError: log.sepoliaBroadcastError || null, retryResult }, null, 2));
  process.exit(0);
})().catch((e) => { console.error("PROOF FAILED:", (e.message || String(e)).slice(0, 1500)); process.exit(1); });
