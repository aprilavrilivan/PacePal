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
      assistantMessage: "已更新可用时间，并重新计算后续日程。",
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

  it("turns a blocker into an actual task state change when the model only reschedules", () => {
    const output = normalizeGatewayRefinement(
      {
        assistantMessage: "已重新安排。",
        operations: [{ type: "reschedule" }],
      },
      assignment,
      "Research 卡住了，今天先做其他工作。",
    );

    expect(output.assistantMessage).toBe(
      "已将“Research”标记为卡住，并重新安排其他可执行任务。",
    );
    expect(output.operations).toEqual([
      { status: "blocked", taskId: "research", type: "set_status" },
      { type: "reschedule" },
    ]);
  });

  it("completes a partial reorder and repairs dependencies for an explicit order", () => {
    const multiTaskAssignment: Assignment = {
      ...assignment,
      subtasks: [
        { ...assignment.subtasks[0], id: "sources", title: "核实史料" },
        {
          ...assignment.subtasks[0],
          dependencies: ["sources"],
          id: "outline",
          title: "论文大纲",
        },
        {
          ...assignment.subtasks[0],
          dependencies: ["outline"],
          id: "draft",
          title: "论文初稿",
        },
      ],
    };
    const output = normalizeGatewayRefinement(
      {
        assistantMessage: "已重新排序。",
        operations: [
          { type: "reorder_tasks", taskIds: ["outline", "sources"] },
        ],
      },
      multiTaskAssignment,
      "我已经有足够资料，请先写论文大纲，再核实史料。",
    );

    expect(output.assistantMessage).toBe(
      "已调整任务顺序和依赖关系，并重新计算后续日程。",
    );
    expect(output.operations).toEqual([
      {
        patch: { dependencies: [] },
        taskId: "outline",
        type: "update_task",
      },
      {
        taskIds: ["outline", "sources", "draft"],
        type: "reorder_tasks",
      },
      { type: "reschedule" },
    ]);
  });

  it("does not claim a reorder when only the calendar was recalculated", () => {
    const output = normalizeGatewayRefinement(
      {
        assistantMessage: "已重新排序任务。",
        operations: [{ type: "reschedule" }],
      },
      assignment,
      "重新平衡后续任务",
    );

    expect(output.assistantMessage).toBe(
      "已重新计算后续日程，任务内容和顺序保持不变。",
    );
  });
});
