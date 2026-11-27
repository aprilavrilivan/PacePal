import { describe, expect, it } from "vitest";

import {
  requestedTaskGroupingCount,
  requestsTaskCount,
  requestsTaskSplit,
} from "@/features/pacepal/planning/prompts";

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
    ["Break the drafting task down into smaller steps.", true],
    ["文献检索一共有几步？", false],
  ])("recognizes %s", (message, expected) => {
    expect(requestsTaskSplit(message)).toBe(expected);
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
