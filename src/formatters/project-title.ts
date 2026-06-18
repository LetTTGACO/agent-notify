function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/g, "");
}

export function projectNameFromCwd(cwd: unknown): string | undefined {
  if (typeof cwd !== "string") return undefined;

  const normalized = stripTrailingSeparators(oneLine(cwd).replace(/\\/g, "/"));
  if (!normalized || normalized === "/") return undefined;

  const parts = normalized.split("/").filter(Boolean);
  const last = parts.at(-1);
  if (!last) return undefined;

  const projectName = oneLine(last);
  return projectName || undefined;
}

export function prefixTitleWithProject(title: string, cwd: unknown): string {
  const projectName = projectNameFromCwd(cwd);
  return projectName ? `[${projectName}] ${title}` : title;
}
