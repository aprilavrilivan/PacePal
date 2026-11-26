import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PlanningClientError,
  requestPlan,
} from "@/features/pacepal/planning/client";

const assignment = {
  deadline: "2026-12-15T18:00",
  deliverable: "课程论文",
  priority: "medium" as const,
  requirements: "完成资料整理、初稿和复核。",
  title: "课程论文",
};

describe("planning client errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves the retryable provider error metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "model_unavailable",
            error: "当前 AI 模型不可用，请稍后重试。",
            reason: "timeout",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 503,
          },
        ),
      ),
    );

    await expect(requestPlan(assignment)).rejects.toMatchObject({
      code: "model_unavailable",
      message: "当前 AI 模型不可用，请稍后重试。",
      reason: "timeout",
      status: 503,
    });
  });

  it("turns a network failure into a retryable client error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const error = await requestPlan(assignment).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(PlanningClientError);
    expect(error).toMatchObject({
      code: "model_unavailable",
      reason: "network",
      status: 0,
    });
  });
});
