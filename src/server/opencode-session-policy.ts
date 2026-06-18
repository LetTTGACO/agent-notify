import type { IncomingAgentEvent } from "../core/incoming-event.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 1000;

type UnknownRecord = Record<string, unknown>;

interface SessionState {
  startedAtMs: number;
}

export interface OpenCodeSessionPolicyOptions {
  completionMinSeconds: number;
  ttlMs?: number;
  maxSessions?: number;
  nowMs?: () => number;
}

export type OpenCodeSessionPolicyDecision =
  | { action: "continue" }
  | {
      action: "suppress";
      reason:
        | "state_recorded"
        | "ignored_status"
        | "completion_disabled"
        | "missing_start"
        | "below_threshold";
      sourceEvent?: string;
      sessionId?: string;
    };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function eventType(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  return getString(raw.type);
}

function properties(raw: unknown): UnknownRecord {
  if (!isRecord(raw)) return {};
  return isRecord(raw.properties) ? raw.properties : raw;
}

function sessionId(raw: unknown): string | undefined {
  const props = properties(raw);
  return getString(props.sessionID) ?? (isRecord(raw) ? getString(raw.sessionID) : undefined);
}

function statusType(raw: unknown): string | undefined {
  const status = properties(raw).status;
  if (!isRecord(status)) return undefined;
  return getString(status.type);
}

export class OpenCodeSessionPolicy {
  private readonly completionMinSeconds: number;
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly nowMs: () => number;
  private readonly sessions = new Map<string, SessionState>();

  constructor(options: OpenCodeSessionPolicyOptions) {
    this.completionMinSeconds = options.completionMinSeconds;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.nowMs = options.nowMs ?? Date.now;
  }

  apply(
    event: IncomingAgentEvent,
    tokenName: string,
  ): OpenCodeSessionPolicyDecision {
    if (event.agent !== "opencode") return { action: "continue" };

    this.prune();

    const sourceEvent = eventType(event.raw);
    const id = sessionId(event.raw);

    if (sourceEvent === "session.status") {
      if (statusType(event.raw) === "busy") {
        if (!id) {
          return { action: "suppress", reason: "ignored_status", sourceEvent };
        }
        const key = this.key(tokenName, id);
        if (!this.sessions.has(key)) {
          this.sessions.set(key, { startedAtMs: this.nowMs() });
          this.enforceMaxSessions();
        }
        return {
          action: "suppress",
          reason: "state_recorded",
          sourceEvent,
          sessionId: id,
        };
      }

      return {
        action: "suppress",
        reason: "ignored_status",
        sourceEvent,
        sessionId: id,
      };
    }

    if (sourceEvent === "session.idle") {
      if (!id) {
        return { action: "suppress", reason: "missing_start", sourceEvent };
      }
      const key = this.key(tokenName, id);
      const session = this.sessions.get(key);
      this.sessions.delete(key);

      if (this.completionMinSeconds <= 0) {
        return {
          action: "suppress",
          reason: "completion_disabled",
          sourceEvent,
          sessionId: id,
        };
      }

      if (!session) {
        return {
          action: "suppress",
          reason: "missing_start",
          sourceEvent,
          sessionId: id,
        };
      }

      const elapsedSeconds = (this.nowMs() - session.startedAtMs) / 1000;
      if (elapsedSeconds < this.completionMinSeconds) {
        return {
          action: "suppress",
          reason: "below_threshold",
          sourceEvent,
          sessionId: id,
        };
      }

      return { action: "continue" };
    }

    if (sourceEvent === "session.error") {
      if (id) {
        this.sessions.delete(this.key(tokenName, id));
      }
      return { action: "continue" };
    }

    return { action: "continue" };
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  private key(tokenName: string, sessionId: string): string {
    return `${tokenName}:${sessionId}`;
  }

  private prune(): void {
    const now = this.nowMs();
    for (const [key, session] of this.sessions) {
      if (now - session.startedAtMs > this.ttlMs) {
        this.sessions.delete(key);
      }
    }
  }

  private enforceMaxSessions(): void {
    while (this.sessions.size > this.maxSessions) {
      let oldestKey: string | undefined;
      let oldestStartedAt = Number.POSITIVE_INFINITY;

      for (const [key, session] of this.sessions) {
        if (session.startedAtMs < oldestStartedAt) {
          oldestStartedAt = session.startedAtMs;
          oldestKey = key;
        }
      }

      if (!oldestKey) return;
      this.sessions.delete(oldestKey);
    }
  }
}
