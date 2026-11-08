import { describe, test, expect } from "bun:test";
import { buildIntentPayload, buildNonce, mapIntentStatusToDecision, dryQuote, ONECLICK_BASE, ONECLICK_WNEAR, ONECLICK_USDC_NEAR } from "./intents-adapter";

describe("intents adapter", () => {
  test("same decision + same salt = same nonce; different decision = different nonce", () => {
    const a = buildIntentPayload({
      signerId: "agent.testnet", decisionId: "abc123", saltHex: "01020304",
      deadline: new Date("2026-11-06T00:00:00Z"), diff: { "wrap.testnet": "-100", "usdc.testnet": "100" },
    });
    const b = buildIntentPayload({
      signerId: "agent.testnet", decisionId: "abc123", saltHex: "01020304",
      deadline: new Date("2026-11-06T00:00:00Z"), diff: { "wrap.testnet": "-100", "usdc.testnet": "100" },
    });
    const c = buildIntentPayload({
      signerId: "agent.testnet", decisionId: "different", saltHex: "01020304",
      deadline: new Date("2026-11-06T00:00:00Z"), diff: { "wrap.testnet": "-100", "usdc.testnet": "100" },
    });
    expect(a.nonce).toBe(b.nonce);
    expect(a.nonce).not.toBe(c.nonce);
    expect(Buffer.from(a.nonce, "base64").length).toBe(32);
    expect(Buffer.from(a.nonce, "base64").subarray(0, 4).toString("hex")).toBe("01020304");
    expect(a.verifying_contract).toBe("intents.near");
  });

  test("nonce is 32 bytes even when salt changes", () => {
    expect(Buffer.from(buildNonce("aabbccdd", "x"), "base64").length).toBe(32);
  });

  test("status mapping: settled wins, pending is live, expired is expired", () => {
    expect(mapIntentStatusToDecision("SETTLED", 2000, 1000)).toBe("SETTLED");
    expect(mapIntentStatusToDecision("PENDING", 2000, 1000)).toBe("LIVE");
    expect(mapIntentStatusToDecision("TX_BROADCASTED", 2000, 1000)).toBe("LIVE");
    expect(mapIntentStatusToDecision("EXPIRED", 2000, 3000)).toBe("EXPIRED");
    expect(mapIntentStatusToDecision("FAILED", 2000, 3000)).toBe("EXPIRED");
    expect(mapIntentStatusToDecision("FAILED", 2000, 1000)).toBe("LIVE");
  });

  test("dryQuote posts dry:true with the token-list asset ids, NEAR legs via INTENTS", async () => {
    // Asset ids resolved from GET /v0/tokens 2026-11-07 (roadmap item 4).
    expect(ONECLICK_USDC_NEAR).toBe(
      "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
    );
    expect(ONECLICK_WNEAR).toBe("nep141:wrap.near");
    let seenUrl = "";
    let seenBody: any = null;
    const fakeFetch = (async (url: any, init: any) => {
      seenUrl = String(url);
      seenBody = JSON.parse(init.body);
      return { ok: true, json: async () => ({ quote: { amountOut: "374578" } }) };
    }) as unknown as typeof fetch;
    const out = await dryQuote(
      {
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: ONECLICK_WNEAR,
        depositType: "INTENTS",
        destinationAsset: ONECLICK_USDC_NEAR,
        amount: "100000000000000000000000",
        refundTo: "oneshot-guard.near",
        refundType: "INTENTS",
        recipient: "oneshot-guard.near",
        recipientType: "INTENTS",
        deadline: "2026-11-07T04:24:09.000Z",
        quoteWaitingTimeMs: 10000,
      },
      fakeFetch
    );
    expect(seenUrl).toBe(`${ONECLICK_BASE}/quote`);
    expect(seenBody.dry).toBe(true);
    expect(seenBody.originAsset).toBe("nep141:wrap.near");
    expect(seenBody.destinationAsset).toBe(ONECLICK_USDC_NEAR);
    expect(seenBody.depositType).toBe("INTENTS");
    expect(seenBody.recipientType).toBe("INTENTS");
    expect((out as any).quote.amountOut).toBe("374578");
  });

  test("dryQuote failure keeps the API's own error message", async () => {
    const fakeFetch = (async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "Internal server error" }),
    })) as unknown as typeof fetch;
    await expect(dryQuote({ amount: "1" }, fakeFetch)).rejects.toThrow(
      "1Click dry quote failed: 400"
    );
    await expect(dryQuote({ amount: "1" }, fakeFetch)).rejects.toThrow(
      "Internal server error"
    );
  });
});
