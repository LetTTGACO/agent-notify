import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { NamedToken } from "../config/env.js";
import { parseIncomingAgentEvent } from "../core/incoming-event.js";
import { EventFormatError } from "../core/formatted-event.js";
import { formatIncomingEvent } from "../formatters/index.js";
import { JsonlLogger } from "../logging/jsonl.js";
import type { NotificationProvider } from "../providers/types.js";
import { authenticate } from "./auth.js";

export interface CreateAppOptions {
  tokens: NamedToken[];
  provider: NotificationProvider;
  logPath: string;
  logRaw: boolean;
}

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const logger = new JsonlLogger(options.logPath);

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

    const receivedAt = new Date().toISOString();
    let incoming;
    try {
      incoming = parseIncomingAgentEvent(await c.req.json());
    } catch {
      await safeLog({
        receivedAt,
        status: "payload_rejected",
        tokenName: auth.tokenName,
      });
      return c.json({ ok: false, error: "Invalid payload" }, 400);
    }

    let formatted;
    try {
      formatted = formatIncomingEvent(incoming);
    } catch (error) {
      await safeLog({
        receivedAt,
        status: "payload_rejected",
        tokenName: auth.tokenName,
        agent: incoming.agent,
        raw: options.logRaw ? incoming.raw : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
      const message =
        error instanceof EventFormatError ? error.message : "Invalid payload";
      return c.json({ ok: false, error: message }, 400);
    }

    const eventId = `evt_${randomUUID()}`;
    const result = await options.provider.send(formatted.notification);

    await safeLog({
      eventId,
      receivedAt,
      status: result.ok ? "sent" : "provider_failed",
      tokenName: auth.tokenName,
      agent: formatted.agent,
      kind: formatted.kind,
      sessionId: formatted.sessionId,
      sourceEvent: formatted.sourceEvent,
      provider: options.provider.name,
      providerStatus: result.ok ? "sent" : "failed",
      error: result.error,
      raw: options.logRaw ? incoming.raw : undefined,
    });

    if (!result.ok) {
      return c.json({ ok: false, eventId, error: result.error }, 502);
    }

    return c.json({ ok: true, eventId });
  });

  return app;
}
