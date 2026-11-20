import { describe, expect, it } from "vitest";

import { subtaskSchema } from "@/features/pacepal/model";
import { generateMockPlan } from "@/features/pacepal/mock-planner";

describe("generateMockPlan", () => {
  it("returns a validated, editable dependency chain", () => {
    const plan = generateMockPlan({
      title: "Media Studies Paper",
      requirements: "Use five academic sources and make a clear argument.",
      deliverable: "2500 word paper",
      deadline: "2026-12-01T18:00",
      priority: "high",
    });

    expect(subtaskSchema.array().safeParse(plan).success).toBe(true);
    expect(plan).toHaveLength(8);
    expect(plan[0].dependencies).toEqual([]);
    expect(plan[1].dependencies).toEqual([plan[0].id]);
    expect(plan.every((subtask) => subtask.estimatedMinutes >= 5)).toBe(true);
  });
});
