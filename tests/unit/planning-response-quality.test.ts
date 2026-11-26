import { describe, expect, it } from "vitest";

import { assistantMessageValidationError } from "@/features/pacepal/planning/response-quality";

describe("planning response quality", () => {
  it.each([
    "理由和具体做法如下。",
    "核心区别可以这样讲：",
    "The tradeoffs are as follows.",
  ])("rejects an unfinished introduction: %s", (message) => {
    expect(assistantMessageValidationError(message)).not.toBe("");
  });

  it("accepts a complete answer", () => {
    expect(
      assistantMessageValidationError(
        "建议按机制组织正文，并在每一节内部按时间顺序展开。",
      ),
    ).toBe("");
  });
});
