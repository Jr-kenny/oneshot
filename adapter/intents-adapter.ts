// OneShot Step 3 — NEAR Intents adapter (zero-dollar version, draft).
// This is a separate layer, NOT a replacement for the guard. The guard
// remains the decision ledger (LIVE/SETTLED/EXPIRED, reservation, ceiling).
// The adapter answers one question for a decision: what does the Intents
// world say about this intent?
//
// Free paths used here (no dust, no mainnet spend):
//   - simulate_intents: a read-only RPC call against intents.near. It runs
//     the intent without changing verifier state and returns the intent
//     hash, current salt, and fee. It does NOT prove a solver will fill it.
//   - 1Click dry quote: POST /v0/quote with dry:true. Free preview, no
//     deposit address is committed, no trade is made.
//   - mock verifier (oneshot-step3/contract/mock-verifier): on testnet or
//     sandbox, the same status shape as the real verifier, labelled mock.
// A real settlement still requires mainnet solvers and is OUT OF SCOPE
// under the zero-dollar budget. Never present a dry run as a settlement.

import { createHash } from "node:crypto";

export const REAL_VERIFIER = "intents.near";
export const ONECLICK_BASE = "https://1click.chaindefuser.com/v0";
export const MAINNET_RPC = "https://rpc.mainnet.near.org";

export type DecisionState = "LIVE" | "SETTLED" | "EXPIRED";

export interface TokenDiff {
  intent: "token_diff";
  diff: Record<string, string>; // token account -> signed amount, must sum to 0 per token
}

export interface IntentPayload {
  signer_id: string;
  verifying_contract: string;
  deadline: string; // ISO 8601
  nonce: string; // base64: [4-byte salt][28-byte unique data]
  intents: TokenDiff[];
}

/** Nonce: salt (4 bytes, hex from current_salt) + unique data (28 bytes). */
export function buildNonce(saltHex: string, uniqueSeed: string): string {
  const salt = Buffer.from(saltHex, "hex");
  if (salt.length !== 4) throw new Error(`buildNonce: salt must be 4 bytes, got ${salt.length}`);
  const unique = createHash("sha256").update(uniqueSeed).digest().subarray(0, 28);
  return Buffer.concat([salt, unique]).toString("base64");
}

/**
 * One decision -> one intent. Same decisionId + same salt -> same nonce,
 * so a retry of the same decision can never mint a second live intent.
 * A different decision (different decisionId) gets a different nonce.
 */
export function buildIntentPayload(opts: {
  signerId: string;
  decisionId: string;
  saltHex: string;
  deadline: Date;
  diff: Record<string, string>;
  verifyingContract?: string;
}): IntentPayload {
  return {
    signer_id: opts.signerId,
    verifying_contract: opts.verifyingContract ?? REAL_VERIFIER,
    deadline: opts.deadline.toISOString(),
    nonce: buildNonce(opts.saltHex, opts.decisionId),
    intents: [{ intent: "token_diff", diff: opts.diff }],
  };
}

/**
 * Map an Intents-world status to a OneShot decision state.
 * Unknown intent + deadline passed = EXPIRED (provably dead, unless a
 * settlement receipt says otherwise). Unknown + deadline alive = LIVE
 * is NOT assumed: unknown means "no evidence", and the caller must keep
 * the guard's LIVE state, not invent one. This function only maps a
 * *known* status; unknown returns null and the guard stays authoritative.
 */
export function mapIntentStatusToDecision(
  status: "PENDING" | "TX_BROADCASTED" | "SETTLED" | "FAILED" | "EXPIRED",
  deadlineMs: number,
  nowMs: number
): DecisionState | null {
  if (status === "SETTLED") return "SETTLED";
  if (status === "PENDING" || status === "TX_BROADCASTED") return "LIVE";
  if (status === "FAILED") return nowMs >= deadlineMs ? "EXPIRED" : "LIVE";
  if (status === "EXPIRED") return "EXPIRED";
  return null;
}

/** Free, read-only: ask the real verifier to simulate an intent. */
export async function simulateIntent(
  payload: IntentPayload,
  fetchFn: typeof fetch = fetch,
  rpcUrl: string = MAINNET_RPC
): Promise<{ intentHash: string; currentSalt: string; fee: string | null }> {
  const args = Buffer.from(JSON.stringify({ signed_intent: payload })).toString("base64");
  const res = await fetchFn(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "oneshot-simulate",
      method: "query",
      params: {
        request_type: "call_function",
        account_id: REAL_VERIFIER,
        method_name: "simulate_intents",
        args_base64: args,
        finality: "final",
      },
    }),
  });
  const j: any = await res.json();
  if (j.error) throw new Error(`simulate_intents failed: ${JSON.stringify(j.error).slice(0, 300)}`);
  const out = JSON.parse(Buffer.from(j.result.result).toString());
  return {
    intentHash: out.intents_executed?.[0]?.intent_hash ?? out.intent_hash ?? "",
    currentSalt: out.state?.current_salt ?? "",
    fee: out.state?.fee ?? null,
  };
}

/** Free preview: 1Click quote with dry:true commits nothing. */
export async function dryQuote(
  quote: Record<string, unknown>,
  fetchFn: typeof fetch = fetch
): Promise<unknown> {
  const res = await fetchFn(`${ONECLICK_BASE}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...quote, dry: true }),
  });
  if (!res.ok) throw new Error(`1Click dry quote failed: ${res.status}`);
  return res.json();
}
