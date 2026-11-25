import { ZodError } from "zod";

import { assignmentInputSchema } from "@/features/pacepal/model";
import { createTaskPlan } from "@/features/pacepal/planning/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = assignmentInputSchema.parse(await request.json());
    return Response.json(await createTaskPlan(input));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid assignment." }, { status: 400 });
    }
    console.error("Unexpected plan API failure", error);
    return Response.json({ error: "Planning failed." }, { status: 500 });
  }
}
