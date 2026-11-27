import { ZodError } from "zod";

import { refinementRequestSchema } from "@/features/pacepal/planning/contracts";
import { PlanValidationError } from "@/features/pacepal/planning/engine";
import {
  classifyPlanValidation,
  planningFailure,
  PlanningRequestError,
} from "@/features/pacepal/planning/provider-error";
import { refineTaskPlan } from "@/features/pacepal/planning/service";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const { assignment, message } = refinementRequestSchema.parse(
      await request.json(),
    );
    return Response.json(await refineTaskPlan(assignment, message));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid refinement." }, { status: 400 });
    }
    if (error instanceof PlanningRequestError) {
      const failure = planningFailure(error.reason);
      return Response.json(failure.body, { status: failure.status });
    }
    if (error instanceof PlanValidationError) {
      const failure = planningFailure(classifyPlanValidation(error.issues));
      return Response.json(failure.body, { status: failure.status });
    }
    console.error("Unexpected refinement API failure", error);
    return Response.json({ error: "Refinement failed." }, { status: 500 });
  }
}
