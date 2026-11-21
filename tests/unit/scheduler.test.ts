import { describe, expect, it } from "vitest";

import type { Subtask } from "@/features/pacepal/model";
import {
  buildSchedule,
  calculateDeadlineRisk,
} from "@/features/pacepal/scheduler";

const subtasks: Subtask[] = [
  {
    actualMinutes: 0,
    activeSince: null,
    id: "research",
    title: "Research",
    description: "Find sources.",
    estimatedMinutes: 60,
    completionCriteria: "Save five sources.",
    difficulty: "medium",
    dependencies: [],
    status: "todo",
    postponedUntil: null,
  },
  {
    actualMinutes: 0,
    activeSince: null,
    id: "outline",
    title: "Outline",
    description: "Plan the argument.",
    estimatedMinutes: 30,
    completionCriteria: "Finish a paragraph outline.",
    difficulty: "medium",
    dependencies: ["research"],
    status: "todo",
    postponedUntil: null,
  },
];

describe("buildSchedule", () => {
  it("keeps dependency order and daily capacity", () => {
    const result = buildSchedule(
      subtasks,
      "2026-11-22T23:00",
      { dailyMinutes: 60, preferredTime: "18:00" },
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.unscheduledMinutes).toBe(0);
    expect(result.blocks.map((block) => block.subtaskId)).toEqual([
      "research",
      "outline",
    ]);
    expect(result.blocks[0]).toMatchObject({
      date: "2026-11-20",
      durationMinutes: 60,
      startTime: "18:00",
    });
    expect(result.blocks[1]).toMatchObject({
      date: "2026-11-21",
      durationMinutes: 30,
      startTime: "18:00",
    });
  });

  it("reports work that cannot fit before the deadline", () => {
    const result = buildSchedule(
      subtasks,
      "2026-11-20T23:00",
      { dailyMinutes: 30, preferredTime: "18:00" },
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.unscheduledMinutes).toBe(60);
  });

  it("does not schedule completed work", () => {
    const result = buildSchedule(
      [{ ...subtasks[0], status: "completed" }, subtasks[1]],
      "2026-11-22T23:00",
      { dailyMinutes: 60, preferredTime: "18:00" },
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks.map((block) => block.subtaskId)).toEqual(["outline"]);
  });

  it("respects postponement and locked blocks", () => {
    const result = buildSchedule(
      [{ ...subtasks[0], postponedUntil: "2026-11-21" }, subtasks[1]],
      "2026-11-23T23:00",
      { dailyMinutes: 90, preferredTime: "18:00" },
      new Date("2026-11-20T09:00:00"),
      [
        {
          date: "2026-11-21",
          durationMinutes: 30,
          id: "locked-research",
          locked: true,
          startTime: "20:00",
          subtaskId: "research",
        },
      ],
    );

    expect(
      result.blocks.find((block) => block.id === "locked-research"),
    ).toMatchObject({
      date: "2026-11-21",
      id: "locked-research",
      locked: true,
      startTime: "20:00",
    });
    expect(result.blocks.every((block) => block.date >= "2026-11-21")).toBe(
      true,
    );
  });

  it("keeps blocked dependency chains visible as unscheduled work", () => {
    const result = buildSchedule(
      [{ ...subtasks[0], status: "blocked" }, subtasks[1]],
      "2026-11-23T23:00",
      { dailyMinutes: 90, preferredTime: "18:00" },
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks).toHaveLength(0);
    expect(result.unscheduledMinutes).toBe(90);
  });

  it("calculates deadline capacity shortfall", () => {
    expect(
      calculateDeadlineRisk(
        subtasks,
        "2026-11-20T23:00",
        { dailyMinutes: 30, preferredTime: "18:00" },
        new Date("2026-11-20T09:00:00"),
      ),
    ).toMatchObject({
      capacityMinutes: 30,
      remainingMinutes: 90,
      shortfallMinutes: 60,
    });
  });
});
