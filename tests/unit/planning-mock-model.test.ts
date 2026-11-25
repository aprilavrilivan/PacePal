import { describe, expect, it } from "vitest";

import type { Assignment } from "@/features/pacepal/model";
import { materializeInitialPlan } from "@/features/pacepal/planning/engine";
import {
  generateMockInitialDecision,
  generateMockRefinementDecision,
} from "@/features/pacepal/planning/mock-model";

const input = {
  title: "课程论文",
  requirements: "使用至少五个学术来源并形成清晰论点",
  deliverable: "3000 字论文",
  deadline: "2026-12-10T18:00",
  priority: "high" as const,
};

function assignment(): Assignment {
  const plan = materializeInitialPlan(
    input,
    generateMockInitialDecision(input),
  );
  return {
    ...input,
    id: "paper",
    createdAt: "2026-11-25T00:00:00.000Z",
    status: "scheduled",
    subtasks: plan.subtasks,
    availability: { dailyMinutes: 60, preferredTime: "18:00" },
    schedule: [],
    unscheduledMinutes: 0,
    checkIn: { availableMinutes: 30, energy: "medium" },
    scheduleNotice: "",
    chatMessages: [],
    language: "zh",
    planVersion: 1,
    planHistory: plan.planHistory,
  };
}

describe("deterministic planning model", () => {
  it("follows Chinese-English mixed input in Chinese", () => {
    const decision = generateMockRefinementDecision(
      assignment(),
      "我觉得现在的 research scope 太 broad 了，不知道从哪里开始",
    );

    expect(decision.language).toBe("zh");
    expect(decision.intent).toBe("difficulty");
    expect(decision.operations).toEqual([]);
  });

  it("turns a clearly grounded progress report into status operations", () => {
    const current = assignment();
    const decision = generateMockRefinementDecision(
      current,
      "我已经完成了理解任务要求",
    );

    expect(decision.operations).toContainEqual({
      type: "set_status",
      taskId: current.subtasks[0]!.id,
      status: "completed",
    });
    expect(decision.operations).toContainEqual({ type: "reschedule" });
  });

  it("asks a focused question instead of applying contradictory progress", () => {
    const decision = generateMockRefinementDecision(
      assignment(),
      "I finished the literature review, but I haven't read any references yet.",
    );

    expect(decision.confirmation).toBe("requested");
    expect(decision.operations).toEqual([]);
    expect(decision.assistantMessage).toMatch(/conflict/i);
  });

  it("answers unrelated questions without modifying the saved plan", () => {
    const decision = generateMockRefinementDecision(
      assignment(),
      "By the way, what does reinforcement learning mean?",
    );

    expect(decision.intent).toBe("unrelated");
    expect(decision.operations).toEqual([]);
    expect(decision.assistantMessage).toContain("Reinforcement learning");
  });

  it("requires confirmation before destructive changes", () => {
    const decision = generateMockRefinementDecision(
      assignment(),
      "删除资料整理这一步",
    );

    expect(decision.confirmation).toBe("requested");
    expect(decision.operations).toEqual([]);
  });
});
