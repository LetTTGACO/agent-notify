import type { AgentEvent } from "./events.js";

export function createDedupeKey(event: AgentEvent): string {
  return [
    event.agent,
    event.project ?? "",
    event.sessionId ?? "",
    event.kind,
    event.title,
  ].join("|");
}

export class DedupeStore {
  private readonly seenAt = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  seen(key: string, now = Date.now()): boolean {
    const previous = this.seenAt.get(key);
    const isDuplicate =
      previous !== undefined && now - previous <= this.ttlMs;
    if (!isDuplicate) {
      this.seenAt.set(key, now);
    }
    this.cleanup(now);
    return isDuplicate;
  }

  private cleanup(now: number): void {
    for (const [key, timestamp] of this.seenAt) {
      if (now - timestamp > this.ttlMs) {
        this.seenAt.delete(key);
      }
    }
  }
}
