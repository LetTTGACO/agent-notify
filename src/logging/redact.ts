const SENSITIVE_KEY_PATTERN = /(?:^|_)(token|authorization|api_key|apikey|password|secret)(?=$|_)/;

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactValue(child);
    }
    return output;
  }

  return value;
}
