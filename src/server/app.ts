import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { NamedToken } from "../config/env.js";
import type { NotificationLanguage } from "../core/language.js";
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
  language: NotificationLanguage;
}

function trace(stage: string, fields: Record<string, unknown>): void {
  try {
    const ts = new Date().toLocaleString();
    console.log(`[agent-notify] ${ts} ${stage} ${JSON.stringify(fields)}`);
  } catch {
    // Never throw from logging; requests must keep flowing.
  }
}

function getRawType(raw: unknown): string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "unknown";
  const t = (raw as { type?: unknown }).type;
  return typeof t === "string" ? t : "unknown";
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
    const receivedAt = new Date().toLocaleString()
    trace("received", { method: "POST", path: "/events" });

    const auth = authenticate(c.req.header("authorization") ?? null, options.tokens);
    if (!auth.ok) {
      trace("auth_rejected", { receivedAt });
      await safeLog({
        receivedAt,
        status: "auth_rejected",
      });
      return c.json({ ok: false, error: "Unauthorized" }, 401);
    }
    trace("auth_ok", { receivedAt, tokenName: auth.tokenName });

    let incoming;
    try {
      incoming = parseIncomingAgentEvent(await c.req.json());
    } catch (error) {
      trace("payload_invalid", {
        receivedAt,
        tokenName: auth.tokenName,
        error: error instanceof Error ? error.message : String(error),
      });
      await safeLog({
        receivedAt,
        status: "payload_rejected",
        tokenName: auth.tokenName,
      });
      return c.json({ ok: false, error: "Invalid payload" }, 400);
    }
    trace("payload_ok", {
      receivedAt,
      tokenName: auth.tokenName,
      agent: incoming.agent,
      type: getRawType(incoming.raw),
    });

    let formatted;
    try {
      formatted = formatIncomingEvent(incoming, { language: options.language });
    } catch (error) {
      trace("format_error", {
        receivedAt,
        tokenName: auth.tokenName,
        agent: incoming.agent,
        type: getRawType(incoming.raw),
        error: error instanceof Error ? error.message : String(error),
      });
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
    trace("format_ok", {
      receivedAt,
      tokenName: auth.tokenName,
      kind: formatted.kind,
      sourceEvent: formatted.sourceEvent,
      sessionId: formatted.sessionId,
    });

    const eventId = `evt_${randomUUID()}`;
    const result = await options.provider.send(formatted.notification);

    if (result.ok) {
      trace("sent", {
        eventId,
        receivedAt,
        tokenName: auth.tokenName,
        kind: formatted.kind,
        sourceEvent: formatted.sourceEvent,
        sessionId: formatted.sessionId,
        provider: options.provider.name,
      });
    } else {
      trace("provider_failed", {
        eventId,
        receivedAt,
        tokenName: auth.tokenName,
        kind: formatted.kind,
        sourceEvent: formatted.sourceEvent,
        sessionId: formatted.sessionId,
        provider: options.provider.name,
        error: result.error,
      });
    }

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
