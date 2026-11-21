import { z } from "zod";

import {
  assignmentInputSchema,
  subtaskSchema,
  type AssignmentInput,
  type Subtask,
} from "@/features/pacepal/model";

export const planApiResponseSchema = z.object({
  fallback: z.boolean(),
  model: z.string().nullable(),
  subtasks: z.array(subtaskSchema).min(1),
});

export type PlanApiResponse = z.infer<typeof planApiResponseSchema>;

export async function requestPlan(
  input: AssignmentInput,
): Promise<PlanApiResponse> {
  const assignment = assignmentInputSchema.parse(input);
  const response = await fetch("/api/plan", {
    body: JSON.stringify(assignment),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Plan request failed.");
  }

  return planApiResponseSchema.parse(await response.json());
}

export function buildSubtasks(
  assignment: AssignmentInput,
  generated: Array<
    Pick<
      Subtask,
      | "completionCriteria"
      | "description"
      | "difficulty"
      | "estimatedMinutes"
      | "title"
    >
  >,
): Subtask[] {
  const prefix = assignment.title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18);

  return generated.map((task, index) => {
    const id = `${prefix || "assignment"}-task-${index + 1}`;
    return {
      ...task,
      dependencies:
        index === 0 ? [] : [`${prefix || "assignment"}-task-${index}`],
      id,
      status: "todo",
      actualMinutes: 0,
      activeSince: null,
      postponedUntil: null,
    };
  });
}
