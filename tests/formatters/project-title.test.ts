import { describe, expect, it } from "vitest";
import {
  prefixTitleWithProject,
  projectNameFromCwd,
} from "../../src/formatters/project-title.js";

describe("project title helpers", () => {
  it("derives the project name from a Unix cwd", () => {
    expect(projectNameFromCwd("/Users/1874w/@1874/agent-notify")).toBe(
      "agent-notify",
    );
  });

  it("derives the project name from a cwd with trailing separators", () => {
    expect(projectNameFromCwd("/Users/1874w/@1874/agent-notify///")).toBe(
      "agent-notify",
    );
  });

  it("derives the project name from a Windows-style cwd", () => {
    expect(projectNameFromCwd("C:\\Users\\1874w\\agent-notify")).toBe(
      "agent-notify",
    );
  });

  it("returns undefined for unusable cwd values", () => {
    expect(projectNameFromCwd("/")).toBeUndefined();
    expect(projectNameFromCwd("   ")).toBeUndefined();
    expect(projectNameFromCwd(undefined)).toBeUndefined();
    expect(projectNameFromCwd({ cwd: "/Users/1874w/project" })).toBeUndefined();
  });

  it("prefixes a title when a project name can be derived", () => {
    expect(
      prefixTitleWithProject("需要批准", "/Users/1874w/@1874/agent-notify"),
    ).toBe("[agent-notify] 需要批准");
  });

  it("keeps the original title when no project name can be derived", () => {
    expect(prefixTitleWithProject("需要批准", "/")).toBe("需要批准");
  });

  it("normalizes whitespace in the project name", () => {
    expect(prefixTitleWithProject("Question", "/tmp/my\nproject")).toBe(
      "[my project] Question",
    );
  });
});
