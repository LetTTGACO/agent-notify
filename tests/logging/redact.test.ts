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
});
