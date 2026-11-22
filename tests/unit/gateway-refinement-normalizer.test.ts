import { describe, expect, it } from "vitest";

import { normalizeGatewayRefinement } from "@/features/pacepal/gateway-refinement-normalizer";
import type { Assignment } from "@/features/pacepal/model";

const assignment: Assignment = {
  availability: { dailyMinutes: 60, preferredTime: "18:00" },
  chatMessages: [],
  checkIn: { availableMinutes: 30, energy: "medium" },
  createdAt: "2026-11-21T00:00:00.000Z",
  deadline: "2026-11-30T18:00",
  deliverable: "Report",
  id: "assignment-1",
  priority: "medium",
  requirements: "Compare two approaches",
  schedule: [],
  scheduleNotice: "",
  status: "scheduled",
  subtasks: [
    {
      actualMinutes: 0,
      activeSince: null,
      completionCriteria: "Notes are ready",
      dependencies: [],
      description: "Read the selected sources",
      difficulty: "medium",
      estimatedMinutes: 60,
      id: "research",
      postponedUntil: null,
      status: "todo",
      title: "Research",
    },
  ],
  title: "Course report",
  unscheduledMinutes: 0,
};

describe("gateway refinement normalization", () => {
  it("accepts common free-model field variants", () => {
    const output = normalizeGatewayRefinement(
      {
        availability: { daily_minutes: "45 minutes", preferred_time: "19:00" },
        message: "已调整每日时间。",
        tasks: [
          {
            completion_criteria: "Notes are ready",
            depends_on: [],
            description: "Read the selected sources",
            difficulty: "中",
            duration: "1 hour",
            id: "research",
            name: "Research",
          },
        ],
      },
      assignment,
    );

    expect(output).toMatchObject({
      assistantMessage: "已调整每日时间。",
      changed: true,
    });
    expect(output.operations).toEqual(
      expect.arrayContaining([
        {
          availability: { dailyMinutes: 45, preferredTime: "19:00" },
          type: "set_availability",
        },
      ]),
    );
  });

  it("normalizes a progress operation without rewriting the task list", () => {
    const output = normalizeGatewayRefinement(
      {
        assistantMessage: "已记录研究完成。",
        operations: [
          { type: "complete_task", taskId: "research" },
          { type: "reschedule" },
        ],
      },
      assignment,
    );

    expect(output.operations).toContainEqual({
      status: "completed",
      taskId: "research",
      type: "set_status",
    });
  });
});
