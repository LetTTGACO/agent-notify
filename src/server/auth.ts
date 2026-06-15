import type { NamedToken } from "../config/env.js";

export interface AuthResult {
  ok: boolean;
  tokenName?: string;
}

export function authenticate(header: string | null, tokens: NamedToken[]): AuthResult {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return { ok: false };

  const value = header.slice(prefix.length);
  const match = tokens.find((token) => token.value === value);
  if (!match) return { ok: false };

  return { ok: true, tokenName: match.name };
}
