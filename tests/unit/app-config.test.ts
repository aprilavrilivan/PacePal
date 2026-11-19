import { describe, expect, it } from "vitest";

import { appConfig } from "@/lib/app-config";

describe("appConfig", () => {
  it("exposes the PacePal product identity", () => {
    expect(appConfig.name).toBe("PacePal");
  });
});
