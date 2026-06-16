import { describe, expect, it } from "vitest";
import { formatIncomingEvent } from "../../src/formatters/index.js";
import { formatOpenCodeEvent } from "../../src/formatters/opencode.js";

describe("OpenCode formatter", () => {
  it("formats permission.v2.asked as a short approval notification", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_1",
        type: "permission.v2.asked",
        properties: {
          id: "perm_1",
          sessionID: "session_1",
          action: "bash",
          resources: ["pnpm test -- --runInBand"],
        },
      },
    });

    expect(formatted).toMatchObject({
      agent: "opencode",
      kind: "permission_required",
      sourceEvent: "permission.v2.asked",
      sessionId: "session_1",
      notification: {
        title: "Approve bash",
        body: "pnpm test -- --runInBand",
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: "https://opencode.ai/apple-touch-icon.png",
      },
    });
    expect(formatted.notification.title).not.toContain("OpenCode");
    expect(formatted.notification.body).not.toContain("\n");
  });

  it("formats permission.asked as a short approval notification", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_2",
        type: "permission.asked",
        properties: {
          id: "perm_2",
          sessionID: "session_2",
          permission: "edit",
          patterns: ["src/server/app.ts"],
          metadata: {},
          always: [],
        },
      },
    });

    expect(formatted).toMatchObject({
      kind: "permission_required",
      sourceEvent: "permission.asked",
      sessionId: "session_2",
      notification: {
        title: "Approve edit",
        body: "src/server/app.ts",
        urgency: "time_sensitive",
        group: "OpenCode",
        icon: "https://opencode.ai/apple-touch-icon.png",
      },
    });
  });

  it("formats session.error with a short error body", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_3",
        type: "session.error",
        properties: {
          sessionID: "session_3",
          error: {
            name: "ApiError",
            message: "Provider returned HTTP 500 while streaming the response",
          },
        },
      },
    });

    expect(formatted).toMatchObject({
      kind: "failed",
      sourceEvent: "session.error",
      sessionId: "session_3",
      notification: {
        title: "Failed",
        body: "Provider returned HTTP 500 while streaming the response",
        urgency: "time_sensitive",
        group: "OpenCode",
      },
    });
  });

  it("formats session.idle as a completion notification", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_complete_1",
        type: "session.idle",
        properties: {
          sessionID: "session_complete_1",
        },
      },
    });

    expect(formatted).toMatchObject({
      kind: "completed",
      sourceEvent: "session.idle",
      sessionId: "session_complete_1",
      notification: {
        title: "Task complete",
        body: "Ready to review",
        urgency: "time_sensitive",
        group: "OpenCode",
      },
    });
  });

  it("formats session.idle completion in Chinese", () => {
    const formatted = formatOpenCodeEvent(
      {
        agent: "opencode",
        raw: {
          id: "evt_complete_zh_1",
          type: "session.idle",
          properties: {
            sessionID: "session_complete_zh_1",
          },
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("任务已完成");
    expect(formatted.notification.body).toBe("可以查看结果了");
  });

  it("formats question.asked as a short answer-required notification", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_question_1",
        type: "question.asked",
        properties: {
          id: "question_1",
          sessionID: "session_question_1",
          questions: [
            {
              header: "Scene",
              question: "「测试下长任务」具体想测试哪个场景？",
              options: [
                {
                  label: "派发长跑子代理",
                  description: "派发一个子代理跑耗时任务",
                },
              ],
            },
          ],
        },
      },
    });

    expect(formatted).toMatchObject({
      kind: "question_required",
      sourceEvent: "question.asked",
      sessionId: "session_question_1",
      notification: {
        title: "Question",
        body: "「测试下长任务」具体想测试哪个场景？",
        urgency: "time_sensitive",
        group: "OpenCode",
      },
    });
  });

  it("formats permission.v2.asked in Chinese when requested", () => {
    const formatted = formatOpenCodeEvent(
      {
        agent: "opencode",
        raw: {
          id: "evt_zh_1",
          type: "permission.v2.asked",
          properties: {
            id: "perm_zh_1",
            sessionID: "session_zh_1",
            action: "delete",
            resources: ["src/old-file.ts"],
          },
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("批准删除文件");
    expect(formatted.notification.body).toBe("src/old-file.ts");
  });

  it("formats permission fallback text in Chinese", () => {
    const formatted = formatOpenCodeEvent(
      {
        agent: "opencode",
        raw: {
          id: "evt_zh_2",
          type: "permission.asked",
          properties: {
            id: "perm_zh_2",
            sessionID: "session_zh_2",
            permission: "edit",
          },
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("批准编辑文件");
    expect(formatted.notification.body).toBe("请求权限");
  });

  it("formats session.error fallback in Chinese", () => {
    const formatted = formatOpenCodeEvent(
      {
        agent: "opencode",
        raw: {
          id: "evt_zh_3",
          type: "session.error",
          properties: {
            sessionID: "session_zh_3",
          },
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("失败");
    expect(formatted.notification.body).toBe("会话错误");
  });

  it("formats question.asked fallback in Chinese", () => {
    const formatted = formatOpenCodeEvent(
      {
        agent: "opencode",
        raw: {
          id: "evt_zh_question",
          type: "question.asked",
          properties: {
            id: "question_zh",
            sessionID: "session_zh_question",
            questions: [],
          },
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("需要回答");
    expect(formatted.notification.body).toBe("请选择一个回答");
  });

  it("truncates long body text to one line", () => {
    const formatted = formatOpenCodeEvent({
      agent: "opencode",
      raw: {
        id: "evt_4",
        type: "permission.v2.asked",
        properties: {
          id: "perm_4",
          sessionID: "session_4",
          action: "bash",
          resources: [
            "printf 'this is a very long command that should be shortened before it reaches a watch notification display'",
          ],
        },
      },
    });

    expect(formatted.notification.body).not.toContain("\n");
    expect(formatted.notification.body.length).toBeLessThanOrEqual(80);
    expect(formatted.notification.body.endsWith("...")).toBe(true);
  });

  it("throws a format error for unsupported OpenCode event types", () => {
    expect(() =>
      formatOpenCodeEvent({
        agent: "opencode",
        raw: {
          id: "evt_5",
          type: "message.updated",
          properties: {},
        },
      }),
    ).toThrow("Unsupported OpenCode event type: message.updated");
  });

  it("dispatches incoming events to the OpenCode formatter", () => {
    const formatted = formatIncomingEvent(
      {
        agent: "opencode",
        raw: {
          id: "evt_6",
          type: "permission.v2.asked",
          properties: {
            id: "perm_6",
            sessionID: "session_6",
            action: "webfetch",
            resources: ["https://example.com"],
          },
        },
      },
      { language: "zh" },
    );

    expect(formatted.notification.title).toBe("批准网页访问");
  });
});
