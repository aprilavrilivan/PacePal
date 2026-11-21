import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAppStateOwner,
  loadAppState,
  loadAppStateOwner,
  pacePalStorageKey,
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

  it("adds execution defaults when loading a plan from an earlier stage", () => {
    window.localStorage.setItem(
      pacePalStorageKey,
      JSON.stringify({
        version: 1,
        assignment: {
          id: "assignment-1",
          title: "Research report",
          requirements: "Compare two methods",
          deliverable: "Report",
          deadline: "2026-12-15T18:00",
          priority: "high",
          createdAt: "2026-11-20T10:00:00.000Z",
          status: "scheduled",
          subtasks: [
            {
              id: "task-1",
              title: "Read sources",
              description: "Review the selected papers",
              estimatedMinutes: 30,
              completionCriteria: "Notes are complete",
              difficulty: "medium",
              dependencies: [],
              status: "todo",
            },
          ],
          availability: { dailyMinutes: 60, preferredTime: "18:00" },
          schedule: [
            {
              id: "block-1",
              subtaskId: "task-1",
              date: "2026-11-21",
              startTime: "18:00",
              durationMinutes: 30,
            },
          ],
          unscheduledMinutes: 0,
        },
      }),
    );

    const state = loadAppState();

    expect(state.version).toBe(2);
    expect(state.assignments).toHaveLength(1);
    expect(state.selectedAssignmentId).toBe("assignment-1");
    expect(state.assignments[0]?.checkIn).toEqual({
      availableMinutes: 30,
      energy: "medium",
    });
    expect(state.assignments[0]?.scheduleNotice).toBe("");
    expect(state.assignments[0]?.subtasks[0]).toMatchObject({
      actualMinutes: 0,
      activeSince: null,
      postponedUntil: null,
    });
    expect(state.assignments[0]?.schedule[0].locked).toBe(false);
  });
});
