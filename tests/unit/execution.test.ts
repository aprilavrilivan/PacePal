import { describe, expect, it } from "vitest";

import {
  recommendAcrossAssignments,
  recommendNextTask,
} from "@/features/pacepal/execution";
import type { Assignment, Subtask } from "@/features/pacepal/model";

const baseTask: Subtask = {
  actualMinutes: 0,
  activeSince: null,
  completionCriteria: "Done",
  dependencies: [],
  description: "Do the work",
  difficulty: "medium",
  estimatedMinutes: 45,
  id: "task-1",
  postponedUntil: null,
  status: "todo",
  title: "Task 1",
};

describe("recommendNextTask", () => {
  it("does not recommend work with an incomplete dependency", () => {
    const recommendation = recommendNextTask(
      [baseTask, { ...baseTask, dependencies: ["task-1"], id: "task-2" }],
      { availableMinutes: 60, energy: "high" },
    );

    expect(recommendation?.task.id).toBe("task-1");
  });

  it("prefers an active task and offers partial progress", () => {
    const recommendation = recommendNextTask(
      [
        { ...baseTask, estimatedMinutes: 90, status: "in_progress" },
        { ...baseTask, id: "task-2", estimatedMinutes: 20 },
      ],
      { availableMinutes: 30, energy: "medium" },
    );

    expect(recommendation).toMatchObject({
      isPartial: true,
      suggestedMinutes: 30,
      task: { id: "task-1" },
    });
  });
});

function assignment(
  id: string,
  priority: Assignment["priority"],
  deadline: string,
  task: Subtask,
): Assignment {
  return {
    chatMessages: [],
    checkIn: { availableMinutes: 30, energy: "medium" },
    createdAt: "2026-11-20T10:00:00.000Z",
    deadline,
    deliverable: "Report",
    id,
    priority,
    requirements: "Complete the work",
    schedule: [],
    scheduleNotice: "",
    status: "scheduled",
    subtasks: [task],
    title: id,
    scheduleVersion: 3,
  };
}

describe("recommendAcrossAssignments", () => {
  it("ranks executable subtasks across every assignment", () => {
    const result = recommendAcrossAssignments(
      [
        assignment("low-priority", "low", "2026-12-20T18:00:00.000Z", baseTask),
        assignment("urgent", "high", "2026-11-22T18:00:00.000Z", {
          ...baseTask,
          id: "urgent-task",
          difficulty: "low",
        }),
      ],
      { availableMinutes: 30, energy: "medium" },
      new Date("2026-11-21T18:00:00.000Z"),
    );

    expect(result).toMatchObject({
      assignment: { id: "urgent" },
      task: { id: "urgent-task" },
    });
    expect(result?.reasons).toContain("临近截止");
  });
});
