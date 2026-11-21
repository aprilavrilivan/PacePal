import { describe, expect, it } from "vitest";

import { normalizeGatewayPlan } from "@/features/pacepal/gateway-plan-normalizer";

describe("normalizeGatewayPlan", () => {
  it("accepts the alternate fields returned by the free model", () => {
    const plan = normalizeGatewayPlan({
      tasks: Array.from({ length: 4 }, (_, index) => ({
        description: `完成第 ${index + 1} 步并记录结果。`,
        estimated_time: `${30 + index * 15} 分钟`,
        task_id: index + 1,
        task_name: `任务 ${index + 1}`,
      })),
    });

    expect(plan.tasks).toHaveLength(4);
    expect(plan.tasks[0]).toMatchObject({
      difficulty: "low",
      estimatedMinutes: 30,
      title: "任务 1",
    });
    expect(plan.tasks[3]).toMatchObject({
      difficulty: "high",
      estimatedMinutes: 75,
    });
  });

  it("reads nested steps and converts hour estimates", () => {
    const plan = normalizeGatewayPlan({
      plan: {
        steps: Array.from({ length: 4 }, (_, index) => ({
          acceptance_criteria: `Step ${index + 1} checked`,
          details: `Complete step ${index + 1}`,
          duration: "1 hour",
          name: `Step ${index + 1}`,
        })),
      },
    });

    expect(plan.tasks[0]).toMatchObject({
      completionCriteria: "Step 1 checked",
      difficulty: "medium",
      estimatedMinutes: 60,
      title: "Step 1",
    });
  });
});
