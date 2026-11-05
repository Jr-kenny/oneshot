// Local test for oneshot-step2/agent-loop.ts — no NEAR, no SDK, no network.
// Run with: bun run agent-loop.test.ts
import { agentRetryLoop, type GuardedLike, type DecisionParamsLike } from "./agent-loop.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

const params: DecisionParamsLike = {
  asset: "NEAR/USDC",
  size: 500,
  direction: "BUY",
  slippageTolerance: 0.005,
  expirySec: 60,
  trigger: "dca-leg-1",
};

// Fake 1: PENDING once, then EXPIRED. The loop must return EXPIRED and
// must pass the exact same params (same trigger, same expiry) on both calls.
{
  const seen: DecisionParamsLike[] = [];
  let calls = 0;
  const fake: GuardedLike = {
    async executeDecision(p) {
      seen.push({ ...p });
      calls++;
      if (calls === 1) {
        return { decisionId: "id-1", state: "LIVE", view: null, attestation: null, safeToRetry: false, pending: true, resolvesByHeight: 12345 };
      }
      return { decisionId: "id-1", state: "EXPIRED", view: null, attestation: null, safeToRetry: true };
    },
    async checkDecision() { return null; },
    decisionKey: () => "id-1",
  };
  const events: unknown[] = [];
  const result = await agentRetryLoop(fake, params, { maxAttempts: 5, waitMs: 1 }, (e) => events.push(e));
  assert(result.kind === "EXPIRED", "PENDING then EXPIRED returns EXPIRED");
  assert(calls === 2, "loop made exactly 2 attempts");
  assert(seen.every((p) => p.trigger === "dca-leg-1" && p.expirySec === 60), "loop never changed trigger or expirySec");
  assert(events.length === 2, "loop logged both attempts");
}

// Fake 2: always PENDING. After maxAttempts the loop must return PENDING,
// not EXPIRED and not "failed".
{
  const fake: GuardedLike = {
    async executeDecision() {
      return { decisionId: "id-2", state: "LIVE", view: { decision_id: "id-2", state: "LIVE", expiry_height: "99999" }, attestation: null, safeToRetry: false, pending: true, resolvesByHeight: 99999 };
    },
    async checkDecision() {
      return { decision_id: "id-2", state: "LIVE", expiry_height: "99999" };
    },
    decisionKey: () => "id-2",
  };
  const result = await agentRetryLoop(fake, params, { maxAttempts: 3, waitMs: 1 });
  assert(result.kind === "PENDING", "always-PENDING returns PENDING after maxAttempts");
  if (result.kind === "PENDING") assert(result.resolvesByHeight === 99999, "PENDING carries resolvesByHeight from chain view");
}

// Fake 3: SETTLED on first attempt. No retry.
{
  let calls = 0;
  const fake: GuardedLike = {
    async executeDecision() {
      calls++;
      return { decisionId: "id-3", state: "SETTLED", view: null, attestation: { receipt: "ok" }, safeToRetry: false };
    },
    async checkDecision() { return null; },
    decisionKey: () => "id-3",
  };
  const result = await agentRetryLoop(fake, params, { maxAttempts: 5, waitMs: 1 });
  assert(result.kind === "SETTLED" && calls === 1, "SETTLED returns immediately with 1 attempt");
}

console.log("All agent-loop tests passed.");
