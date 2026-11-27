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
            code: "timeout",
            error: "AI 响应超时，请重试。",
            reason: "timeout",
            retryable: true,
          }),
          {
            headers: { "content-type": "application/json" },
            status: 504,
          },
        ),
      ),
    );

    await expect(requestPlan(assignment)).rejects.toMatchObject({
      code: "timeout",
      message: "AI 响应超时，请重试。",
      reason: "timeout",
      retryable: true,
      status: 504,
    });
  });

  it("turns a network failure into a retryable client error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const error = await requestPlan(assignment).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(PlanningClientError);
    expect(error).toMatchObject({
      code: "network_error",
      reason: "network",
      retryable: true,
      status: 0,
    });
  });
});
