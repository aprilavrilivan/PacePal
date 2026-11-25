import type { Assignment, AssignmentInput } from "@/features/pacepal/model";
import {
  planApiResponseSchema,
  refinementApiResponseSchema,
  refinementRequestSchema,
  type PlanApiResponse,
  type RefinementApiResponse,
} from "@/features/pacepal/planning/contracts";

async function errorMessage(response: Response) {
  try {
    const value = (await response.json()) as { error?: unknown };
    return typeof value.error === "string" ? value.error : "Request failed.";
  } catch {
    return "Request failed.";
  }
}

export async function requestPlan(
  input: AssignmentInput,
): Promise<PlanApiResponse> {
  const response = await fetch("/api/plan", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return planApiResponseSchema.parse(await response.json());
}

export async function requestRefinement(
  assignment: Assignment,
  message: string,
): Promise<RefinementApiResponse> {
  const input = refinementRequestSchema.parse({ assignment, message });
  const response = await fetch("/api/refine", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return refinementApiResponseSchema.parse(await response.json());
}

export function mergeValidatedPlan(
  assignment: Assignment,
  response: RefinementApiResponse,
): Assignment {
  return {
    ...assignment,
    ...response.plan,
  };
}
