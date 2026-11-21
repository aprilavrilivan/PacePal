import { z } from "zod";

import {
  assignmentSchema,
  availabilitySchema,
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

export const refinementOutputSchema = z.object({
  assistantMessage: z.string().trim().min(1),
  changed: z.boolean(),
  subtasks: z.array(refinedTaskSchema).min(1).max(16),
  availability: availabilitySchema,
});

export const refinementRequestSchema = z.object({
  assignment: assignmentSchema,
  message: z.string().trim().min(1).max(1000),
});

export const refinementResponseSchema = refinementOutputSchema.extend({
  fallback: z.boolean(),
  fallbackReason: z.string().nullable().default(null),
  model: z.string().nullable(),
});

export type RefinementOutput = z.infer<typeof refinementOutputSchema>;
export type RefinementResponse = z.infer<typeof refinementResponseSchema>;

export async function requestRefinement(
  assignment: Assignment,
  message: string,
): Promise<RefinementResponse> {
  const input = refinementRequestSchema.parse({ assignment, message });
  const response = await fetch("/api/refine", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) throw new Error("Refinement request failed.");
  return refinementResponseSchema.parse(await response.json());
}

export function mergeRefinement(
  assignment: Assignment,
  output: RefinementOutput,
): Assignment {
  const existing = new Map(
    assignment.subtasks.map((subtask) => [subtask.id, subtask]),
  );
  const usedIds = new Set<string>();

  const subtasks: Subtask[] = output.subtasks.map((task, index) => {
    let id = task.id;
    while (usedIds.has(id)) id = `${task.id}-${index + 1}`;
    usedIds.add(id);

    const previous = existing.get(task.id);
    return {
      ...task,
      id,
      actualMinutes: previous?.actualMinutes ?? 0,
      activeSince: previous?.activeSince ?? null,
      postponedUntil: previous?.postponedUntil ?? null,
      status: previous?.status ?? "todo",
    };
  });

  const validIds = new Set(subtasks.map((task) => task.id));
  const normalized = subtasks.map((task) => ({
    ...task,
    dependencies: task.dependencies.filter(
      (dependency) => dependency !== task.id && validIds.has(dependency),
    ),
  }));

  return {
    ...assignment,
    availability: output.availability,
    subtasks: normalized,
  };
}
