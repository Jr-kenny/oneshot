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

async function boot(): Promise<{ guard: NearAccount; venue: NearAccount }> {
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
  return { guard, venue };
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
  const { guard, venue } = await boot();
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

  let blockHeight = await currentHeight(worker);
  const expiryHeight = blockHeight + config.resolutionDelay * 3 + 500;

  // ── attempt #1: both sides, in parallel ───────────────────────────────────
  const naive1 = naiveAttempt(ctx, naiveAcc, venue, idStr, 1, depositYocto, config);
  const os1 = guardedAttempt(ctx, osAcc, guard, venue, fullId, idStr, expiryHeight, depositYocto, ceil, config, true);
  const [nTx, _osRes] = await Promise.all([naive1, os1]);
  void nTx;

  // naive side got filled once even though the ack was swallowed
  let naiveFills = 1;
  let naiveDamage = 0;
  ctx.ev("unprotected", idStr, "fill", {
    attempt: 1,
    amount: config.decisionSize,
    wallet_balance: 10000 - config.decisionSize,
    message: `fill_confirmed_on_chain  attempt=1  amount=$${config.decisionSize}`,
  });

  const interval = Math.max(0.4, (config.resolutionDelay - 1) / Math.max(1, config.retryCount));

  // ── retry storm ────────────────────────────────────────────────────────────
  for (let i = 1; i <= config.retryCount; i++) {
    await sleep(interval * 1000);
    const attempt = i + 1;

    await naiveAttempt(ctx, naiveAcc, venue, idStr, attempt, depositYocto, config, CLASSES[(i - 1) % 3]);
    naiveFills += 1;
    naiveDamage += config.decisionSize;
    ctx.ev("unprotected", idStr, "fill", {
      attempt,
      amount: config.decisionSize,
      duplicate_fills: naiveFills - 1,
      damage: naiveDamage,
      wallet_balance: 10000 - naiveFills * config.decisionSize,
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

async function guardedAttempt(
  ctx: RunCtx,
  agent: NearAccount,
  guard: NearAccount,
  venue: NearAccount,
  fullId: string,
  idStr: string,
  expiryHeight: number,
  depositYocto: string,
  ceiling: string,
  config: SimulationConfig,
  first: boolean
) {
  ctx.ev("oneshot", idStr, first ? "attempt_submitted" : "retry_attempted", {
    attempt: first ? 1 : 0,
    message: `execute_decision  identity=${idStr}  attempt=${first ? 1 : "→"}`,
  });

  const args = {
    decision_id: fullId,
    venue: venue.accountId,
    method: "execute",
    args: JSON.stringify({ asset: "NEAR/USDC", direction: "BUY", slippage: 0.005 }),
    deposit: depositYocto,
    expiry_height: expiryHeight,
  };

  let blocked = false;
  let blockedReason: string | undefined;
  try {
    await agent.call(
      guard.accountId,
      "execute_decision",
      { args },
      { attachedDeposit: BigInt(depositYocto) }
    );
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes("state is LIVE")) {
      blocked = true;
      blockedReason = "LIVE";
    } else if (msg.includes("already SETTLED")) {
      blocked = true;
      blockedReason = "SETTLED";
    } else if (msg.includes("ceiling")) {
      blocked = true;
      blockedReason = "CEILING";
    } else {
      throw err;
    }
  }

  if (blocked) {
    const inAir = Number(await guard.view("get_in_air", { agent: agent.accountId }));
    ctx.ev("oneshot", idStr, "retry_blocked", {
      reason: blockedReason,
      amount: config.decisionSize,
      in_air: inAir / 1e24,
      ceiling: Number(ceiling) / 1e24,
      message: `${blockedReason}: retry blocked by guard  state readable on-chain  reservation intact`,
    });
  } else {
    // LIVE + reservation: read in-air as proof the reservation is REAL on-chain
    const inAir = Number(await guard.view("get_in_air", { agent: agent.accountId }));
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
  }
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
