import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAppStateOwner,
  loadAppStateOwner,
  pacePalStorageOwnerKey,
  saveAppStateOwner,
} from "@/features/pacepal/storage";

describe("local state ownership", () => {
  beforeEach(() => window.localStorage.clear());

  it("records and clears the account that owns the local cache", () => {
    saveAppStateOwner("user-a");

    expect(loadAppStateOwner()).toBe("user-a");
    expect(window.localStorage.getItem(pacePalStorageOwnerKey)).toBe("user-a");

    clearAppStateOwner();
    expect(loadAppStateOwner()).toBeNull();
  });
});
