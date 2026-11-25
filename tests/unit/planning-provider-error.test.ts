import { describe, expect, it } from "vitest";

import {
  classifyPlanningFailure,
  PlanningProviderError,
  safeProviderError,
} from "@/features/pacepal/planning/provider-error";

describe("planning provider errors", () => {
  it.each([
    ["429 RESOURCE_EXHAUSTED", "quota"],
    ["Request timed out", "timeout"],
    ["Output schema validation failed", "invalid-output"],
    ["401 invalid API key", "authentication"],
    ["503 service unavailable", "unavailable"],
  ])("classifies %s", (message, expected) => {
    expect(classifyPlanningFailure(new Error(message))).toBe(expected);
  });

  it("preserves the single model failure reason", () => {
    const error = new PlanningProviderError("quota");
    expect(error.reason).toBe("quota");
  });

  it("redacts credentials from logs", () => {
    const key = `AIza${"a".repeat(32)}`;
    expect(safeProviderError(new Error(`request?key=${key}`))).not.toContain(
      key,
    );
  });
});
