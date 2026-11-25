import { describe, expect, it } from "vitest";

import {
  PlanningTimeoutError,
  withPlanningTimeout,
} from "@/features/pacepal/planning/timeout";

describe("withPlanningTimeout", () => {
  it("rejects on its own deadline and aborts the provider request", async () => {
    let signal: AbortSignal | undefined;

    await expect(
      withPlanningTimeout((requestSignal) => {
        signal = requestSignal;
        return new Promise<string>(() => undefined);
      }, 5),
    ).rejects.toBeInstanceOf(PlanningTimeoutError);

    expect(signal?.aborted).toBe(true);
  });

  it("returns a provider result before the deadline", async () => {
    await expect(withPlanningTimeout(async () => "planned", 100)).resolves.toBe(
      "planned",
    );
  });
});
