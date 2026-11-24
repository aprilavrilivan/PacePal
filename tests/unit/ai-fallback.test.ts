import { describe, expect, it } from "vitest";

import { refinementFallback } from "@/features/pacepal/ai-fallback";

describe("refinementFallback", () => {
  it("explains the real provider failure and summarizes safe local changes", () => {
    const result = refinementFallback(
      {
        assistantMessage:
          "我理解为只保留实验和写作两个步骤，并已将其他步骤标为完成。",
        changed: true,
        operations: [],
      },
      "quota",
    );

    expect(result.assistantMessage).toContain("调用频率或额度限制");
    expect(result.assistantMessage).toContain("只保留实验和写作两个步骤");
    expect(result.assistantMessage).not.toContain("主模型繁忙");
    expect(result.fallback).toBe(true);
    expect(result.model).toBeNull();
  });

  it("does not claim a plan changed when the fallback cannot infer safely", () => {
    const result = refinementFallback(
      {
        assistantMessage: "当前信息不足。",
        changed: false,
        operations: [],
      },
      "invalid-output",
    );

    expect(result.assistantMessage).toContain("计划格式未通过完整校验");
    expect(result.assistantMessage).toContain("没有更改你的计划");
    expect(result.changed).toBe(false);
  });

  it("does not misreport transient provider failures as API-key failures", () => {
    const result = refinementFallback(
      {
        assistantMessage: "已安全调整明确的进度。",
        changed: true,
        operations: [],
      },
      "unavailable",
    );

    expect(result.assistantMessage).toContain("Gemini 当前未能及时响应");
    expect(result.assistantMessage).not.toContain("密钥");
  });
});
