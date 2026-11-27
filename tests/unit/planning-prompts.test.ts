import { describe, expect, it } from "vitest";

import type { Assignment, Subtask } from "@/features/pacepal/model";
import {
  requestedTaskGroupingCount,
  parseTaskSplitTitles,
  requestsTaskCount,
  requestsTaskSplit,
  resolveTaskSplitSourceIndex,
} from "@/features/pacepal/planning/prompts";

function splitAssignment(): Assignment {
  const task = (index: number, values: Partial<Subtask>): Subtask => ({
    id: `task-${index}`,
    title: `Task ${index}`,
    description: "",
    estimatedMinutes: 30,
    completionCriteria: "Done",
    difficulty: "medium",
    dependencies: [],
    status: "todo",
    actualMinutes: 0,
    activeSince: null,
    postponedUntil: null,
    ...values,
  });
  return {
    id: "project-1",
    createdAt: "2026-11-27T00:00:00.000Z",
    status: "scheduled",
    title: "Research paper",
    requirements: "",
    deliverable: "",
    deadline: "2026-12-10T18:00:00.000Z",
    priority: "medium",
    subtasks: [
      task(1, { title: "确定论文题目", description: "收缩研究范围" }),
      task(2, {
        title: "检索并建立可靠资料清单",
        description: "检索地方志与学术文献，记录出处。",
      }),
      task(3, {
        title: "梳理研究文献与解释框架",
        description: "阅读研究文献并制作矩阵。",
      }),
    ],
    availability: { dailyMinutes: 60, preferredTime: "18:00" },
    schedule: [],
    unscheduledMinutes: 90,
    checkIn: { availableMinutes: 30, energy: "medium" },
    scheduleNotice: "",
    chatMessages: [],
    language: "zh",
    planVersion: 1,
    planHistory: [],
  };
}

describe("task grouping intent", () => {
  it.each([
    ["把这10个任务合理合并成6个步骤。", 6],
    ["整理为六项，但不要丢掉任何内容。", 6],
    ["Merge these tasks into exactly 6 steps.", 6],
    ["这些任务分别是什么？", null],
  ])("extracts a target count from %s", (message, expected) => {
    expect(requestedTaskGroupingCount(message)).toBe(expected);
  });
});

describe("task split intent", () => {
  it.each([
    ["把文献检索进一步拆细。", true],
    ["我觉得文献检索这一步太大了，能不能拆得更细一点？", true],
    ["Break the drafting task down into smaller steps.", true],
    ["文献检索一共有几步？", false],
  ])("recognizes %s", (message, expected) => {
    expect(requestsTaskSplit(message)).toBe(expected);
  });

  it("resolves a loosely named task without asking the model for its id", () => {
    const assignment = splitAssignment();
    expect(
      resolveTaskSplitSourceIndex(
        assignment,
        "我觉得文献检索这一步还是太大了，请拆得更细。",
      ),
    ).toBe(2);
  });

  it.each([
    ["查找数据库\n筛选来源\n记录引文", 3],
    ['["查找数据库","筛选来源","记录引文"]', 3],
    ['{"titles":["查找数据库","筛选来源"]}', 2],
    ["1. 查找数据库 2. 筛选来源 3. 记录引文", 3],
  ])("parses common title-only outputs", (output, count) => {
    expect(parseTaskSplitTitles(output)).toHaveLength(count);
  });
});

describe("task count intent", () => {
  it.each([
    ["现在一共有多少个子任务？", true],
    ["How many tasks are in this project?", true],
    ["把任务数量调整一下。", false],
  ])("recognizes %s", (message, expected) => {
    expect(requestsTaskCount(message)).toBe(expected);
  });
});
