import { z } from "zod";

import {
  assignmentSchema,
  availabilitySchema,
  subtaskStatusSchema,
  type Assignment,
  type Subtask,
} from "@/features/pacepal/model";

export const refinedTaskSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  estimatedMinutes: z.number().int().min(5).max(600),
  completionCriteria: z.string().trim().min(1),
  difficulty: z.enum(["low", "medium", "high"]),
  dependencies: z.array(z.string()),
});

const taskPatchSchema = refinedTaskSchema
  .omit({ id: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "A task update must change at least one field.",
  });

export const refinementOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_status"),
    taskId: z.string().trim().min(1),
    status: subtaskStatusSchema,
  }),
  z.object({
    type: z.literal("update_task"),
    taskId: z.string().trim().min(1),
    patch: taskPatchSchema,
  }),
  z.object({
    type: z.literal("add_task"),
    afterTaskId: z.string().trim().min(1).nullable().default(null),
    task: refinedTaskSchema,
  }),
  z.object({
    type: z.literal("remove_task"),
    taskId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("reorder_tasks"),
    taskIds: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    type: z.literal("set_availability"),
    availability: availabilitySchema.partial(),
  }),
  z.object({ type: z.literal("reschedule") }),
]);

export const refinementOutputSchema = z.object({
  assistantMessage: z.string().trim().min(1),
  changed: z.boolean(),
  operations: z.array(refinementOperationSchema).max(24),
});

export const refinementRequestSchema = z.object({
  assignment: assignmentSchema,
  message: z.string().trim().min(1).max(4000),
});

export const refinementResponseSchema = refinementOutputSchema.extend({
  fallback: z.boolean(),
  fallbackReason: z.string().nullable().default(null),
  model: z.string().nullable(),
});

export type RefinementOperation = z.infer<typeof refinementOperationSchema>;
export type RefinementOutput = z.infer<typeof refinementOutputSchema>;
export type RefinementResponse = z.infer<typeof refinementResponseSchema>;

function uniqueId(proposed: string, usedIds: Set<string>) {
  let id = proposed;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${proposed}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeDependencies(subtasks: Subtask[]) {
  const ids = new Set(subtasks.map((task) => task.id));
  const completedIds = new Set(
    subtasks
      .filter((task) => task.status === "completed")
      .map((task) => task.id),
  );
  const earlierIds = new Set<string>();

  return subtasks.map((task) => {
    const normalized = {
      ...task,
      dependencies: task.dependencies.filter(
        (dependency) =>
          dependency !== task.id &&
          ids.has(dependency) &&
          (earlierIds.has(dependency) || completedIds.has(dependency)),
      ),
    };
    earlierIds.add(task.id);
    return normalized;
  });
}

export async function requestRefinement(
  assignment: Assignment,
  message: string,
): Promise<RefinementResponse> {
  const input = refinementRequestSchema.parse({ assignment, message });
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/refine", {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) throw new Error("Refinement request failed.");
      return refinementResponseSchema.parse(await response.json());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Refinement request failed.");
}

export function applyRefinement(
  assignment: Assignment,
  output: RefinementOutput,
): Assignment {
  let subtasks = assignment.subtasks.map((task) => ({ ...task }));
  let availability = { ...assignment.availability };

  for (const operation of output.operations) {
    if (operation.type === "set_status") {
      subtasks = subtasks.map((task) =>
        task.id === operation.taskId && task.status !== "completed"
          ? {
              ...task,
              activeSince:
                operation.status === "in_progress" ? task.activeSince : null,
              postponedUntil:
                operation.status === "postponed" ? task.postponedUntil : null,
              status: operation.status,
            }
          : task,
      );
      continue;
    }

    if (operation.type === "update_task") {
      subtasks = subtasks.map((task) =>
        task.id === operation.taskId && task.status !== "completed"
          ? { ...task, ...operation.patch }
          : task,
      );
      continue;
    }

    if (operation.type === "add_task") {
      const usedIds = new Set(subtasks.map((task) => task.id));
      const id = uniqueId(operation.task.id, usedIds);
      const task: Subtask = {
        ...operation.task,
        id,
        actualMinutes: 0,
        activeSince: null,
        postponedUntil: null,
        status: "todo",
      };
      const afterIndex = operation.afterTaskId
        ? subtasks.findIndex((item) => item.id === operation.afterTaskId)
        : -1;
      const insertAt = afterIndex >= 0 ? afterIndex + 1 : subtasks.length;
      subtasks = [
        ...subtasks.slice(0, insertAt),
        task,
        ...subtasks.slice(insertAt),
      ];
      continue;
    }

    if (operation.type === "remove_task") {
      const target = subtasks.find((task) => task.id === operation.taskId);
      if (target?.status !== "completed" && subtasks.length > 1) {
        subtasks = subtasks.filter((task) => task.id !== operation.taskId);
      }
      continue;
    }

    if (operation.type === "reorder_tasks") {
      const order = new Map(
        operation.taskIds.map((taskId, index) => [taskId, index]),
      );
      const reorderedPending = subtasks
        .filter((task) => task.status !== "completed")
        .sort((left, right) => {
          const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder;
        });
      let pendingIndex = 0;
      subtasks = subtasks.map((task) =>
        task.status === "completed"
          ? task
          : (reorderedPending[pendingIndex++] ?? task),
      );
      continue;
    }

    if (operation.type === "set_availability") {
      availability = { ...availability, ...operation.availability };
    }
  }

  return {
    ...assignment,
    availability,
    subtasks: normalizeDependencies(subtasks),
  };
}
