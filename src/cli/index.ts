#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { loadDotenv, parseConfig } from "../config/env.js";

export function maskSecret(value: string): string {
  return value.replace(/(https?:\/\/[^/]+\/).+$/, "$1[REDACTED]");
}

export function validateDoctorConfig(env: NodeJS.ProcessEnv): {
  ok: boolean;
  messages: string[];
} {
  const messages: string[] = [];
  const provider = env.AGENT_NOTIFY_PROVIDER || "bark";
  if (!env.AGENT_NOTIFY_TOKENS) messages.push("Missing AGENT_NOTIFY_TOKENS");
  if (provider === "ntfy") {
    if (!env.NTFY_ENDPOINT) messages.push("Missing NTFY_ENDPOINT");
  } else {
    if (!env.BARK_ENDPOINT) messages.push("Missing BARK_ENDPOINT");
  }
  return { ok: messages.length === 0, messages };
}

async function postTestEvent(): Promise<void> {
  const config = parseConfig(process.env);
  const token = config.tokens[0];
  const url = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}/events`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.value}`,
    },
    body: JSON.stringify({
      agent: "opencode",
      raw: {
        id: "cli-test-event",
        type: "permission.v2.asked",
        cwd: process.cwd(),
        properties: {
          id: "cli-test-permission",
          sessionID: "cli-test-session",
          action: "bash",
          resources: ["echo agent-notify test"],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`POST /events failed with HTTP ${response.status}`);
  }
  console.log("Test event sent through /events");
}

async function doctor(): Promise<void> {
  loadDotenv();
  const validation = validateDoctorConfig(process.env);
  for (const message of validation.messages) {
    console.log(`FAIL ${message}`);
  }
  if (!validation.ok) {
    process.exitCode = 1;
    return;
  }

  const config = parseConfig(process.env);
  const endpoint =
    config.provider === "ntfy" ? config.ntfyEndpoint : config.barkEndpoint;
  console.log(
    `OK provider=${config.provider} endpoint=${maskSecret(endpoint)}`,
  );
  await mkdir(dirname(config.logPath), { recursive: true });
  await access(dirname(config.logPath));
  console.log(`OK log directory writable: ${dirname(config.logPath)}`);

  const healthUrl = `http://${config.host === "0.0.0.0" ? "127.0.0.1" : config.host}:${config.port}/health`;
  const health = await fetch(healthUrl).catch(() => null);
  if (!health?.ok) {
    console.log(`FAIL server health unavailable: ${healthUrl}`);
    process.exitCode = 1;
    return;
  }
  console.log("OK server health reachable");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "test") {
    await postTestEvent();
    return;
  }
  if (command === "doctor") {
    await doctor();
    return;
  }
  console.log("Usage: agent-notify <test|doctor>");
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
