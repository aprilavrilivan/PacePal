import type { Assignment, AssignmentInput } from "@/features/pacepal/model";
import {
  planApiResponseSchema,
  refinementApiResponseSchema,
  refinementRequestSchema,
  type PlanApiResponse,
  type RefinementApiResponse,
} from "@/features/pacepal/planning/contracts";

type PlanningClientErrorOptions = {
  code: string | null;
  reason: string | null;
  status: number;
};

export class PlanningClientError extends Error {
  readonly code: string | null;
  readonly reason: string | null;
  readonly status: number;

  constructor(message: string, options: PlanningClientErrorOptions) {
    super(message);
    this.name = "PlanningClientError";
    this.code = options.code;
    this.reason = options.reason;
    this.status = options.status;
  }
}

async function planningError(response: Response) {
  try {
    const value = (await response.json()) as {
      code?: unknown;
      error?: unknown;
      reason?: unknown;
    };
    return new PlanningClientError(
      typeof value.error === "string" ? value.error : "Request failed.",
      {
        code: typeof value.code === "string" ? value.code : null,
        reason: typeof value.reason === "string" ? value.reason : null,
        status: response.status,
      },
    );
  } catch {
    return new PlanningClientError("Request failed.", {
      code: null,
      reason: null,
      status: response.status,
    });
  }
}

async function postPlanningRequest(url: string, body: unknown) {
  try {
    return await fetch(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    throw new PlanningClientError("当前 AI 模型不可用，请稍后重试。", {
      code: "model_unavailable",
      reason: "network",
      status: 0,
    });
  }
}

export async function requestPlan(
  input: AssignmentInput,
): Promise<PlanApiResponse> {
  const response = await postPlanningRequest("/api/plan", input);
  if (!response.ok) throw await planningError(response);
  return planApiResponseSchema.parse(await response.json());
}

export async function requestRefinement(
  assignment: Assignment,
  message: string,
): Promise<RefinementApiResponse> {
  const input = refinementRequestSchema.parse({ assignment, message });
  const response = await postPlanningRequest("/api/refine", input);
  if (!response.ok) throw await planningError(response);
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
