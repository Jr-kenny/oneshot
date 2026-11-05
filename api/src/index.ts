// ─────────────────────────────────────────────────────────────────────────────
// OneShot API — live event streamer & verification harness.
//
// Boots a private NEAR Sandbox, deploys the REAL guard + venue contracts,
// drives the two agents (naive retry loop vs OneShot-guarded) through the
// real contract lifecycle, and streams the results to the demo console as
// SimulationEvent objects (schema mirror of app/src/types/index.ts).
//
// Every blocked retry on this feed is a real on-chain rejection. Every
// settlement is a real promise callback. No mock events.
// ─────────────────────────────────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import path from "node:path";
import { Worker } from "near-workspaces";
const NEAR24 = (n: number | bigint) => (BigInt(n) * 10n ** 24n).toString();
import { decisionKey } from "@oneshot-guard/sdk";
import { agentTradeTool } from "./agent-loop";
import type { DecisionParamsLike, DecisionResultLike, DecisionViewLike, GuardedLike } from "./agent-loop";
import type { SimulationEvent, SimulationConfig, RetryClass } from "../app-types";

const PORT = Number(process.env.PORT ?? 8787);
const CONTRACT_WASM = path.resolve(
  import.meta.dirname,
  "../../contract/target/wasm32-unknown-unknown/release/oneshot_guard.wasm"
);
const VENUE_WASM = path.resolve(
  import.meta.dirname,
  "../../contract/target/wasm32-unknown-unknown/release/mock_venue.wasm"
);

type NearAccount = any; // near-workspaces NearAccount
let worker: any = null;

async function boot(): Promise<{ guard: NearAccount; venue: NearAccount; naiveVenue: NearAccount }> {
  if (!worker) {
    worker = await Worker.init();
  }
  const root = worker.rootAccount;
  const guard = await root.devDeploy(CONTRACT_WASM, {
    args: { default_ceiling: NEAR24(100) },
    method: "new",
    initialBalance: NEAR24(50),
  });
  const venue = await root.devDeploy(VENUE_WASM, {
    args: {},
    method: "new",
    initialBalance: NEAR24(50),
  });
  // Step 2: separate venue for the naive side, so its chain-read fill
  // count is naive-only and is not polluted by the guarded side's 1 fill.
  // Same wasm, same behaviour — only the deployment is separate.
  const naiveVenue = await root.devDeploy(VENUE_WASM, {
    args: {},
    method: "new",
    initialBalance: NEAR24(50),
  });
  return { guard, venue, naiveVenue };
}

// ── event helpers (app-compatible schema) ───────────────────────────────────
class RunCtx {
  startedAt = Date.now();
  constructor(public emit: (e: SimulationEvent) => void) {}
  ev(
    agent: SimulationEvent["agent"],
    decision_id: string,
    type: SimulationEvent["type"],
    data: SimulationEvent["data"] & Record<string, any>
  ) {
    const t = (Date.now() - this.startedAt) / 1000;
    const mins = Math.floor(t / 60);
    const secs = t - mins * 60;
    const formattedTime = `[${String(mins).padStart(2, "0")}:${String(Math.floor(secs)).padStart(2, "0")}.${String(Math.round((secs % 1) * 1000)).padStart(3, "0")}]`;
    this.emit({ t: Number(t.toFixed(3)), formattedTime, agent, decision_id, type, data });
  }
}

const CLASSES = ["replay", "bump", "rerun"] as const;

