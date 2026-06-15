import { describe, expect, it } from "vitest";
import { maskSecret, validateDoctorConfig } from "../../src/cli/index.js";

describe("doctor helpers", () => {
  it("masks secrets", () => {
    expect(maskSecret("https://api.day.app/abcdef123456")).toBe("https://api.day.app/[REDACTED]");
  });

  it("reports missing config", () => {
    const result = validateDoctorConfig({});
    expect(result.ok).toBe(false);
    expect(result.messages).toContain("Missing AGENT_NOTIFY_TOKENS");
    expect(result.messages).toContain("Missing BARK_ENDPOINT");
  });
});
