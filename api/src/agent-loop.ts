// OneShot Step 2 — agent trade tool + retry loop (draft, not yet pushed).
// Self-contained for local testing: it uses a Guarded interface that matches
// the Step 1 SDK return shape (executeDecision / checkDecision / decisionKey),
// so it can be copied into api/src/agent-loop.ts and wired to the real SDK
// without changing its logic.

export type DecisionState = "LIVE" | "SETTLED" | "EXPIRED";

export interface DecisionViewLike {
  decision_id: string;
  state: DecisionState;
  expiry_height: string;
}

export interface DecisionParamsLike {
  asset: string;
  size: number;
  direction: "BUY" | "SELL";
  slippageTolerance: number;
  expirySec: number;
  depositYocto?: string;
  trigger?: string;
}

export interface DecisionResultLike {
  decisionId: string;
  state: DecisionState;
  view: DecisionViewLike | null;
  attestation: unknown;
  safeToRetry: boolean;
  pending?: boolean;
  resolvesByHeight?: number;
}

export interface GuardedLike {
  executeDecision: (p: DecisionParamsLike) => Promise<DecisionResultLike>;
  checkDecision: (id: string) => Promise<DecisionViewLike | null>;
  decisionKey: (p: DecisionParamsLike) => string;
}

export type AgentToolResult =
  | { kind: "SETTLED"; decisionId: string; receipt: unknown }
  | { kind: "PENDING"; decisionId: string; resolvesByHeight?: number }
  | { kind: "EXPIRED"; decisionId: string; safeToRetry: true };

/**
 * The only trade tool the agent sees. It never returns a raw timeout.
 * LIVE (including the SDK's 120s client-wait PENDING case) is returned as
 * PENDING: do not retry, wait, or invent a new decision.
 */
export async function agentTradeTool(
  guarded: GuardedLike,
  params: DecisionParamsLike,
): Promise<AgentToolResult> {
  const r = await guarded.executeDecision(params);
  if (r.state === "SETTLED") {
    return { kind: "SETTLED", decisionId: r.decisionId, receipt: r.attestation };
  }
  if (r.state === "EXPIRED") {
    return { kind: "EXPIRED", decisionId: r.decisionId, safeToRetry: true };
  }
  return { kind: "PENDING", decisionId: r.decisionId, resolvesByHeight: r.resolvesByHeight };
}

export interface RetryLoopEvent {
  attempt: number;
  result: AgentToolResult;
}

/**
 * Retry loop rules, enforced in code, not in prose:
 * 1. The same `params` object is passed on every attempt. The loop never
 *    changes trigger or expirySec to get a new decisionId. That would be
 *    a guard bypass, not a retry.
 * 2. PENDING is not failure. The loop waits and checks again.
 * 3. After maxAttempts with PENDING still outstanding, the loop returns
 *    PENDING — never "failed", and never EXPIRED minted by the client.
 */
export async function agentRetryLoop(
  guarded: GuardedLike,
  params: DecisionParamsLike,
  opts: { maxAttempts: number; waitMs: number },
  onEvent?: (e: RetryLoopEvent) => void,
): Promise<AgentToolResult> {
  let last: AgentToolResult | null = null;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const result = await agentTradeTool(guarded, params);
    last = result;
    onEvent?.({ attempt, result });
    if (result.kind !== "PENDING") return result;
    if (attempt < opts.maxAttempts) {
      await new Promise((r) => setTimeout(r, opts.waitMs));
    }
  }
  if (last && last.kind === "PENDING") {
    const view = await guarded.checkDecision(last.decisionId).catch(() => null);
    return {
      kind: "PENDING",
      decisionId: last.decisionId,
      resolvesByHeight: view ? Number(view.expiry_height) : last.resolvesByHeight,
    };
  }
  // Unreachable in practice: the loop always sets `last` on attempt 1.
  return { kind: "PENDING", decisionId: guarded.decisionKey(params) };
}
