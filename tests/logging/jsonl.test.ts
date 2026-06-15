import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { JsonlLogger } from "../../src/logging/jsonl.js";

describe("JsonlLogger", () => {
  it("writes one JSON object per line and creates parent directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-notify-"));
    const logPath = join(dir, "nested", "events.jsonl");
    const logger = new JsonlLogger(logPath);

    await logger.append({ eventId: "evt_1", token: "secret" });

    const content = await readFile(logPath, "utf8");
    expect(content.trim()).toBe('{"eventId":"evt_1","token":"[REDACTED]"}');
  });
});
