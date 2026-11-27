import { describe, expect, it } from "vitest";

import {
  classifyPlanValidation,
  classifyPlanningFailure,
  planningFailureCode,
  planningFailureMessage,
  planningFailureStatus,
  PlanningRequestError,
  safeProviderError,
} from "@/features/pacepal/planning/provider-error";

describe("planning provider errors", () => {
  it.each([
    ["429 RESOURCE_EXHAUSTED", "quota"],
    ["Request timed out", "timeout"],
    ["ECONNRESET while reading response", "network"],
    ["Error in the HTTP2 framing layer", "network"],
    ["Empty response from model", "invalid-output"],
    ["Output schema validation failed", "invalid-output"],
    ["401 invalid API key", "authentication"],
    ["503 service unavailable", "unavailable"],
  ])("classifies %s", (message, expected) => {
    expect(classifyPlanningFailure(new Error(message))).toBe(expected);
  });

  it("preserves the single model failure reason", () => {
    const error = new PlanningRequestError("quota");
    expect(error.reason).toBe("quota");
  });

  it("distinguishes invalid output from an unavailable model", () => {
    expect(planningFailureMessage("invalid-output")).toBe(
      "AI 返回的任务数据格式有误，未保存任何更改。",
    );
    expect(planningFailureMessage("timeout")).toBe("AI 响应超时，请重试。");
    expect(planningFailureCode("invalid-dependencies")).toBe(
      "invalid_dependencies",
    );
    expect(planningFailureStatus("invalid-output")).toBe(422);
    expect(classifyPlanValidation(["Unknown task id: missing."])).toBe(
      "invalid-output",
    );
    expect(classifyPlanValidation(["Circular dependency: a -> b -> a."])).toBe(
      "invalid-dependencies",
    );
  });

  it("redacts credentials from logs", () => {
    const key = `AIza${"a".repeat(32)}`;
    expect(safeProviderError(new Error(`request?key=${key}`))).not.toContain(
      key,
    );
  });
});
