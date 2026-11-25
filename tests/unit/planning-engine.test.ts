import { describe, expect, it } from "vitest";

import type { Assignment } from "@/features/pacepal/model";
import type { InitialPlanDecision } from "@/features/pacepal/planning/contracts";
import {
  applyPlanOperations,
  materializeInitialPlan,
  PlanValidationError,
  validateDraftPhases,
  validateSubtasks,
} from "@/features/pacepal/planning/engine";
import { generateMockInitialDecision } from "@/features/pacepal/planning/mock-model";

const input = {
  title: "Research paper",
  requirements: "Compare two approaches using academic evidence.",
  deliverable: "3000-word paper",
  deadline: "2026-12-10T18:00",
  priority: "high" as const,
};

function assignment(): Assignment {
  const plan = materializeInitialPlan(
    input,
    generateMockInitialDecision(input),
    new Date("2026-11-25T00:00:00.000Z"),
  );
  return {
    ...input,
    id: "assignment-1",
    createdAt: "2026-11-25T00:00:00.000Z",
    status: "scheduled",
    subtasks: plan.subtasks,
    availability: { dailyMinutes: 60, preferredTime: "18:00" },
    schedule: [],
    unscheduledMinutes: 0,
    checkIn: { availableMinutes: 30, energy: "medium" },
    scheduleNotice: "",
    chatMessages: [],
    language: plan.language,
    planVersion: plan.planVersion,
    planHistory: plan.planHistory,
  };
}

describe("initial plan materialization", () => {
  it("creates stable ids, phases, explicit priorities, and a valid dependency graph", () => {
    const decision = generateMockInitialDecision(input);
    const first = materializeInitialPlan(input, decision);
    const second = materializeInitialPlan(input, decision);

    expect(first.subtasks.map((task) => task.id)).toEqual(
      second.subtasks.map((task) => task.id),
    );
    expect(first.subtasks).toHaveLength(8);
    expect(
      first.subtasks.every((task) => task.phase && task.taskPriority),
    ).toBe(true);
    expect(() => validateSubtasks(first.subtasks)).not.toThrow();
    expect(first.planHistory[0]).toMatchObject({
      source: "initial",
      version: 1,
    });
  });

  it("rejects missing and circular dependency references", () => {
    const decision: InitialPlanDecision = {
      language: "en",
      taskUnderstanding: "A deliberately invalid plan.",
      assumptions: [],
      phases: [
        {
          id: "phase",
          title: "Phase",
          tasks: [
            {
              tempId: "a",
              title: "A",
              description: "A task",
              estimatedMinutes: 20,
              completionCriteria: "A is done",
              difficulty: "low",
              priority: "medium",
              dependencies: ["b"],
            },
            {
              tempId: "b",
              title: "B",
              description: "B task",
              estimatedMinutes: 20,
              completionCriteria: "B is done",
              difficulty: "low",
              priority: "medium",
              dependencies: ["a"],
            },
            {
              tempId: "c",
              title: "C",
              description: "C task",
              estimatedMinutes: 20,
              completionCriteria: "C is done",
              difficulty: "low",
              priority: "medium",
              dependencies: ["missing"],
            },
          ],
        },
      ],
    };

    expect(() => validateDraftPhases(decision.phases)).toThrow(
      PlanValidationError,
    );
  });
});

describe("atomic plan operations", () => {
  it("applies a progress update, preserves task ids, and records a new version", () => {
    const current = assignment();
    const target = current.subtasks[0]!;
    const result = applyPlanOperations(
      current,
      [
        { type: "set_status", taskId: target.id, status: "completed" },
        { type: "reschedule" },
      ],
      {
        language: "en",
        summary: "The first task is complete.",
        now: new Date("2026-11-25T10:00:00.000Z"),
      },
    );

    expect(result.assignment.subtasks[0]).toMatchObject({
      id: target.id,
      status: "completed",
    });
    expect(result.assignment.planVersion).toBe(2);
    expect(result.assignment.planHistory?.at(-1)).toMatchObject({
      operationTypes: ["set_status", "reschedule"],
      source: "assistant",
      version: 2,
    });
  });

  it("is atomic when a later operation is invalid", () => {
    const current = assignment();
    const original = structuredClone(current);

    expect(() =>
      applyPlanOperations(
        current,
        [
          {
            type: "update_task",
            taskId: current.subtasks[0]!.id,
            changes: { title: "Changed" },
          },
          { type: "set_status", taskId: "missing", status: "completed" },
        ],
        { language: "en", summary: "Invalid batch" },
      ),
    ).toThrow(PlanValidationError);
    expect(current).toEqual(original);
  });

  it("protects completed work from rewriting and deletion", () => {
    const current = assignment();
    current.subtasks[0]!.status = "completed";
    const id = current.subtasks[0]!.id;

    expect(() =>
      applyPlanOperations(
        current,
        [{ type: "update_task", taskId: id, changes: { title: "Rewrite" } }],
        { language: "en", summary: "Rewrite completed work" },
      ),
    ).toThrow(/cannot be rewritten/i);
    expect(() =>
      applyPlanOperations(current, [{ type: "delete_task", taskId: id }], {
        language: "en",
        summary: "Delete completed work",
      }),
    ).toThrow(/cannot be deleted/i);
  });

  it("splits one unfinished task while preserving progress and downstream dependencies", () => {
    const current = assignment();
    const target = current.subtasks[1]!;
    target.status = "in_progress";
    target.actualMinutes = 15;
    const dependent = current.subtasks.find((task) =>
      task.dependencies.includes(target.id),
    )!;
    const result = applyPlanOperations(
      current,
      [
        {
          type: "split_task",
          taskId: target.id,
          tasks: [
            {
              tempId: "new-scope",
              phase: target.phase ?? "Execution",
              title: "Scope the approach",
              description: "Decide the exact approach.",
              estimatedMinutes: 15,
              completionCriteria: "The approach is selected.",
              difficulty: "low",
              priority: "high",
              dependencies: [...target.dependencies],
            },
            {
              tempId: "new-document",
              phase: target.phase ?? "Execution",
              title: "Document the approach",
              description: "Write down the selected approach.",
              estimatedMinutes: 20,
              completionCriteria: "The approach is documented.",
              difficulty: "medium",
              priority: "high",
              dependencies: ["new-scope"],
            },
          ],
        },
      ],
      { language: "en", summary: "Split the difficult step." },
    );

    const scope = result.assignment.subtasks.find(
      (task) => task.title === "Scope the approach",
    )!;
    const document = result.assignment.subtasks.find(
      (task) => task.title === "Document the approach",
    )!;
    expect(scope).toMatchObject({ actualMinutes: 15, status: "in_progress" });
    expect(document.dependencies).toContain(scope.id);
    expect(
      result.assignment.subtasks.find((task) => task.id === dependent.id)
        ?.dependencies,
    ).toContain(document.id);
    expect(
      result.assignment.subtasks.some((task) => task.id === target.id),
    ).toBe(false);
  });
});
