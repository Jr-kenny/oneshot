// ─────────────────────────────────────────────────────────────────────────────
// OneShot SDK — execution integrity for AI agents on NEAR.
//
// One decision. At most one live execution. Global in-flight cap enforced
// on-chain by the guard contract. This SDK:
//   1) derives content-bound decision identities (decision keys),
//   2) routes every spend through the guard contract (execute_decision),
//   3) resolves the decision lifecycle by on-chain evidence — never by timeout.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";

export type DecisionState = "LIVE" | "SETTLED" | "EXPIRED";
export type ResolutionSource = "promise_callback" | "status_read";

export interface DecisionParams {
  /** Asset pair, e.g. "NEAR/USDC" */
  asset: string;
  /** Notional size — maps to the attached NEAR deposit (yocto) unless overridden. */
  size: number;
  direction: "BUY" | "SELL";
  /** 0.005 = 0.5% */
  slippageTolerance: number;
  /** Seconds after which the attempt is provably dead. */
  expirySec: number;
  /** Optional explicit deposit (yoctoNEAR); overrides size-based deposit. */
  depositYocto?: string;
  /**
   * Optional trigger reference that distinguishes legitimate repeats.
   * Same trigger = same decision (retries collapse). Different trigger =
   * different decision (e.g. separate DCA legs). Omit it and the key is
   * exactly the v1 key, so existing decisions do not change identity.
   */
  trigger?: string;
}

/**
 * Canonical semantic content → sha256 → 32-byte hex identity (contract-format).
 * Backwards-compatible: params without a trigger produce the exact v1 key.
 * Params with a trigger use v2, which includes the trigger.
 */
