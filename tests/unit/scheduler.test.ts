import { describe, expect, it } from "vitest";

import type { Subtask } from "@/features/pacepal/model";
import { buildSchedule } from "@/features/pacepal/scheduler";

function task(id: string, dependencies: string[] = []): Subtask {
  return {
    actualMinutes: 0,
    activeSince: null,
    completionCriteria: `${id} done`,
    dependencies,
    description: id,
    difficulty: "medium",
    estimatedMinutes: 60,
    id,
    postponedUntil: null,
    status: "todo",
    title: id,
  };
}

describe("buildSchedule", () => {
  it("places one dependency-ordered subtask per day when the deadline allows", () => {
    const result = buildSchedule(
      [task("research"), task("outline", ["research"])],
      "2026-11-22T23:00",
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.map((block) => block.subtaskId)).toEqual([
      "research",
      "outline",
    ]);
    expect(result.blocks.map((block) => block.date)).toEqual([
      "2026-11-20",
      "2026-11-21",
    ]);
  });

  it("puts multiple whole subtasks on a day only when required by the deadline", () => {
    const result = buildSchedule(
      Array.from({ length: 5 }, (_, index) => task(`task-${index + 1}`)),
      "2026-11-21T23:00",
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks).toHaveLength(5);
    expect(
      result.blocks.filter((block) => block.date === "2026-11-20"),
    ).toHaveLength(3);
    expect(
      result.blocks.filter((block) => block.date === "2026-11-21"),
    ).toHaveLength(2);
  });

  it("never splits a long subtask across days", () => {
    const result = buildSchedule(
      [{ ...task("long-task"), estimatedMinutes: 600 }],
      "2026-11-25T23:00",
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      date: "2026-11-20",
      durationMinutes: 600,
      subtaskId: "long-task",
    });
  });

  it("does not schedule completed or blocked dependency chains", () => {
    const result = buildSchedule(
      [
        { ...task("done"), status: "completed" },
        { ...task("blocked"), status: "blocked" },
        task("dependent", ["blocked"]),
      ],
      "2026-11-25T23:00",
      new Date("2026-11-20T09:00:00"),
    );

    expect(result.blocks).toHaveLength(0);
  });

  it("keeps a manually moved task and schedules every other task once", () => {
    const result = buildSchedule(
      [task("research"), task("outline", ["research"])],
      "2026-11-23T23:00",
      new Date("2026-11-20T09:00:00"),
      [
        {
          date: "2026-11-22",
          durationMinutes: 60,
          id: "manual-research",
          locked: true,
          startTime: "14:00",
          subtaskId: "research",
        },
      ],
    );

    expect(result.blocks).toHaveLength(2);
    expect(
      result.blocks.find((block) => block.id === "manual-research"),
    ).toMatchObject({ date: "2026-11-22", locked: true, startTime: "14:00" });
    expect(
      result.blocks.filter((block) => block.subtaskId === "research"),
    ).toHaveLength(1);
  });

  it("collapses legacy split blocks into one block per subtask", () => {
    const source = { ...task("legacy"), estimatedMinutes: 180 };
    const result = buildSchedule(
      [source],
      "2026-11-23T23:00",
      new Date("2026-11-20T09:00:00"),
      [
        {
          date: "2026-11-20",
          durationMinutes: 60,
          id: "legacy-1",
          locked: false,
          startTime: "09:00",
          subtaskId: source.id,
        },
        {
          date: "2026-11-21",
          durationMinutes: 60,
          id: "legacy-2",
          locked: false,
          startTime: "09:00",
          subtaskId: source.id,
        },
      ],
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      date: "2026-11-20",
      durationMinutes: 180,
      id: "legacy-1",
    });
  });
});
