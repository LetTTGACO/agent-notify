import type { NotificationPayload, NotificationProvider, NotificationResult } from "./types.js";

type FetchLike = typeof fetch;

interface NtfyMessage {
  topic: string;
  title: string;
  message: string;
  priority: 3 | 4;
  tags?: string[];
  click?: string;
  icon?: string;
}

function parseNtfyEndpoint(endpoint: string): { publishUrl: string; topic: string } {
  const url = new URL(endpoint);
  const parts = url.pathname.split("/").filter(Boolean);
  const topic = parts.pop();

  if (!topic) {
    throw new Error("NTFY_ENDPOINT must include a topic path");
  }

  url.pathname = parts.length > 0 ? `/${parts.join("/")}/` : "/";
  url.search = "";
  url.hash = "";

  return {
    publishUrl: url.toString(),
    topic: decodeURIComponent(topic),
  };
}

function toNtfyMessage(topic: string, input: NotificationPayload): NtfyMessage {
  return {
    topic,
    title: input.title,
    message: input.body || input.title,
    priority: input.urgency === "time_sensitive" ? 4 : 3,
    tags: input.group ? [input.group] : undefined,
    click: input.url,
    icon: input.icon,
  };
}

export class NtfyProvider implements NotificationProvider {
  readonly name = "ntfy";
  private readonly publishUrl: string;
  private readonly topic: string;

  constructor(
    endpoint: string,
    private readonly token?: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    const parsed = parseNtfyEndpoint(endpoint);
    this.publishUrl = parsed.publishUrl;
    this.topic = parsed.topic;
  }

  async send(input: NotificationPayload): Promise<NotificationResult> {
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.token) {
        headers.authorization = `Bearer ${this.token}`;
      }

      const response = await this.fetchImpl(this.publishUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(toNtfyMessage(this.topic, input)),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: `ntfy returned HTTP ${response.status}`,
        };
      }

      return { ok: true, status: response.status };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