export function decisionKey(agentAccount: string, p: DecisionParams): string {
  const base = {
    agent: agentAccount,
    asset: p.asset,
    size: p.size.toFixed(2),
    dir: p.direction,
    slip: p.slippageTolerance,
    exp: p.expirySec,
  };
  const canonical = p.trigger
    ? JSON.stringify({ v: 2, ...base, trigger: p.trigger })
    : JSON.stringify({ v: 1, ...base });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Guard-path function-call key specification.
 * Guard path only: a key limited to this contract and to execute_decision
 * can call the guard, but it CANNOT authorise NEP-413 NEAR Intents signing,
 * which requires a full-access key. Do not claim scoped-key enforcement
 * for the Intents path. For Intents, use a dedicated agent account whose
 * full key is held by the guard operator, and expose only executeDecision
 * to the language model.
 */
export function guardFunctionCallKeySpec(guardContract: string, allowanceYocto?: string) {
  return {
    contractId: guardContract,
    methodNames: ["execute_decision"],
    allowanceYocto: allowanceYocto ?? null,
    note: "Guard path only. Not valid for NEP-413 intent signing.",
  };
}

export interface DecisionView {
  decision_id: string;
  state: DecisionState;
  executor: string;
  venue: string;
  reserved: string;
  expiry_height: string;
  blocks_remaining: number;
  in_air_total: string;
}

export interface GuardEvent {
  kind:
    | "decision_live"
    | "retry_blocked"
    | "decision_settled"
    | "decision_expired"
    | "decision_cancelled"
    | "ceiling_exceeded"
    | "ceiling_registered";
  decisionId: string;
  reason?: "LIVE" | "SETTLED";
  via?: ResolutionSource | "expiry";
  reserved?: string;
  inAir?: string;
  ceiling?: string;
}

export interface WrapOptions {
  /** Deployed guard contract account id. */
  guardContract: string;
  /** Agent-wide in-flight ceiling (yoctoNEAR). Registered on-guard at wrap. */
  maxInFlightCeiling: string;
  near: { networkId: "mainnet" | "testnet"; nodeUrl: string };
  /** Venue contract + method the guarded call forwards into. */
  venue?: { contract: string; method?: string };
  onEvent?: (e: GuardEvent) => void;
}

const GUARD_GAS = 300_000_000_000_000n; // 300 TGas
const BLOCK_SECONDS: Record<string, number> = { mainnet: 1.2, testnet: 1.2 };

export interface DecisionResult {
  decisionId: string;
  state: DecisionState;
  view: DecisionView | null;
  /** Raw tx outcome for attestation/audit. */
  attestation: unknown;
  blocked?: boolean;
  reason?: "LIVE" | "SETTLED";
  /**
   * Tool semantics for the language model, in plain words:
   * - LIVE: safeToRetry is false. Do not create a new attempt.
   *   resolvesByHeight is the on-chain height after which the decision
   *   can be finalised as EXPIRED, if it has not settled by then.
   * - SETTLED: safeToRetry is false. Return the receipt, do not retry.
   * - EXPIRED: safeToRetry is true. A fresh attempt is safe.
   */
  safeToRetry: boolean;
  /** True when this result is a PENDING/LIVE answer, not a final outcome. */
  pending?: boolean;
  resolvesByHeight?: number;
}

export function wrapAgentWithOneShot(
  agent: { accountId: string; secretKey?: string; account?: Account },
  opts: WrapOptions
) {
  const provider = new JsonRpcProvider({ url: opts.near.nodeUrl });
  const account =
    agent.account ??
    new Account(
      agent.accountId,
      provider,
      KeyPairSigner.fromSecretKey(agent.secretKey! as Parameters<typeof KeyPairSigner.fromSecretKey>[0])
    );

  // ── guard lifecycle helpers ────────────────────────────────────────────────

  async function currentBlockHeight(): Promise<number> {
    const block = (await provider.viewBlock({ finality: "final" })) as any;
    return Number(block.header.height);
  }

  async function view<T>(method: string, args: Record<string, unknown>): Promise<T> {
    return (await account.callFunction({
      contractId: opts.guardContract,
      methodName: method,
      args,
    })) as T;
  }

  async function txCall(
    method: string,
    args: Record<string, unknown>,
    deposit: string,
    gas: bigint
  ): Promise<unknown> {
    return await account.callFunctionRaw({
      contractId: opts.guardContract,
      methodName: method,
      args,
      deposit: BigInt(deposit),
      gas,
      waitUntil: "EXECUTED" as never,
    });
  }

  /** Registers ("or tightens") the agent's in-flight ceiling on-chain. */
  async function ensureCeiling(): Promise<void> {
    const cur = await view<{ in_flight_ceiling: string }>("get_agent_config", {
      agent: agent.accountId,
    }).catch(() => null);
    const pending = BigInt(opts.maxInFlightCeiling);
    if (cur && BigInt(cur.in_flight_ceiling) >= pending) {
      // Already registered at ≥ requested ceiling; idempotent.
      opts.onEvent?.({
        kind: "ceiling_registered",
        decisionId: "config",
        ceiling: cur.in_flight_ceiling,
      });
      return;
    }
    await txCall("set_agent_config", { ceiling: pending.toString() }, "0", GUARD_GAS);
    opts.onEvent?.({
      kind: "ceiling_registered",
      decisionId: "config",
      ceiling: pending.toString(),
    });
  }

  /**
   * The guarded trade. Everything the agent sends is content-hashed into the
   * decision identity. LIVE or SETTLED decisions deterministically reject
   * (that is the safety property); EXPIRED-before-settlement is the only
   * state where a fresh attempt is safe.
   */
  async function executeDecision(p: DecisionParams): Promise<DecisionResult> {
    const id = decisionKey(agent.accountId, p);
    const height = await currentBlockHeight();
    const expiryHeight =
      height + Math.ceil(p.expirySec / BLOCK_SECONDS[opts.near.networkId]) + 5;

    const venue = opts.venue?.contract ?? "v1.rhea-exchange.near";
    const method = opts.venue?.method ?? "execute";
    const deposit = p.depositYocto ?? BigInt(Math.round(p.size * 1e18)).toString();

    try {
      const outcome = await txCall(
        "execute_decision",
        {
          args: {
            decision_id: id,
            venue,
            method,
            args: JSON.stringify({
              asset: p.asset,
              direction: p.direction,
              slippage: p.slippageTolerance,
            }),
            deposit,
            expiry_height: expiryHeight,
          },
        },
        deposit,
        GUARD_GAS
      );
      opts.onEvent?.({ kind: "decision_live", decisionId: id, reserved: deposit, ceiling: opts.maxInFlightCeiling });
      return await resolveByPolling(id, outcome);
    } catch (err) {
      const msg = String((err as any)?.message ?? err);
      if (msg.includes("state is LIVE")) {
        opts.onEvent?.({ kind: "retry_blocked", decisionId: id, reason: "LIVE" });
        const liveView = await checkDecision(id);
        return {
          decisionId: id,
          state: "LIVE",
          view: liveView,
          attestation: null,
          blocked: true,
          reason: "LIVE",
          safeToRetry: false,
          pending: true,
          resolvesByHeight: liveView ? Number(liveView.expiry_height) : expiryHeight,
        };
      }
      if (msg.includes("already SETTLED")) {
        opts.onEvent?.({ kind: "retry_blocked", decisionId: id, reason: "SETTLED" });
        const previous = await view<DecisionView>("get_decision", { decision_id: id }).catch(() => null);
        return { decisionId: id, state: "SETTLED", view: previous, attestation: null, blocked: true, reason: "SETTLED", safeToRetry: false };
      }
      if (msg.includes("in-flight ceiling")) {
        opts.onEvent?.({ kind: "ceiling_exceeded", decisionId: id, ceiling: opts.maxInFlightCeiling });
      }
      throw err;
    }
  }

  async function checkDecision(id: string): Promise<DecisionView | null> {
    return view<DecisionView | null>("get_decision", { decision_id: id }).catch(() => null);
  }

  /**
   * Guard-state cancel. Only the executor may cancel, and only while LIVE.
   * This releases the guard reservation and moves the decision to EXPIRED,
   * so a fresh attempt with the same identity is safe from the guard's
   * point of view.
   *
   * Intents path warning: do NOT treat this as a full Intents cancel.
   * The intent's nonce must also be invalidated on-chain (or its deadline
   * must have passed with no settlement) before EXPIRED is treated as
   * final for an intent, otherwise the intent could still settle.
   */
  async function cancelDecision(id: string): Promise<DecisionResult> {
    const outcome = await txCall("cancel_decision", { decision_id: id }, "0", GUARD_GAS);
    opts.onEvent?.({ kind: "decision_cancelled", decisionId: id, via: "expiry" });
    const fresh = await checkDecision(id);
    return {
      decisionId: id,
      state: "EXPIRED",
      view: fresh,
      attestation: outcome,
      safeToRetry: true,
    };
  }

  /**
   * Resolve-to-truth loop: polls the guard until the decision leaves LIVE.
   * If the identity's own expiry passes while LIVE, issues resolve_expired
   * — resolution by objective evidence, never by wall-clock timeout.
   */
  async function resolveByPolling(id: string, outcome: unknown): Promise<DecisionResult> {
    const deadline = Date.now() + 120_000;
    let lastView: DecisionView | null = null;
    while (Date.now() < deadline) {
      const v = await checkDecision(id);
      if (v) lastView = v;
      if (v && v.state !== "LIVE") {
        opts.onEvent?.(
          v.state === "SETTLED"
            ? { kind: "decision_settled", decisionId: id, via: "promise_callback" }
            : { kind: "decision_expired", decisionId: id, via: "expiry" }
        );
        return {
          decisionId: id,
          state: v.state,
          view: v,
          attestation: outcome,
          safeToRetry: v.state === "EXPIRED",
        };
      }
      if (v && Number(v.blocks_remaining) <= 0) {
        try {
          await txCall("resolve_expired", { decision_id: id }, "0", GUARD_GAS);
          const fresh = await checkDecision(id);
          opts.onEvent?.({ kind: "decision_expired", decisionId: id, via: "expiry" });
          return { decisionId: id, state: fresh?.state ?? "EXPIRED", view: fresh ?? v, attestation: outcome, safeToRetry: true };
        } catch {
          /* raced with the promise callback; re-poll */
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    // Client-side wait ended. This is NOT an expiry and NOT a settlement.
    // It is a PENDING answer: the decision is still LIVE on-chain, the
    // caller must not retry, and it must check again or wait for the
    // on-chain expiry height. The 120s loop must never mint EXPIRED.
    return {
      decisionId: id,
      state: "LIVE",
      view: lastView,
      attestation: outcome,
      safeToRetry: false,
      pending: true,
      resolvesByHeight: lastView ? Number(lastView.expiry_height) : undefined,
    };
  }

  return {
    accountId: agent.accountId,
    ensureCeiling,
    executeDecision,
    checkDecision,
    cancelDecision,
    decisionKey: (p: DecisionParams) => decisionKey(agent.accountId, p),
  };
}

export type OneShotAgent = ReturnType<typeof wrapAgentWithOneShot>;
