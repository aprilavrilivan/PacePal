import { describe, expect, it } from "vitest";

import { classifyGatewayFailure } from "@/features/pacepal/gateway-error";
import { buildSubtasks } from "@/features/pacepal/plan-api";

describe("classifyGatewayFailure", () => {
  it.each([
    ["OIDC token is invalid", "authentication"],
    ["Insufficient credits", "quota"],
    ["Request timed out", "timeout"],
    ["Output schema validation failed", "invalid-output"],
    ["Provider is unavailable", "unavailable"],
    ["Unexpected failure", "gateway-error"],
  ])("classifies %s", (message, expected) => {
    expect(classifyGatewayFailure(new Error(message))).toBe(expected);
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