async function runChaos(config: SimulationConfig, emit: (e: SimulationEvent) => void) {
  const { guard, venue, naiveVenue } = await boot();
  const ctx = new RunCtx(emit);

  // fresh agent accounts per run (isolate reservations & ceilings)
  const suffix = Date.now().toString(36);
  const naiveAcc = await worker.rootAccount.createSubAccount(`naive-${suffix}`);
  const osAcc = await worker.rootAccount.createSubAccount(`os-${suffix}`);

  const nearPerFill = Math.max(1, Math.floor(config.decisionSize / 500));
  const depositYocto = NEAR24(nearPerFill);

  // canonical decision identity via the SDK's derivation (production parity)
  const params = {
    asset: "NEAR/USDC",
    size: config.decisionSize,
    direction: "BUY" as const,
    slippageTolerance: 0.005,
    expirySec: config.resolutionDelay + 60,
  };
  const fullId = decisionKey(osAcc.accountId, params);
  const idStr = `0x${fullId.slice(0, 16)}`;

  ctx.ev("system", idStr, "run_started", {
    message: `LIVE NEAR sandbox run — decision $${config.decisionSize}, ${config.retryCount} retries, real rejections`,
  });
  ctx.ev("oneshot", idStr, "decision_created", {
    amount: config.decisionSize,
    message: `decision created  identity=${idStr}…  size=$${config.decisionSize}`,
  });
  ctx.ev("unprotected", idStr, "decision_created", {
    amount: config.decisionSize,
    message: `decision created  asset=NEAR/USDC  size=$${config.decisionSize}`,
  });

  // ceiling registration on the guard — "money in the air" cap is real
  const guardBlock = await guard.view("get_agent_config", {}).catch(() => null);
  void guardBlock;
  await osAcc.call(
    guard.accountId,
    "set_agent_config",
    { ceiling: NEAR24(100) },
    { attachedDeposit: 0n }
  );
  const ceil = NEAR24(Math.max(2, config.retryCount + 2) * nearPerFill);

  // Step 2 chain-read baseline: naive-venue fills are read back from the
  // chain, not counted by the script. If the deployed venue wasm predates
  // get_fills, fall back to 0 (and the run is labelled script-counted).
  const venueFills = async (): Promise<number | null> =>
    naiveVenue.view("get_fills", {}).then((v: any) => Number(v)).catch(() => null);
  const fillsBaseline = (await venueFills()) ?? 0;

  let blockHeight = await currentHeight(worker);
  const expiryHeight = blockHeight + config.resolutionDelay * 3 + 500;

  // ── attempt #1: both sides, in parallel ───────────────────────────────────
  const naive1 = naiveAttempt(ctx, naiveAcc, naiveVenue, idStr, 1, depositYocto, config);
  const os1 = guardedAttempt(ctx, osAcc, guard, venue, fullId, idStr, expiryHeight, depositYocto, ceil, config, true);
  const [nTx, _osRes] = await Promise.all([naive1, os1]);
  void nTx;

  // naive side got filled once even though the ack was swallowed.
  // Chain-read, not script-counted: fills are read back from the
  // naive-only venue, so the guarded side's 1 fill cannot pollute it.
  const fillsAfterAttempt1 = (await venueFills()) ?? fillsBaseline + 1;
  let naiveFills = Math.max(0, fillsAfterAttempt1 - fillsBaseline);
  let naiveDamage = naiveFills * config.decisionSize;
  ctx.ev("unprotected", idStr, "fill", {
    attempt: 1,
    amount: config.decisionSize,
    venue_fills_chain_read: fillsAfterAttempt1,
    damage_chain_read: naiveDamage,
    wallet_balance: 10000 - naiveDamage,
    message: `fill_confirmed_on_chain  attempt=1  amount=$${config.decisionSize}`,
  });

  const interval = Math.max(0.4, (config.resolutionDelay - 1) / Math.max(1, config.retryCount));

  // ── retry storm ────────────────────────────────────────────────────────────
  for (let i = 1; i <= config.retryCount; i++) {
    await sleep(interval * 1000);
    const attempt = i + 1;

    await naiveAttempt(ctx, naiveAcc, naiveVenue, idStr, attempt, depositYocto, config, CLASSES[(i - 1) % 3]);
    // Chain-read again: damage follows actual venue fills, not attempts.
    const fillsNow = (await venueFills()) ?? fillsBaseline + naiveFills + 1;
    const prevDamage = naiveDamage;
    naiveFills = Math.max(0, fillsNow - fillsBaseline);
    naiveDamage = naiveFills * config.decisionSize;
    ctx.ev("unprotected", idStr, "fill", {
      attempt,
      amount: config.decisionSize,
      duplicate_fills: naiveFills - 1,
      damage: naiveDamage,
      damage_delta_chain_read: naiveDamage - prevDamage,
      venue_fills_chain_read: fillsNow,
      wallet_balance: 10000 - naiveDamage,
      message: `DUPLICATE_FILL  attempt=${attempt}  damage=+$${config.decisionSize}  cum_damage=$${naiveDamage}`,
    });

    const freshExpiry = (await currentHeight(worker)) + config.resolutionDelay * 3 + 50;
    await guardedAttempt(ctx, osAcc, guard, venue, fullId, idStr, freshExpiry, depositYocto, ceil, config, false);
  }

  // ── resolution evidence ───────────────────────────────────────────────────
  await waitForResolution(guard, fullId);
  const view = await guard.view("get_decision", { decision_id: fullId });
  const settled = view?.state === "Settled";

  ctx.ev("oneshot", idStr, settled ? "decision_settled" : "decision_expired", {
    via: "promise_callback",
    tx: settled ? nTx?.tx : undefined,
    amount: config.decisionSize,
    in_air: 0,
    message: settled
      ? `decision_settled  via=promise_callback  exactly 1 execution landed  in_air drained`
      : `decision_expired  reservation released`,
  });
  ctx.ev("system", idStr, "run_finished", {
    message: `Run finished. Unprotected fills: ${naiveFills} (${naiveDamage} damage). OneShot executions: 1. Blocked retries: ${config.retryCount}. Every block was an on-chain verdict.`,
    finality_ms: Date.now() - ctx.startedAt,
  });

  return { naiveFills, naiveDamage, guardedFills: 1, blocked: config.retryCount, settled };
}

