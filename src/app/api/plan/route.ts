import { ZodError } from "zod";

import { assignmentInputSchema } from "@/features/pacepal/model";
import { PlanValidationError } from "@/features/pacepal/planning/engine";
import {
  classifyPlanValidation,
  planningFailure,
  PlanningRequestError,
} from "@/features/pacepal/planning/provider-error";
import { createTaskPlan } from "@/features/pacepal/planning/service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const input = assignmentInputSchema.parse(await request.json());
    return Response.json(await createTaskPlan(input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid assignment." }, { status: 400 });
    }
    if (error instanceof PlanningRequestError) {
      const failure = planningFailure(error.reason);
      return Response.json(failure.body, { status: failure.status });
    }
    if (error instanceof PlanValidationError) {
      const failure = planningFailure(classifyPlanValidation(error.issues));
      return Response.json(failure.body, { status: failure.status });
    }
    console.error("Unexpected plan API failure", error);
    return Response.json({ error: "Planning failed." }, { status: 500 });
  }
}
