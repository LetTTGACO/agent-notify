import { describe, expect, it } from "vitest";
import { maskSecret, validateDoctorConfig } from "../../src/cli/index.js";

describe("doctor helpers", () => {
  it("masks secrets", () => {
    expect(maskSecret("https://api.day.app/abcdef123456")).toBe("https://api.day.app/[REDACTED]");
  });

  it("reports missing Bark config by default", () => {
    const result = validateDoctorConfig({});
    expect(result.ok).toBe(false);
    expect(result.messages).toContain("Missing AGENT_NOTIFY_TOKENS");
    expect(result.messages).toContain("Missing BARK_ENDPOINT");
  });

  it("reports missing ntfy endpoint when ntfy provider is selected", () => {
    const result = validateDoctorConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      AGENT_NOTIFY_PROVIDER: "ntfy",
    });
    expect(result.ok).toBe(false);
    expect(result.messages).toContain("Missing NTFY_ENDPOINT");
    expect(result.messages).not.toContain("Missing BARK_ENDPOINT");
  });

  it("accepts ntfy doctor config without Bark endpoint", () => {
    const result = validateDoctorConfig({
      AGENT_NOTIFY_TOKENS: "macbook:abc",
      AGENT_NOTIFY_PROVIDER: "ntfy",
      NTFY_ENDPOINT: "https://ntfy.sh/agent_notify_xxx",
    });
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([]);
  });
});
