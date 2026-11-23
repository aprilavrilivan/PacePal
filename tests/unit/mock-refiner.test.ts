import { describe, expect, it } from "vitest";

import { generateMockRefinement } from "@/features/pacepal/mock-refiner";
import type { Assignment, Subtask } from "@/features/pacepal/model";

function task(
  id: string,
  title: string,
  status: Subtask["status"] = "todo",
  dependencies: string[] = [],
): Subtask {
  return {
    actualMinutes: 0,
    activeSince: null,
    completionCriteria: `完成${title}`,
    dependencies,
    description: title,
    difficulty: "medium",
    estimatedMinutes: 60,
    id,
    postponedUntil: null,
    status,
    title,
  };
}

const assignment: Assignment = {
  availability: { dailyMinutes: 60, preferredTime: "09:00" },
  chatMessages: [],
  checkIn: { availableMinutes: 30, energy: "medium" },
  createdAt: "2026-11-24T00:00:00.000Z",
  deadline: "2026-12-17T18:00",
  deliverable: "3000 字课程论文",
  id: "robust-refinement",
  priority: "high",
  requirements: "完成课程论文",
  schedule: [],
  scheduleNotice: "",
  status: "scheduled",
  subtasks: [
    task("topic", "拆解作业需求与定主题", "completed"),
    task("sources", "查找并核实基础史料", "todo", ["topic"]),
    task("outline", "撰写论文大纲", "todo", ["sources"]),
    task("draft", "撰写正文第一稿", "todo", ["outline"]),
    task("polish", "润色与格式检查", "todo", ["draft"]),
    task("submit", "最终提交前的核对", "todo", ["polish"]),
  ],
  title: "GEA 课程论文",
  unscheduledMinutes: 0,
};

describe("deterministic refinement safety layer", () => {
  it("separates completed work from the authoritative remaining clause", () => {
    const output = generateMockRefinement(
      assignment,
      "我已经完成选题、sources、outline 和 first draft。现在只剩 polish / format check 和 final submission review，其他都做完了，请按实际进度调整。",
    );

    const completedIds = output.operations.flatMap((operation) =>
      operation.type === "set_status" && operation.status === "completed"
        ? [operation.taskId]
        : [],
    );
    const reopenedIds = output.operations.flatMap((operation) =>
      operation.type === "reopen_task" ? [operation.taskId] : [],
    );

    expect(completedIds).toEqual(
      expect.arrayContaining(["sources", "outline", "draft"]),
    );
    expect(completedIds).not.toEqual(
      expect.arrayContaining(["polish", "submit"]),
    );
    expect(reopenedIds).not.toContain("topic");
    expect(output.operations).toContainEqual({
      taskIds: ["polish", "submit"],
      type: "reorder_tasks",
    });
  });

  it("does not let a current-time statement hide a blocker update", () => {
    const output = generateMockRefinement(
      assignment,
      "查找基础史料卡住了，明天才能拿到档案。今天有 120 分钟，请先安排不依赖档案、现在就能推进的工作。",
    );

    expect(output.operations).toContainEqual({
      status: "blocked",
      taskId: "sources",
      type: "set_status",
    });
    expect(output.operations).toContainEqual({ type: "reschedule" });
  });

  it("preserves an explicitly named completed task unless the user reopens it", () => {
    const output = generateMockRefinement(
      assignment,
      "选题已经完成，现在只剩润色与格式检查和最终提交前核对，其他都做完了。",
    );

    expect(output.operations).not.toContainEqual(
      expect.objectContaining({ taskId: "topic", type: "reopen_task" }),
    );
  });
});
