import { describe, expect, it } from "vitest";

import type { Assignment } from "@/features/pacepal/model";
import {
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
});
