import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactValue } from "./redact.js";

export class JsonlLogger {
  constructor(private readonly logPath: string) {}

  async append(entry: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    const safe = redactValue(entry);
    await appendFile(this.logPath, `${JSON.stringify(safe)}\n`, "utf8");
  }
}
