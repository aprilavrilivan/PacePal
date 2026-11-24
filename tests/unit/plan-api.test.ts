import { describe, expect, it } from "vitest";

import {
  classifyGatewayFailure,
  gatewayFailureLog,
  planningModelsFailed,
} from "@/features/pacepal/gateway-error";
import { buildSubtasks } from "@/features/pacepal/plan-api";

describe("classifyGatewayFailure", () => {
  it.each([
    ["OIDC token is invalid", "authentication"],
    ["Request failed with status 401", "authentication"],
    ["Request failed with status 403", "configuration"],
    ["API is not enabled for this project", "configuration"],
    ["Insufficient credits", "quota"],
    ["429 RESOURCE_EXHAUSTED", "quota"],
    ["Request timed out", "timeout"],
    ["Deadline exceeded while generating content", "timeout"],
    ["Output schema validation failed", "invalid-output"],
    ["ZodError invalid task operation", "invalid-output"],
    ["Provider is unavailable", "unavailable"],
    ["Request failed with status 503", "unavailable"],
    ["Model gemini-example was not found", "model-unavailable"],
    ["Unexpected failure", "gateway-error"],
  ])("classifies %s", (message, expected) => {
    expect(classifyGatewayFailure(new Error(message))).toBe(expected);
  });

  it("finds provider status codes in nested SDK causes", () => {
    const error = Object.assign(new Error("AI request failed"), {
      cause: { statusCode: 429, data: { error: "RESOURCE_EXHAUSTED" } },
    });

    expect(classifyGatewayFailure(error)).toBe("quota");
  });

  it("redacts Google API keys from diagnostics", () => {
    const apiKey = `AIza${"a".repeat(32)}`;
    const log = gatewayFailureLog(
      new Error(`Request failed: https://example.test?key=${apiKey}`),
    );

    expect(log).not.toContain(apiKey);
    expect(log).toContain("[redacted]");
  });

  it("keeps the direct Gemini failure instead of the last gateway failure", () => {
    const error = planningModelsFailed([
      {
        model: "google/gemini-3.8-flash:direct",
        provider: "google",
        reason: "unavailable",
      },
      {
        model: "recursive/flint-v1.0",
        provider: "gateway",
        reason: "authentication",
      },
    ]);

    expect(classifyGatewayFailure(error)).toBe("unavailable");
  });

  it("prioritizes an invalid direct key over fallback failures", () => {
    const error = planningModelsFailed([
      {
        model: "google/gemini-3.8-flash:direct",
        provider: "google",
        reason: "authentication",
      },
      {
        model: "recursive/flint-v1.0",
        provider: "gateway",
        reason: "unavailable",
      },
    ]);

    expect(classifyGatewayFailure(error)).toBe("authentication");
  });
});

describe("buildSubtasks", () => {
  it("adds stable ids, status, and sequential dependencies", () => {
    const subtasks = buildSubtasks(
      {
        deadline: "2026-12-01T18:00",
        deliverable: "2000 字论文",
        priority: "high",
        requirements: "比较两种理论。",
        title: "社会学课程论文",
      },
      [
        {
          completionCriteria: "列出要求",
          description: "提取评分与提交要求。",
          difficulty: "low",
          estimatedMinutes: 20,
          title: "理解要求",
        },
        {
          completionCriteria: "形成提纲",
          description: "安排论点和证据。",
          difficulty: "medium",
          estimatedMinutes: 45,
          title: "完成提纲",
        },
      ],
    );

    expect(subtasks).toEqual([
      expect.objectContaining({
        dependencies: [],
        id: "社会学课程论文-task-1",
        status: "todo",
      }),
      expect.objectContaining({
        dependencies: ["社会学课程论文-task-1"],
        id: "社会学课程论文-task-2",
        status: "todo",
      }),
    ]);
  });
});
