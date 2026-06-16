import { serve } from "@hono/node-server";
import { parseConfig } from "../config/env.js";
import { BarkProvider } from "../providers/bark.js";
import { createApp } from "./app.js";

const config = parseConfig(process.env);
const provider = new BarkProvider(config.barkEndpoint);
const app = createApp({
  tokens: config.tokens,
  provider,
  logPath: config.logPath,
  logRaw: config.logRaw,
  language: config.language,
});

serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});

console.log(`agent-notify listening on ${config.host}:${config.port}`);