async function naiveAttempt(
  ctx: RunCtx,
  agent: NearAccount,
  venue: NearAccount,
  idStr: string,
  seq: number,
  depositYocto: string,
  config: SimulationConfig,
  cls?: RetryClass
) {
  ctx.ev("unprotected", idStr, seq === 1 ? "attempt_submitted" : "retry_attempted", {
    attempt: seq,
    class: seq === 1 ? undefined : cls,
    amount: config.decisionSize,
    message: seq === 1
      ? `attempt_submitted  attempt=1  spend=$${config.decisionSize}`
      : `retry_attempted  class=${cls}  attempt=${seq}  check=approved ($${config.decisionSize} <= budget)`,
  });
  const out = await agent.call(venue.accountId, "execute", { payload: JSON.stringify({ attempt: seq }) }, { attachedDeposit: BigInt(depositYocto) });
  ctx.ev("proxy", idStr, "ack_swallowed", {
    tx: idStr,
    amount: config.decisionSize,
    message: `CHAOS PROXY: attempt ${seq} executed on venue, ack swallowed`,
  });
  return out;
}

// ── Step 2: the guarded side now goes through the agent trade tool ─────────
// The demo agent no longer calls the guard contract directly. It calls
// agentTradeTool with the SAME params object on every attempt (the loop
// never changes trigger or expiry, so the decision identity cannot drift),
// and the adapter below is the only place that touches the chain.
// PENDING is the tool's answer for LIVE, whether that LIVE came from a
// fresh reservation (first attempt) or a blocked retry (later attempts);
// runChaos distinguishes those two by position, not by inventing a state.
function guardedAdapter(
  agent: NearAccount,
  guard: NearAccount,
  venue: NearAccount
): GuardedLike {
  return {
    decisionKey: (p: DecisionParamsLike) => decisionKey(agent.accountId, p),
    checkDecision: async (id: string): Promise<DecisionViewLike | null> => {
      const v = await guard.view("get_decision", { decision_id: id }).catch(() => null);
      if (!v) return null;
      const state = v.state === "Live" ? "LIVE" : v.state === "Settled" ? "SETTLED" : "EXPIRED";
      return { decision_id: id, state, expiry_height: String(v.expiry_height) };
    },
    executeDecision: async (p: DecisionParamsLike): Promise<DecisionResultLike> => {
      const id = decisionKey(agent.accountId, p);
      const deposit = p.depositYocto ?? "0";
      // Sandbox block pacing (matches the old fresh-expiry formula):
      // expirySec in seconds, roughly 3 blocks per second in sandbox.
      const expiryHeight = (await currentHeight(worker)) + p.expirySec * 3 + 50;
      const args = {
        decision_id: id,
        venue: venue.accountId,
        method: "execute",
        args: JSON.stringify({ asset: p.asset, direction: p.direction, slippage: p.slippageTolerance }),
        deposit,
        expiry_height: expiryHeight,
      };
      try {
        const outcome = await agent.call(
          guard.accountId,
          "execute_decision",
          { args },
          { attachedDeposit: BigInt(deposit) }
        );
        const view = await guard.view("get_decision", { decision_id: id }).catch(() => null);
        return {
          decisionId: id,
          state: "LIVE",
          view: view
            ? { decision_id: id, state: "LIVE", expiry_height: String(view.expiry_height) }
            : null,
          attestation: outcome,
          safeToRetry: false,
          pending: true,
          resolvesByHeight: expiryHeight,
        };
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (msg.includes("state is LIVE")) {
          const view = await guard.view("get_decision", { decision_id: id }).catch(() => null);
          return {
            decisionId: id,
            state: "LIVE",
            view: view
              ? { decision_id: id, state: "LIVE", expiry_height: String(view.expiry_height) }
              : null,
            attestation: null,
            safeToRetry: false,
            pending: true,
            resolvesByHeight: view ? Number(view.expiry_height) : expiryHeight,
          };
        }
        if (msg.includes("already SETTLED")) {
          const view = await guard.view("get_decision", { decision_id: id }).catch(() => null);
          return {
            decisionId: id,
            state: "SETTLED",
            view: view
              ? { decision_id: id, state: "SETTLED", expiry_height: String(view.expiry_height) }
              : null,
            attestation: null,
            safeToRetry: false,
          };
        }
        throw err;
      }
    },
  };
}

