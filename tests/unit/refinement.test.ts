import { describe, expect, it } from "vitest";

import type { Assignment } from "@/features/pacepal/model";
import { generateMockRefinement } from "@/features/pacepal/mock-refiner";
import { applyRefinement } from "@/features/pacepal/refinement";

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
    const refined = applyRefinement(assignment, output);

    expect(output.changed).toBe(true);
    expect(refined.availability.dailyMinutes).toBe(30);
  });

  it("preserves execution records while merging AI task changes", () => {
    const output = generateMockRefinement(assignment, "这个任务太大，拆小一点");
    const merged = applyRefinement(assignment, output);

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

  it("understands a natural progress update and completes the matching task", () => {
    const chineseAssignment: Assignment = {
      ...assignment,
      subtasks: [
        {
          ...assignment.subtasks[0],
          id: "topic",
          title: "拆解作业需求与定主题",
          description: "确定论文研究主题",
        },
        {
          ...assignment.subtasks[0],
          id: "sources",
          title: "查找并核实基础史料",
          description: "收集历史资料",
        },
      ],
    };
    const output = generateMockRefinement(
      chineseAssignment,
      "我已经完成了初步的论文主题规划和选取，你看一下。",
    );
    const refined = applyRefinement(chineseAssignment, output);

    expect(output.assistantMessage).toContain("拆解作业需求与定主题");
    expect(refined.subtasks[0]?.status).toBe("completed");
    expect(refined.subtasks[1]?.status).toBe("paused");
  });
});
