import { describe, expect, it } from "vitest";
import { redactValue } from "../../src/logging/redact.js";

describe("redactValue", () => {
  it("redacts sensitive keys recursively", () => {
    expect(
      redactValue({
        token: "abc",
        nested: { authorization: "Bearer secret", ok: "safe" },
        list: [{ api_key: "key" }],
      }),
    ).toEqual({
      token: "[REDACTED]",
      nested: { authorization: "[REDACTED]", ok: "safe" },
      list: [{ api_key: "[REDACTED]" }],
    });
  });

  it("redacts camelCase variants that contain the sensitive substrings", () => {
    expect(
      redactValue({
        token: "abc",
        authToken: "Bearer secret",
        apiKey: "key-123",
        tokenName: "macbook",
        tokensCount: 5,
        password: "shh",
      }),
    ).toEqual({
      token: "[REDACTED]",
      authToken: "[REDACTED]",
      apiKey: "[REDACTED]",
      tokenName: "[REDACTED]",
      tokensCount: "[REDACTED]",
      password: "[REDACTED]",
    });
  });
});