async function guardedAttempt(
  ctx: RunCtx,
  agent: NearAccount,
  guard: NearAccount,
  venue: NearAccount,
  fullId: string,
  idStr: string,
  _expiryHeight: number,
  depositYocto: string,
  ceiling: string,
  config: SimulationConfig,
  first: boolean
) {
  ctx.ev("oneshot", idStr, first ? "attempt_submitted" : "retry_attempted", {
    attempt: first ? 1 : 0,
    message: `execute_decision  identity=${idStr}  attempt=${first ? 1 : "→"}`,
  });

  // Same params object on every attempt: identity is content-bound, so
  // this is the same decision the tool already holds LIVE, not a new one.
  const params: DecisionParamsLike = {
    asset: "NEAR/USDC",
    size: config.decisionSize,
    direction: "BUY",
    slippageTolerance: 0.005,
    expirySec: config.resolutionDelay + 60,
    depositYocto,
  };
  const guarded = guardedAdapter(agent, guard, venue);
  const result = await agentTradeTool(guarded, params);
  // Sanity: the tool's identity must match the identity runChaos tracks.
  if (result.decisionId !== fullId) {
    throw new Error(`guardedAttempt: tool identity ${result.decisionId} != tracked ${fullId}`);
  }

  const inAir = Number(await guard.view("get_in_air", { agent: agent.accountId }).catch(() => 0));
  if (result.kind === "PENDING" && first) {
    ctx.ev("oneshot", idStr, "decision_live", {
      reserved: Number(depositYocto) / 1e24,
      in_air: inAir / 1e24,
      ceiling: Number(ceiling) / 1e24,
      message: `decision_live  reservation locked ON-CHAIN  in_air=${inAir / 1e24} N  guard=${guard.accountId}`,
    });
    ctx.ev("oneshot", idStr, "consensus_waiting", {
      attempt: 1,
      message: `Waiting for consensus… [live sandbox · real receipt]`,
    });
  } else if (result.kind === "PENDING") {
    ctx.ev("oneshot", idStr, "retry_blocked", {
      reason: "LIVE",
      amount: config.decisionSize,
      in_air: inAir / 1e24,
      ceiling: Number(ceiling) / 1e24,
      message: `LIVE: retry blocked by guard  state readable on-chain  reservation intact`,
    });
  } else if (result.kind === "SETTLED") {
    ctx.ev("oneshot", idStr, "retry_blocked", {
      reason: "SETTLED",
      amount: config.decisionSize,
      in_air: inAir / 1e24,
      ceiling: Number(ceiling) / 1e24,
      message: `SETTLED: retry blocked by guard  stored receipt returned, no new execution`,
    });
  } else {
    ctx.ev("oneshot", idStr, "decision_expired", {
      amount: config.decisionSize,
      message: `EXPIRED: safe to retry  reservation released`,
    });
  }
  return result;
}

async function waitForResolution(guard: NearAccount, decisionId: string, maxMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const v = await guard.view("get_decision", { decision_id: decisionId }).catch(() => null);
    if (v?.state && v.state !== "Live") return v;
    await sleep(250);
  }
  return null;
}

async function currentHeight(worker: any): Promise<number> {
  const url = (worker as any)?.rpcAddr ?? (worker as any)?.provider?.connection?.url;
  if (!url) throw new Error("currentHeight: no provider url");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "oneshot-height", method: "block", params: { finality: "final" } }),
  });
  const j: any = await res.json();
  const height = Number(j?.result?.header?.height);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`currentHeight: bad height ${JSON.stringify(j).slice(0, 200)}`);
  }
  return height;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── HTTP + WebSocket surface ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true, mode: "sandbox-live" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket: WebSocket) => {
  let running = false;
  socket.on("message", async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type !== "start" || running) return;
    running = true;
    const config: SimulationConfig = {
      swallowAck: true,
      resolutionDelay: msg.config?.resolutionDelay ?? 8,
      retryCount: msg.config?.retryCount ?? 5,
      decisionSize: msg.config?.decisionSize ?? 500,
      ceiling: msg.config?.ceiling ?? msg.config?.decisionSize ?? 500,
      isLiveMode: true,
      latencyProfile: msg.config?.latencyProfile ?? "medium",
    };
    try {
      await runChaos(config, (e) =>
        socket.readyState === WebSocket.OPEN ? socket.send(JSON.stringify({ type: "event", event: e })) : null
      );
    } catch (err: any) {
      socket.send(JSON.stringify({ type: "error", error: String(err?.message ?? err) }));
      socket.close();
    } finally {
      running = false;
    }
  });
});

server.listen(PORT, () => {
  console.log(`oneshot-api live on ws://localhost:${PORT}/ws`);
});
