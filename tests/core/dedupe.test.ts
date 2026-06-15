import { describe, expect, it } from "vitest";
import { DedupeStore, createDedupeKey } from "../../src/core/dedupe.js";

describe("dedupe", () => {
  it("creates a stable key from event fields", () => {
    expect(
      createDedupeKey({
        agent: "opencode",
        kind: "failed",
        title: "Error",
        project: "agent-notify",
        sessionId: "s1",
      }),
    ).toBe("opencode|agent-notify|s1|failed|Error");
  });

  it("dedupes within ttl", () => {
    const store = new DedupeStore(30_000);
    const now = 1000;

    expect(store.seen("key", now)).toBe(false);
    expect(store.seen("key", now + 10_000)).toBe(true);
    expect(store.seen("key", now + 31_000)).toBe(false);
  });
});
