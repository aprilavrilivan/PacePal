import { ZodError } from "zod";

import { assignmentInputSchema } from "@/features/pacepal/model";
import { PlanningProviderError } from "@/features/pacepal/planning/provider-error";
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
    if (error instanceof PlanningProviderError) {
      return Response.json(
        {
          code: "model_unavailable",
          error: "当前 AI 模型不可用，请稍后重试。",
          reason: error.reason,
        },
        { status: 503 },
      );
    }
    console.error("Unexpected plan API failure", error);
    return Response.json({ error: "Planning failed." }, { status: 500 });
  }
}
