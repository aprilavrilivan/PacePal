import { describe, expect, it } from "vitest";

import type { Assignment } from "@/features/pacepal/model";
import {
  coerceGatewayRefinementContext,
  gatewayRefinementDecisionSchema,
  refinementQualityIssues,
} from "@/features/pacepal/refinement-quality";

const assignment: Assignment = {
  availability: { dailyMinutes: 60, preferredTime: "09:00" },
  chatMessages: [],
  checkIn: { availableMinutes: 30, energy: "medium" },
  createdAt: "2026-11-23T00:00:00.000Z",
  deadline: "2026-12-15T18:00",
  deliverable: "Paper",
  id: "assignment-quality",
  priority: "high",
  requirements: "Complete experiments and write the paper",
  schedule: [],
  scheduleNotice: "",
  status: "scheduled",
  subtasks: [
    {
      actualMinutes: 120,
      activeSince: null,
      completionCriteria: "All manipulation runs are saved",
      dependencies: [],
      description: "Finish manipulation tasks",
      difficulty: "high",
      estimatedMinutes: 180,
      id: "manipulation",
      postponedUntil: null,
      status: "in_progress",
      title: "Finish manipulation tasks",
    },
    {
      actualMinutes: 0,
      activeSince: null,
      completionCriteria: "A balanced option is selected",
      dependencies: ["manipulation"],
      description: "Compare experiment settings",
      difficulty: "medium",
      estimatedMinutes: 60,
      id: "balanced-option",
      postponedUntil: null,
      status: "todo",
      title: "Find balanced option",
    },
    {
      actualMinutes: 0,
      activeSince: null,
      completionCriteria: "The literature review is complete",
      dependencies: [],
      description: "Review related work",
      difficulty: "medium",
      estimatedMinutes: 90,
      id: "literature",
      postponedUntil: null,
      status: "todo",
      title: "Literature review",
    },
  ],
  title: "Research paper",
  unscheduledMinutes: 0,
};

function decision(value: Record<string, unknown>) {
  return gatewayRefinementDecisionSchema.parse({
    changeSummary: "我已根据你的最新进度更新剩余工作和执行顺序。",
    clarificationQuestion: "",
    needsClarification: false,
    planChangeRequested: true,
    understanding: "我理解了你描述的最新任务状态。",
    ...value,
  });
}

describe("gateway refinement quality checks", () => {
  it("recovers flexible model metadata and broad task intent wording", () => {
    const context = coerceGatewayRefinementContext(
      {
        actions: [{ action: "complete_task", task_id: "literature" }],
        assistant_message: "我理解你的最新进度，并更新了相关任务。",
        intent: ["progress", "replan"],
        interpretation: "文献部分已经完成，需要继续推进实验。",
      },
      "文献已经做完了，实验卡住，先把写作提前，再重新安排一下",
      assignment.title,
    );

    expect(context.intents).toEqual(
      expect.arrayContaining([
        "progress_update",
        "blocker",
        "reorder",
        "schedule",
      ]),
    );
    expect(context.planChangeRequested).toBe(true);
    expect(context.understanding).toContain("文献部分已经完成");
    expect(context.changeSummary).toContain("更新了相关任务");
  });

  it("rejects a remaining-scope update that merely reschedules", () => {
    const parsed = decision({
      intents: ["remaining_scope"],
      operations: [{ type: "reschedule" }],
    });
    const output = {
      assistantMessage: `${parsed.understanding}\n\n${parsed.changeSummary}`,
      changed: true,
      operations: parsed.operations,
    };

    expect(refinementQualityIssues(parsed, output, assignment)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("real task mutation"),
        expect.stringContaining("change at least one task status"),
      ]),
    );
  });

  it("accepts a mixed progress, structure, order, and schedule update", () => {
    const parsed = decision({
      intents: [
        "progress_update",
        "remaining_scope",
        "task_structure",
        "reorder",
      ],
      operations: [
        { type: "set_status", taskId: "literature", status: "completed" },
        {
          afterTaskId: "balanced-option",
          task: {
            completionCriteria: "The final paper draft is complete",
            dependencies: ["balanced-option"],
            description: "Write the final paper from the completed experiments",
            difficulty: "high",
            estimatedMinutes: 180,
            id: "final-paper-writing",
            title: "Final paper writing",
          },
          type: "add_task",
        },
        {
          taskIds: ["manipulation", "balanced-option", "final-paper-writing"],
          type: "reorder_tasks",
        },
        { type: "reschedule" },
      ],
    });
    const output = {
      assistantMessage: `${parsed.understanding}\n\n${parsed.changeSummary}`,
      changed: true,
      operations: parsed.operations,
    };

    expect(refinementQualityIssues(parsed, output, assignment)).toEqual([]);
  });

  it("rejects a task-breakdown response with no task edits", () => {
    const parsed = decision({
      intents: ["task_breakdown"],
      operations: [{ type: "reschedule" }],
    });
    const output = {
      assistantMessage: `${parsed.understanding}\n\n${parsed.changeSummary}`,
      changed: true,
      operations: parsed.operations,
    };

    expect(refinementQualityIssues(parsed, output, assignment)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("add or rewrite task steps"),
      ]),
    );
  });

  it("allows a schedule-only request to recalculate the calendar", () => {
    const parsed = decision({
      intents: ["schedule"],
      operations: [{ type: "reschedule" }],
    });
    const output = {
      assistantMessage: `${parsed.understanding}\n\n${parsed.changeSummary}`,
      changed: true,
      operations: parsed.operations,
    };

    expect(refinementQualityIssues(parsed, output, assignment)).toEqual([]);
  });

  it("rejects operations that look valid but cannot change the saved plan", () => {
    const parsed = decision({
      intents: ["progress_update"],
      operations: [
        { type: "set_status", taskId: "missing-task", status: "completed" },
        { type: "reschedule" },
      ],
    });
    const output = {
      assistantMessage: `${parsed.understanding}\n\n${parsed.changeSummary}`,
      changed: true,
      operations: parsed.operations,
    };

    expect(refinementQualityIssues(parsed, output, assignment)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("do not change the saved plan"),
      ]),
    );
  });
});
