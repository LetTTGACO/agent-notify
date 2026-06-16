# AgentNotify Agent Instructions

## Project Context

AgentNotify is a personal notification hub for AI coding agents. The current MVP receives selected OpenCode hook events, formats short server-side notifications, logs safe event summaries, and sends Bark notifications.

This is a sustainably updated project, not a finished platform. Prefer small, direct changes that fit the current MVP and leave future capabilities to future patches.

## Commands

- Install dependencies with `pnpm install`.
- Run the dev server with `pnpm dev`.
- Run tests with `pnpm test`.
- Run type checks with `pnpm typecheck`.
- Build with `pnpm build`.
- Run the CLI locally with `pnpm agent-notify <command>`.

## Engineering Rules

- Follow the existing TypeScript, ESM, Hono, Zod, and Vitest patterns already present in the repository.
- Keep server, adapter, formatter, provider, logging, and CLI responsibilities separated.
- Add focused tests for behavior changes, especially formatter, auth, config, logging, provider, and server route behavior.
- Do not commit secrets, `.env`, or raw notification logs from `data/`.
- Avoid broad refactors unless they are necessary for the requested change.

## Fallback And Boundary Policy

Do not overdesign fallback boundaries for hypothetical states or unimplemented future features.

AgentNotify is expected to grow incrementally. When adding or changing behavior, handle real errors that can occur in the current implementation, but avoid adding compatibility layers, placeholder branches, defensive abstractions, or silent fallbacks for features that do not exist yet.

If a missing future capability causes a real bug later, fix that bug in a follow-up patch with tests. Prefer explicit failure, narrow validation, and clear logs over speculative compatibility.
