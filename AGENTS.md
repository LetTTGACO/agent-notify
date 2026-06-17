# AgentNotify Agent Instructions

## Project Context

AgentNotify is a personal notification hub for AI coding agents. It receives hook events from OpenCode, Claude Code, and Codex, formats short server-side notifications, logs safe event summaries, and pushes them via Bark or ntfy.

This is a sustainably updated project, not a finished platform. Prefer small, direct changes that fit the current scope and leave future capabilities to future patches.

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

## Documentation Boundaries

Each doc has one job. When a change adds or changes behavior, config, or a tunable, update only the docs whose job covers it — and only with content that fits that job.

- **`README.md`** — landing page. Project overview, the feature list at a glance, and links to the manuals. One short bullet per capability; no setup steps, no env values, no tuning guidance.
- **`docs/human-manual-cn.md` / `docs/human-manual-en.md`** — the complete human manual. Setup, configuration, and how each feature behaves, including every tunable env var with its default and effect. These are where behavior explanations and tuning guidance belong. Keep the Chinese and English manuals in sync.
- **`docs/ai-operation-manual.md`** — a first-time install playbook an AI agent follows to get AgentNotify running. Its only job is a clean install: which lines to edit, which to leave at default, verify, done. Do **not** add behavior explanations, feature rationale, or tuning/usage guidance here — that belongs in the human manuals. New config vars appear here only as "stays at default" entries when they are on by default; if a var has no safe default and must be set, it joins the must-edit list.

Rules of thumb:

- A new tunable env var: add to the human manuals (config section + behavior section if user-facing). Add to `README` only as a one-line capability mention, not the var itself. Add to the AI manual only if it is on-by-default (as a "leave at default" line) or must-be-set (as a must-edit line).
- A behavioral change a user would notice: explain it in the human manuals. Mention it in `README` only as a one-line capability. Do not put it in the AI manual.
- `deploy/docker/docker-compose.yml` passes through every user-tunable env var with its default, so Docker deployments can override any setting. When you add a tunable env var, add its pass-through line here too, and add a test in `tests/config/env.test.ts` asserting the pass-through (mirror the existing completion-threshold tests).
- `.env.example` documents every env var with a comment and its default. Add new vars here in the same style.
