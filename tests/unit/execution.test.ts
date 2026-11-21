import { describe, expect, it } from "vitest";

import { recommendNextTask } from "@/features/pacepal/execution";
import type { Subtask } from "@/features/pacepal/model";

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
