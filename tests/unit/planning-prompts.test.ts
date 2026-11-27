import { describe, expect, it } from "vitest";

import { requestedTaskGroupingCount } from "@/features/pacepal/planning/prompts";

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
