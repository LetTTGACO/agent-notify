import type { FormattedAgentEvent } from "../core/formatted-event.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

const COOLED_KINDS = new Set(["permission_required", "question_required"]);

export interface CooldownPolicyOptions {
  cooldownSeconds: number;
  ttlMs?: number;
  nowMs?: () => number;
}

export type CooldownPolicyDecision =
  | { action: "continue" }
  | {
      action: "suppress";
      reason: "cooldown";
      kind: string;
      sessionId?: string;
    };

export class CooldownPolicy {
  private readonly cooldownMs: number;
  private readonly ttlMs: number;
  private readonly nowMs: () => number;
  private readonly lastNotifiedAtMs = new Map<string, number>();

  constructor(options: CooldownPolicyOptions) {
    this.cooldownMs = options.cooldownSeconds * 1000;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.nowMs = options.nowMs ?? Date.now;
  }

  apply(
    formatted: FormattedAgentEvent,
    tokenName: string,
  ): CooldownPolicyDecision {
    this.prune();

    if (this.cooldownMs <= 0) return { action: "continue" };
    if (!COOLED_KINDS.has(formatted.kind)) return { action: "continue" };
    if (!formatted.sessionId) return { action: "continue" };

    const key = `${tokenName}:${formatted.agent}:${formatted.sessionId}`;
    const now = this.nowMs();
    const last = this.lastNotifiedAtMs.get(key);

    this.lastNotifiedAtMs.set(key, now);

    if (last !== undefined && now - last < this.cooldownMs) {
      return {
        action: "suppress",
        reason: "cooldown",
        kind: formatted.kind,
        sessionId: formatted.sessionId,
      };
    }

    return { action: "continue" };
  }

  private prune(): void {
    const now = this.nowMs();
    for (const [key, last] of this.lastNotifiedAtMs) {
      if (now - last > this.ttlMs) {
        this.lastNotifiedAtMs.delete(key);
      }
    }
  }
}
