import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { NamedToken } from "../config/env.js";
import { createDedupeKey, DedupeStore } from "../core/dedupe.js";
import { parseAgentEvent } from "../core/events.js";
import { formatNotification } from "../core/format.js";
import { JsonlLogger } from "../logging/jsonl.js";
import type { NotificationProvider } from "../providers/types.js";
import { authenticate } from "./auth.js";

export interface CreateAppOptions {
  tokens: NamedToken[];
  provider: NotificationProvider;
  logPath: string;
  logRaw: boolean;
  dedupeSeconds: number;
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const logger = new JsonlLogger(options.logPath);
  const dedupe = new DedupeStore(options.dedupeSeconds * 1000);

  async function safeLog(entry: Record<string, unknown>): Promise<void> {
    try {
      await logger.append(entry);
    } catch (error) {
      console.error(
        "[agent-notify] log append failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  app.get("/health", (c) =>
    c.json({
      ok: true,
      provider: options.provider.name,
      logPath: options.logPath,
    }),
  );

  app.post("/events", async (c) => {
    const auth = authenticate(c.req.header("authorization") ?? null, options.tokens);
    if (!auth.ok) {
      await safeLog({
        receivedAt: new Date().toISOString(),
        status: "auth_rejected",
      });
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }

    let event;
    try {
      event = parseAgentEvent(await c.req.json());
    } catch {
      await safeLog({
        receivedAt: new Date().toISOString(),
        status: "payload_rejected",
        tokenName: auth.tokenName,
      });
      return c.json({ ok: false, error: "Invalid payload" }, 400);
    }

    const eventId = `evt_${randomUUID()}`;
    const receivedAt = new Date().toISOString();
    const dedupeKey = createDedupeKey(event);
    const deduped = dedupe.seen(dedupeKey);

    if (deduped) {
      await safeLog({
        eventId,
        receivedAt,
        status: "deduped",
        tokenName: auth.tokenName,
        agent: event.agent,
        kind: event.kind,
        project: event.project,
        sessionId: event.sessionId,
        sourceEvent: event.sourceEvent,
        deduped: true,
        raw: options.logRaw ? event.raw : undefined,
      });
      return c.json({ ok: true, eventId, deduped: true });
    }

    const notification = formatNotification(event);
    const result = await options.provider.send(notification);
    await safeLog({
      eventId,
      receivedAt,
      status: result.ok ? "sent" : "provider_failed",
      tokenName: auth.tokenName,
      agent: event.agent,
      kind: event.kind,
      project: event.project,
      sessionId: event.sessionId,
      sourceEvent: event.sourceEvent,
      deduped: false,
      provider: options.provider.name,
      providerStatus: result.ok ? "sent" : "failed",
      error: result.error,
      raw: options.logRaw ? event.raw : undefined,
    });

    if (!result.ok) {
      return c.json({ ok: false, eventId, error: result.error }, 502);
    }

    return c.json({ ok: true, eventId });
  });

  return app;
}
