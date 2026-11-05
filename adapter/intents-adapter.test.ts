import { describe, test, expect } from "bun:test";
import { buildIntentPayload, buildNonce, mapIntentStatusToDecision } from "./intents-adapter";

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
});
