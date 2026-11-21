import { describe, expect, it } from "vitest";

import type { Assignment } from "@/features/pacepal/model";
import { generateMockRefinement } from "@/features/pacepal/mock-refiner";
import { mergeRefinement } from "@/features/pacepal/refinement";

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
      actualMinutes: 12,
      activeSince: null,
      completionCriteria: "Notes are ready",
      dependencies: [],
      description: "Read the selected sources",
      difficulty: "medium",
      estimatedMinutes: 60,
      id: "research",
      postponedUntil: null,
      status: "paused",
      title: "Research",
    },
  ],
  title: "Course report",
  unscheduledMinutes: 0,
};

describe("plan refinement", () => {
  it("adjusts daily availability in mock mode", () => {
    const output = generateMockRefinement(assignment, "我每天只有 30 分钟可用");

    expect(output.changed).toBe(true);
    expect(output.availability.dailyMinutes).toBe(30);
  });

  it("preserves execution records while merging AI task changes", () => {
    const output = generateMockRefinement(assignment, "这个任务太大，拆小一点");
    const merged = mergeRefinement(assignment, output);

    expect(merged.subtasks).toHaveLength(2);
    expect(merged.subtasks[0]).toMatchObject({
      actualMinutes: 12,
      id: "research",
      status: "paused",
    });
    expect(merged.subtasks[1]).toMatchObject({
      actualMinutes: 0,
      status: "todo",
    });
  });
});
