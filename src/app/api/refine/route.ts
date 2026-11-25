import { ZodError } from "zod";

import { refinementRequestSchema } from "@/features/pacepal/planning/contracts";
import { PlanningProviderError } from "@/features/pacepal/planning/provider-error";
import { refineTaskPlan } from "@/features/pacepal/planning/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (error instanceof PlanningProviderError) {
      return Response.json(
        {
          code: "model_unavailable",
          error: "当前 AI 模型不可用，请稍后重试。",
        },
        { status: 503 },
      );
    }
    console.error("Unexpected refinement API failure", error);
    return Response.json({ error: "Refinement failed." }, { status: 500 });
  }
}
